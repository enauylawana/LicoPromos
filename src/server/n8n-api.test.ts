import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./services.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services.js")>();
  return { ...original, runSearch: vi.fn(async () => ({ runId: "mock", foundCount: 0, mode: "quick" })) };
});

const apiKey = "n8n-test-key-with-at-least-24-characters";
let temporaryDirectory = "";
let app: typeof import("./index.js").app;
let db: typeof import("./db.js").db;
let sendDistribution: typeof import("./distribution.js").sendDistribution;
let offerId = "";

beforeAll(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lico-n8n-test-"));
  const databasePath = path.join(temporaryDirectory, "test.db");
  execFileSync("sqlite3", [databasePath], { input: fs.readFileSync(path.resolve("prisma/init.sql"), "utf8") });
  process.env.NODE_ENV = "test";
  process.env.DRY_RUN = "true";
  process.env.EXTERNAL_PUBLISHING_ENABLED = "false";
  process.env.N8N_API_KEY = apiKey;
  process.env.DATABASE_URL = `file:${databasePath}`;
  ({ app } = await import("./index.js"));
  ({ db } = await import("./db.js"));
  ({ sendDistribution } = await import("./distribution.js"));
  await db.store.create({ data: { id: "mercado_livre", name: "Mercado Livre", enabled: true } });
  const niche = await db.niche.create({ data: {
    name: "Informática", wantedKeywords: JSON.stringify(["notebook"]), minDiscount: 10,
    minRating: 4, minReviewCount: 10, enabledStores: JSON.stringify(["mercado_livre"]),
  } });
  const offer = await db.offer.create({ data: {
    externalId: "MLB123456", storeId: "mercado_livre", nicheId: niche.id,
    title: "Notebook Gamer 16 GB", originalUrl: "https://produto.mercadolivre.com.br/MLB123456",
    affiliateUrl: "https://meli.la/teste123", currentPrice: 3000, previousPrice: 4000,
    discountPercent: 25, rating: 4.8, reviewCount: 100, stock: 5, score: 80, status: "pending",
  } });
  offerId = offer.id;
  await db.setting.create({ data: { key: "distributionChannels", value: JSON.stringify([
    { id: "test-group", name: "Grupo de teste", type: "whatsapp", externalId: "test@g.us", enabled: true },
  ]) } });
});

afterAll(async () => {
  await db?.$disconnect();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

const authenticated = () => ({ "x-api-key": apiKey });

describe("API REST do n8n", () => {
  it("protege os endpoints com API key", async () => {
    const response = await request(app).get("/api/products/candidates");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("invalid_api_key");
  });

  it("inicia uma busca assíncrona e consulta o job", async () => {
    const started = await request(app).post("/api/search/run").set(authenticated()).send({ query: "notebook", limit: 5 });
    expect(started.status).toBe(202);
    expect(started.body.jobId).toBeTypeOf("string");
    const job = await request(app).get(`/api/search/jobs/${started.body.jobId}`).set(authenticated());
    expect(job.status).toBe(200);
    expect(job.body.status).toBe("running");
  });

  it("lista candidatos e valida aderência", async () => {
    const candidates = await request(app).get("/api/products/candidates?status=pending").set(authenticated());
    expect(candidates.status).toBe(200);
    expect(candidates.body.items).toHaveLength(1);
    const validation = await request(app).get(`/api/products/${offerId}/validate`).set(authenticated());
    expect(validation.status).toBe(200);
    expect(validation.body).toMatchObject({
      valid: true, nicheMatches: true, alreadyPublished: false, available: true,
      realPrice: true, confirmedAffiliateLink: true, currentPrice: 3000,
      affiliateUrl: "https://meli.la/teste123", stock: 5,
    });
  });

  it("exporta candidatos e libera um item oficial somente após receber meli.la", async () => {
    const official = await db.offer.create({ data: {
      externalId: "MLB-OFFICIAL-1", storeId: "mercado_livre",
      title: "Notebook para revisão", imageUrl: "https://http2.mlstatic.com/test.jpg",
      originalUrl: "https://produto.mercadolivre.com.br/MLB-OFFICIAL-1",
      currentPrice: 2500, score: 70, status: "awaiting_affiliate_link",
    } });
    const exported = await request(app).get("/api/products/candidates/export.txt?status=awaiting_affiliate_link").set(authenticated());
    expect(exported.status).toBe(200);
    expect(exported.text).toContain("não podem ser publicadas");
    expect(exported.text).toContain("Notebook para revisão");
    const linked = await request(app).patch(`/api/products/${official.id}`).set(authenticated()).send({ affiliateUrl: "https://meli.la/link-oficial" });
    expect(linked.status).toBe(200);
    expect(linked.body.status).toBe("pending");
    expect(await db.publication.count({ where: { offerId: official.id } })).toBe(1);
  });

  it("atualiza o produto com transição validada", async () => {
    const response = await request(app).patch(`/api/products/${offerId}`).set(authenticated()).send({ status: "approved" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("approved");
  });

  it("publica de forma idempotente somente na fila", async () => {
    const body = { channelIds: ["test-group"], name: "Teste n8n", intervalMinutes: 5 };
    const first = await request(app).post(`/api/products/${offerId}/publish`).set(authenticated()).set("Idempotency-Key", "publish-test-0001").send(body);
    const replay = await request(app).post(`/api/products/${offerId}/publish`).set(authenticated()).set("Idempotency-Key", "publish-test-0001").send(body);
    expect(first.status).toBe(202);
    expect(first.body).toMatchObject({ status: "queued", dryRun: true });
    expect(replay.status).toBe(202);
    expect(replay.body.distribution.campaign.id).toBe(first.body.distribution.campaign.id);
    expect(await db.publication.count({ where: { destination: "test-group" } })).toBe(1);
  });

  it("honra dryRun no corpo sem criar campanha, publicação ou alterar status", async () => {
    await db.offer.update({ where: { id: offerId }, data: { status: "approved" } });
    const publicationsBefore = await db.publication.count();
    const campaignsBefore = await db.setting.findUnique({ where: { key: "distributionCampaigns" } });

    const response = await request(app).post(`/api/products/${offerId}/publish`).set(authenticated())
      .set("Idempotency-Key", "publish-dry-run-no-side-effects-0001")
      .send({ channelIds: ["test-group"], name: "Prévia segura", intervalMinutes: 10, dryRun: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      productId: offerId,
      status: "approved",
      dryRun: true,
      distribution: { created: 0, startNow: false },
    });
    expect(await db.publication.count()).toBe(publicationsBefore);
    expect((await db.offer.findUniqueOrThrow({ where: { id: offerId } })).status).toBe("approved");
    expect((await db.setting.findUnique({ where: { key: "distributionCampaigns" } }))?.value).toBe(campaignsBefore?.value);
    await db.offer.update({ where: { id: offerId }, data: { status: "queued" } });
  });

  it("cria uma publicação para cada grupo ou rejeita todos os destinos", async () => {
    const channels = [
      { id: "test-group", name: "Grupo de teste", type: "whatsapp", externalId: "test@g.us", enabled: true },
      { id: "test-group-2", name: "Grupo de teste 2", type: "whatsapp", externalId: "test2@g.us", enabled: true },
    ];
    await db.setting.update({ where: { key: "distributionChannels" }, data: { value: JSON.stringify(channels) } });
    const offer = await db.offer.create({ data: {
      externalId: "MLB-TWO-GROUPS", storeId: "mercado_livre", title: "Produto para dois grupos",
      originalUrl: "https://produto.mercadolivre.com.br/MLB-TWO-GROUPS", affiliateUrl: "https://meli.la/two-groups",
      currentPrice: 100, score: 90, status: "approved",
    } });
    const accepted = await request(app).post(`/api/products/${offer.id}/publish`).set(authenticated())
      .set("Idempotency-Key", "publish-two-groups-0001")
      .send({ channelIds: ["test-group", "test-group-2"], intervalMinutes: 10 });
    expect(accepted.status).toBe(202);
    expect(accepted.body.distribution.created).toBe(2);
    expect(new Set(accepted.body.distribution.campaign.channelIds)).toEqual(new Set(["test-group", "test-group-2"]));

    const invalidOffer = await db.offer.create({ data: {
      externalId: "MLB-BAD-GROUP", storeId: "mercado_livre", title: "Produto com grupo inválido",
      originalUrl: "https://produto.mercadolivre.com.br/MLB-BAD-GROUP", affiliateUrl: "https://meli.la/bad-group",
      currentPrice: 120, score: 80, status: "approved",
    } });
    const rejected = await request(app).post(`/api/products/${invalidOffer.id}/publish`).set(authenticated())
      .set("Idempotency-Key", "publish-invalid-group-01")
      .send({ channelIds: ["test-group", "missing-group"], intervalMinutes: 10 });
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("invalid_destinations");
    expect(await db.publication.count({ where: { offerId: invalidOffer.id } })).toBe(0);
  });

  it("bloqueia o adaptador externo durante o dry-run", async () => {
    const publication = await db.publication.findFirstOrThrow({ where: { destination: "test-group" } });
    const result = await sendDistribution(publication.id);
    expect(result).toEqual({ sent: false, dryRun: true, blocked: true });
    expect((await db.publication.findUniqueOrThrow({ where: { id: publication.id } })).status).toBe("paused");
  });

  it("não permite marcar dry-run como publicação concluída", async () => {
    const response = await request(app).patch(`/api/products/${offerId}`).set(authenticated()).send({ status: "published" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("publication_not_completed");
  });

  it("retorna o histórico com status canônico", async () => {
    const response = await request(app).get("/api/publications/history?status=queued").set(authenticated());
    expect(response.status).toBe(200);
    expect(response.body.items.length).toBeGreaterThanOrEqual(1);
    expect(response.body.items.every((item: { status: string }) => item.status === "queued")).toBe(true);
  });

  it("registra erros do workflow sem executar ações externas", async () => {
    const response = await request(app).post("/api/logs/error").set(authenticated()).send({
      executionId: "execution-123", workflowName: "Seleção e Publicação",
      node: "Publicar produto", productId: offerId, endpoint: "/api/products/id/publish",
      httpStatus: 409, message: "Produto não aprovado", timestamp: new Date().toISOString(), attempts: 1,
    });
    expect(response.status).toBe(201);
    expect(response.body.registered).toBe(true);
    const log = await db.auditLog.findUniqueOrThrow({ where: { id: response.body.logId } });
    expect(log.action).toBe("n8n.workflow.error");
    expect(log.metadata).toContain("Produto não aprovado");
  });
});
