import "dotenv/config";
import path from "node:path";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import cron from "node-cron";
import { config } from "./config.js";
import { db } from "./db.js";
import { createSession, requireAuth } from "./auth.js";
import { cancelActiveSearch, importCapturedAffiliateOffer, runLinkImport, runSearch } from "./services.js";
import { affiliateBrowserStatus } from "./affiliate-hub.js";
import { getSearchSchedules, removeSearchSchedule, runDueAutomaticSearch, runSearchScheduleNow, saveSearchSchedule, updateSearchSchedule } from "./search-scheduler.js";
import { adapters } from "./integrations.js";
import { verifyOfferPrices } from "./price-verifier.js";
import { captureWhatsAppGroupMetrics, whatsappGroupGrowthReport } from "./group-metrics.js";
import { formatOfferMessage } from "./domain.js";
import {
  completeAuthorization,
  connectionStatus,
  createAuthorizationUrl,
} from "./mercado-livre-oauth.js";
import {
  createChannel,
  networkIdSchema,
  platformOverview,
  removeChannel,
  saveMessaging,
  saveNetwork,
  saveProfile,
  syncWhatsAppChannels,
  testWhatsApp,
} from "./platform-settings.js";
import {
  controlDistributionCampaign,
  createDistributions,
  deleteDistributionCampaign,
  distributionInputSchema,
  listDistributionCampaigns,
  listDistributions,
  processScheduledDistributions,
  sendDistribution,
} from "./distribution.js";
import {
  createWhatsAppOfferGroup,
  disconnectWhatsAppWeb,
  listWhatsAppGroups,
  renameWhatsAppGroup,
  restoreWhatsAppWebSession,
  sendWhatsAppWebTest,
  startWhatsAppWeb,
  stopWhatsAppWebSession,
  whatsappWebStatus,
} from "./whatsapp-web.js";
import { n8nApiRouter } from "./n8n-api.js";
import {
  agentInputSchema,
  createAgent,
  deleteAgent,
  getAgent,
  listAgents,
  updateAgent,
} from "./whatsapp-agents.js";

export const app = express();
const shutdown = () => {
  void stopWhatsAppWebSession().finally(() => process.exit(0));
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.on("unhandledRejection", (reason) => {
  if (
    reason instanceof Error &&
    reason.message.includes("Execution context was destroyed")
  ) {
    console.warn(
      "WhatsApp Web reiniciou sua página interna; a API continuará disponível.",
    );
    return;
  }
  console.error("Falha assíncrona não tratada:", reason);
});
app.disable("x-powered-by");
// Vite e ngrok encaminham o IP original neste cabeçalho. Confiamos somente
// no proxy diretamente à frente da aplicação para o rate limit funcionar.
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: config.NODE_ENV === "production" ? undefined : false,
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: "draft-8" }),
);

const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/;
const allowLocalExtension = (req: express.Request, res: express.Response) => {
  const origin = req.get("origin") ?? "";
  const host = req.get("host")?.split(":")[0] ?? "";
  if (!extensionOrigin.test(origin) || !["localhost", "127.0.0.1", "[::1]"].includes(host)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Lico-Primos-Extension");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  return true;
};

app.options("/api/extension/capture", (req, res) => {
  if (!allowLocalExtension(req, res)) return res.status(403).end();
  res.status(204).end();
});

const capturedOfferSchema = z.object({
  externalId: z.string().trim().regex(/^MLB\d{6,}$/i),
  storeId: z.literal("mercado_livre"),
  title: z.string().trim().min(3).max(500),
  imageUrl: z.string().url().max(3000).optional(),
  originalUrl: z.string().url().max(3000),
  affiliateUrl: z.string().url().max(3000).refine((value) => value.startsWith("https://meli.la/")),
  currentPrice: z.number().positive().max(10_000_000),
  previousPrice: z.number().positive().max(10_000_000).optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  extraCommissionPercent: z.number().min(0).max(100).optional(),
  shipping: z.string().max(200).optional(),
  freeShipping: z.boolean().optional(),
  stock: z.number().int().min(0).optional(),
  galleryImages: z.array(z.string().url().max(3000)).max(20).optional(),
});

// Esta rota é anterior ao login do painel de propósito: extensões não recebem
// o cookie HttpOnly do Lico Primos. Ela aceita somente origem chrome-extension,
// somente via loopback e apenas cria/atualiza ofertas não publicadas.
app.post("/api/extension/capture", async (req, res, next) => {
  if (!allowLocalExtension(req, res) || req.get("x-lico-primos-extension") !== "capture-v1") {
    return res.status(403).json({ error: "Extensão local não autorizada." });
  }
  const parsed = z.object({ offers: z.array(capturedOfferSchema).min(1).max(50) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Os produtos capturados são inválidos ou não possuem link confirmado." });
  try {
    const imported = [];
    for (const offer of parsed.data.offers) imported.push(await importCapturedAffiliateOffer(offer));
    res.status(201).json({ imported: imported.length, offerIds: imported.map((offer) => offer.id) });
  } catch (error) {
    next(error);
  }
});

app.get("/", async (req, res, next) => {
  const parsed = z
    .object({ code: z.string().min(1), state: z.string().min(1) })
    .safeParse(req.query);
  if (!parsed.success) return next();
  try {
    await completeAuthorization(parsed.data.code, parsed.data.state);
    res
      .type("html")
      .send(
        `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Mercado Livre conectado</title><body style="font-family:system-ui;background:#f4f6f3;color:#17201e;display:grid;place-items:center;min-height:100vh;margin:0"><main style="background:white;padding:40px;border-radius:16px;max-width:500px;text-align:center"><h1>Mercado Livre conectado</h1><p>A autorização foi salva com segurança. Você já pode voltar ao Lico Primos.</p><a style="display:inline-block;background:#176b50;color:white;padding:12px 18px;border-radius:9px;text-decoration:none" href="${config.APP_URL}">Voltar ao painel</a></main></body></html>`,
      );
  } catch (error) {
    res
      .status(400)
      .type("html")
      .send(
        `<h1>Não foi possível conectar</h1><p>${error instanceof Error ? error.message : "Erro desconhecido"}</p>`,
      );
  }
});

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    mode: "dry_run",
    mercadoLivreConnected: Boolean(config.MERCADO_LIVRE_ACCESS_TOKEN),
  }),
);
app.post(
  "/api/auth/login",
  rateLimit({ windowMs: 15 * 60_000, limit: 8 }),
  async (req, res) => {
    const parsed = z
      .object({
        // Aceita também o usuário de desenvolvimento admin@localhost.
        email: z
          .string()
          .trim()
          .min(3)
          .max(254)
          .regex(/^[^\s@]+@[^\s@]+$/),
        password: z.string().min(6).max(128),
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "E-mail ou senha inválidos." });
    const user = await db.adminUser.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
    });
    if (
      !user ||
      !(await bcrypt.compare(parsed.data.password, user.passwordHash))
    )
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    res.cookie("session", createSession(user.id), {
      httpOnly: true,
      sameSite: "strict",
      secure: config.NODE_ENV === "production",
      maxAge: 12 * 60 * 60_000,
    });
    res.json({ email: user.email });
  },
);
app.get("/api/auth/google", (_req, res) => {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_REDIRECT_URI)
    return res.redirect(`${config.APP_URL}/?error=google_not_configured`);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("prompt", "select_account");
  res.redirect(url.toString());
});
app.get("/api/auth/google/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    if (!code || !config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI)
      throw new Error("Login com Google não configurado.");
    const client = new OAuth2Client(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      config.GOOGLE_REDIRECT_URI,
    );
    const { tokens } = await client.getToken(code);
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token ?? "",
      audience: config.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.toLowerCase();
    if (!email || !payload?.email_verified) throw new Error("E-mail do Google não verificado.");
    const user = await db.adminUser.findUnique({ where: { email } });
    if (!user) return res.redirect(`${config.APP_URL}/?error=google_not_admin`);
    res.cookie("session", createSession(user.id), {
      httpOnly: true,
      sameSite: "strict",
      secure: config.NODE_ENV === "production",
      maxAge: 12 * 60 * 60_000,
    });
    res.redirect(config.APP_URL);
  } catch (error) {
    console.error("Login com Google:", error instanceof Error ? error.message : error);
    res.redirect(`${config.APP_URL}/?error=google_failed`);
  }
});
app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("session");
  res.status(204).end();
});
app.get("/api/auth/me", requireAuth, async (_req, res) => {
  const user = await db.adminUser.findUnique({
    where: { id: res.locals.userId },
    select: { email: true },
  });
  res.json(user);
});

// Contrato de automação independente do cookie do painel. O router exige
// sua própria API key em todas as rotas.
app.use("/api", n8nApiRouter);
app.use("/api", requireAuth);
app.get("/api/platform", async (_req, res, next) => {
  try {
    const ml = await connectionStatus();
    res.json(await platformOverview(ml.connected));
  } catch (e) {
    next(e);
  }
});
app.patch("/api/profile", async (req, res, next) => {
  try {
    const profile = await saveProfile(req.body);
    await db.auditLog.create({
      data: { action: "profile.updated", entityType: "Account" },
    });
    res.json(profile);
  } catch (e) {
    next(e);
  }
});
app.patch("/api/affiliate-networks/:id", async (req, res, next) => {
  const id = networkIdSchema.safeParse(req.params.id);
  if (!id.success)
    return res.status(404).json({ error: "Rede de afiliados desconhecida." });
  try {
    const result = await saveNetwork(id.data, req.body);
    await db.auditLog.create({
      data: {
        action: "affiliate.updated",
        entityType: "AffiliateNetwork",
        entityId: id.data,
      },
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
});
app.patch("/api/messaging", async (req, res, next) => {
  try {
    await saveMessaging(req.body);
    await db.auditLog.create({
      data: { action: "messaging.updated", entityType: "Messaging" },
    });
    res.json({ saved: true });
  } catch (e) {
    next(e);
  }
});
app.post("/api/messaging/whatsapp/test", async (_req, res, next) => {
  try {
    res.json(await testWhatsApp());
  } catch (e) {
    next(e);
  }
});
app.get("/api/whatsapp-web/status", (_req, res) =>
  res.json(whatsappWebStatus()),
);
app.post("/api/whatsapp-web/connect", async (_req, res, next) => {
  try {
    res.status(202).json(await startWhatsAppWeb());
  } catch (error) {
    next(error);
  }
});
app.get("/api/whatsapp-web/groups", async (_req, res, next) => {
  try {
    const groups = await listWhatsAppGroups();
    await syncWhatsAppChannels(groups);
    res.json(groups);
  } catch (error) {
    next(error);
  }
});
app.post("/api/whatsapp-web/test", async (req, res, next) => {
  const parsed = z
    .object({ groupId: z.string().min(1).max(200) })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Selecione um grupo para o teste." });
  try {
    res.json(await sendWhatsAppWebTest(parsed.data.groupId));
  } catch (error) {
    next(error);
  }
});
app.patch("/api/whatsapp-web/groups/:groupId", async (req, res, next) => {
  const parsed = z.object({ name: z.string().trim().min(3).max(100) }).safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Informe um nome válido para o grupo." });
  try {
    res.json(await renameWhatsAppGroup(req.params.groupId, parsed.data.name));
  } catch (error) {
    next(error);
  }
});
app.post("/api/whatsapp-web/groups", async (req, res, next) => {
  const parsed = z
    .object({
      name: z.string().trim().min(3).max(100),
      participants: z.array(z.string().trim().min(8).max(30)).min(1).max(50),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error:
        "Informe o nome do grupo e ao menos um participante com DDI e DDD.",
    });
  try {
    const result = await createWhatsAppOfferGroup(
      parsed.data.name,
      parsed.data.participants,
    );
    const channel = await createChannel({
      name: result.group.name,
      type: "whatsapp",
      externalId: result.group.id,
      enabled: true,
    });
    await db.auditLog.create({
      data: {
        action: "whatsapp.group_created",
        entityType: "Channel",
        entityId: result.group.id,
        metadata: JSON.stringify({
          name: result.group.name,
          settings: result.settings,
        }),
      },
    });
    res.status(201).json({ ...result, channel });
  } catch (error) {
    next(error);
  }
});
app.post("/api/whatsapp-web/disconnect", async (_req, res, next) => {
  try {
    await disconnectWhatsAppWeb();
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
app.post("/api/channels", async (req, res, next) => {
  try {
    const channel = await createChannel(req.body);
    await db.auditLog.create({
      data: {
        action: "channel.created",
        entityType: "Channel",
        entityId: channel.id,
      },
    });
    res.status(201).json(channel);
  } catch (e) {
    next(e);
  }
});
app.delete("/api/channels/:id", async (req, res, next) => {
  try {
    await removeChannel(req.params.id);
    await db.auditLog.create({
      data: {
        action: "channel.deleted",
        entityType: "Channel",
        entityId: req.params.id,
      },
    });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
app.get("/api/distributions", async (_req, res, next) => {
  try {
    res.json(await listDistributions());
  } catch (e) {
    next(e);
  }
});
app.post("/api/distributions", async (req, res, next) => {
  const parsed = distributionInputSchema.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message = issue?.path[0] === "offerIds" && issue.code === "too_big"
      ? "Você pode distribuir no máximo 200 produtos por campanha."
      : issue?.path[0] === "offerIds"
        ? "Selecione ao menos um produto para distribuir."
        : issue?.path[0] === "channelIds"
          ? "Selecione ao menos um destino ativo."
          : "Revise os dados da campanha antes de continuar.";
    return res.status(400).json({ error: message });
  }
  try {
    const result = await createDistributions(parsed.data);
    await db.auditLog.create({
      data: {
        action: "distribution.created",
        entityType: "Publication",
        metadata: JSON.stringify(result),
      },
    });
    res.status(201).json(result);
    if (result.startNow) setImmediate(() => void processScheduledDistributions());
  } catch (e) {
    next(e);
  }
});
app.get("/api/distribution-campaigns", async (_req, res, next) => {
  try { res.json(await listDistributionCampaigns()); } catch (error) { next(error); }
});
app.patch("/api/distribution-campaigns/:id", async (req, res, next) => {
  const parsed = z.object({ action: z.enum(["pause", "resume", "cancel"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Ação de campanha inválida." });
  try { res.json(await controlDistributionCampaign(req.params.id, parsed.data.action)); } catch (error) { next(error); }
});
app.delete("/api/distribution-campaigns/:id", async (req, res, next) => {
  try { res.json(await deleteDistributionCampaign(req.params.id)); } catch (error) { next(error); }
});
app.post("/api/distributions/:id/send", async (req, res, next) => {
  try {
    res.json(await sendDistribution(req.params.id));
  } catch (e) {
    next(e);
  }
});
app.get("/api/dashboard", async (_req, res) => {
  const [
    offers,
    publications,
    runs,
    niches,
    stores,
    pending,
    approved,
    published,
    historySetting,
  ] = await Promise.all([
    db.offer.findMany({
      include: { store: true, niche: true },
      orderBy: [{ score: "desc" }, { discoveredAt: "desc" }],
      take: 200,
    }),
    db.publication.findMany({
      include: { offer: { include: { store: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.schedulerRun.findMany({ orderBy: { startedAt: "desc" }, take: 10 }),
    db.niche.findMany({ orderBy: { name: "asc" } }),
    db.store.findMany(),
    db.offer.count({ where: { status: "pending" } }),
    db.offer.count({ where: { status: "approved" } }),
    db.offer.count({ where: { status: "published" } }),
    db.setting.findUnique({ where: { key: "search_history" } }),
  ]);
  const mlStatus = await connectionStatus();
  res.json({
    stats: { total: offers.length, pending, approved, published },
    offers,
    publications,
    runs,
    niches,
    stores,
    searchHistory: historySetting ? JSON.parse(historySetting.value) : [],
    mode: "dry_run",
    integrations: adapters.map(({ search: _s, revalidate: _r, ...a }) => ({
      ...a,
      enabled: mlStatus.connected,
      reason: mlStatus.connected
        ? "Conta conectada pela autorização oficial OAuth."
        : mlStatus.configured
          ? "Credenciais configuradas. Clique em Conectar Mercado Livre."
          : "Preencha as credenciais do aplicativo no arquivo .env.",
    })),
  });
});
app.get("/api/reports/summary", async (_req, res, next) => {
  try {
    const [offers, sent, failed, pending, priceRows, runs] = await Promise.all([
      db.offer.findMany({ select: { affiliateUrl: true, discountPercent: true, status: true } }),
      db.publication.count({ where: { status: "sent" } }),
      db.publication.count({ where: { status: "failed" } }),
      db.publication.count({ where: { status: { in: ["scheduled", "sending", "paused"] } } }),
      db.priceHistory.findMany({ orderBy: { collectedAt: "desc" }, take: 2000 }),
      db.schedulerRun.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    ]);
    const byOffer = new Map<string, number[]>();
    for (const row of priceRows) byOffer.set(row.offerId, [...(byOffer.get(row.offerId) ?? []), row.price]);
    const priceDrops = [...byOffer.values()].filter((prices) => prices.length > 1 && prices[0] <= prices[prices.length - 1] * 0.85).length;
    const discounts = offers.map((offer) => offer.discountPercent ?? 0).filter((value) => value > 0);
    res.json({
      offers: offers.length,
      confirmedLinks: offers.filter((offer) => offer.affiliateUrl?.startsWith("https://meli.la/")).length,
      averageDiscount: discounts.length ? Math.round(discounts.reduce((total, value) => total + value, 0) / discounts.length) : 0,
      priceDrops,
      publications: { sent, failed, pending },
      searches: { total: runs.length, successful: runs.filter((run) => run.status === "success").length },
    });
  } catch (error) { next(error); }
});
app.get("/api/offers/:id/detail", async (req, res) => {
  const offer = await db.offer.findUnique({
    where: { id: req.params.id },
    include: {
      store: true,
      niche: true,
      priceHistory: { orderBy: { collectedAt: "desc" }, take: 10 },
      affiliateLinks: { orderBy: { createdAt: "desc" }, take: 10 },
      publications: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
  if (!offer) return res.status(404).json({ error: "Produto não encontrado." });
  let metadata: { galleryImages?: string[]; catalogProductId?: string } = {};
  try {
    metadata = JSON.parse(offer.rawData);
  } catch {
    /* metadados antigos */
  }
  res.json({
    ...offer,
    galleryImages:
      metadata.galleryImages ?? (offer.imageUrl ? [offer.imageUrl] : []),
    catalogProductId: metadata.catalogProductId,
  });
});
app.get("/api/reports/trending", async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const offers = await db.offer.findMany({
      where: { status: { in: ["pending", "approved", "published"] }, affiliateUrl: { startsWith: "https://meli.la/" } },
      include: { publications: { where: { status: "sent", publishedAt: { gte: since } } }, priceHistory: { orderBy: { collectedAt: "desc" }, take: 2 } },
      orderBy: [{ score: "desc" }, { discoveredAt: "desc" }], take: 100,
    });
    const trending = offers.map((offer) => {
      const latest = offer.priceHistory[0]?.price ?? offer.currentPrice;
      const prior = offer.priceHistory[1]?.price ?? latest;
      const drop = prior > latest ? Math.round(((prior - latest) / prior) * 100) : 0;
      return { id: offer.id, title: offer.title, imageUrl: offer.imageUrl, currentPrice: offer.currentPrice, discountPercent: offer.discountPercent, score: Math.round(offer.score + drop + offer.publications.length * 2), sentLast7Days: offer.publications.length, priceDropPercent: drop };
    }).sort((a, b) => b.score - a.score).slice(0, 20);
    res.json({ generatedAt: new Date().toISOString(), trending });
  } catch (error) { next(error); }
});
app.get("/api/reports/member-growth", async (_req, res, next) => {
  try { res.json(await whatsappGroupGrowthReport()); } catch (error) { next(error); }
});
app.get("/api/heartbeat", async (_req, res) => {
  const last = await db.setting.findUnique({ where: { key: "price_verifier_last_run" } });
  res.json({ ok: true, service: "lico-primos", time: new Date().toISOString(), priceVerifier: last ? JSON.parse(last.value) : null });
});
app.post("/api/heartbeat/price-verifier", async (req, res, next) => {
  const parsed = z.object({ limit: z.number().int().min(1).max(100).optional() }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Limite inválido." });
  try { res.json(await verifyOfferPrices("heartbeat", parsed.data.limit)); } catch (error) { next(error); }
});
app.post("/api/search", async (req, res, next) => {
  const parsed = z
    .object({
      query: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(200).default(20),
      mode: z.enum(["quick", "wide"]).default("quick"),
      strategy: z.enum(["general", "best_sellers", "offers", "discount", "commission"]).default("general"),
      filters: z.object({
        minRating: z.number().min(0).max(5).default(0),
        minDiscount: z.number().min(0).max(100).default(0),
        minCommission: z.number().min(0).max(100).default(0),
        freeShippingOnly: z.boolean().default(false),
      }).optional(),
    })
    .safeParse(req.body ?? {});
  if (!parsed.success)
    return res.status(400).json({ error: "Termo de busca inválido." });
  try {
    res
      .status(202)
      .json(await runSearch("manual", parsed.data.query, parsed.data.limit, parsed.data.filters, parsed.data.strategy, parsed.data.mode));
  } catch (e) {
    next(e);
  }
});
app.get("/api/affiliate-browser/status", async (_req, res) => {
  res.json(await affiliateBrowserStatus());
});
app.post("/api/search/link", async (req, res, next) => {
  const parsed = z.object({ url: z.string().trim().url().max(2000) }).safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Cole um link válido do Mercado Livre." });
  try {
    const offer = await runLinkImport(parsed.data.url);
    res.status(201).json({ offerId: offer.id, title: offer.title });
  } catch (error) {
    next(error);
  }
});
app.post("/api/search/cancel", async (_req, res) => {
  const cancelled = await cancelActiveSearch();
  res.json({ cancelled });
});
app.get("/api/search/schedules", async (_req, res) => {
  res.json({ schedules: await getSearchSchedules() });
});
const searchScheduleSchema = z.object({
  name: z.string().trim().min(2).max(80).default("Mais vendidos"),
  enabled: z.boolean(),
  bestSellers: z.boolean().default(false),
  time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  productCount: z.number().int().min(1).max(200),
  rules: z.array(z.object({
    id: z.string().min(1).max(80), category: z.string().trim().min(1).max(80),
    query: z.string().trim().max(120), quantity: z.number().int().min(1).max(200),
  })).max(20).default([]),
  filters: z.object({
    minCommission: z.number().min(0).max(100).default(0),
    minRating: z.number().min(0).max(5).default(0),
    minDiscount: z.number().min(0).max(100).default(0),
    minPrice: z.number().min(0).max(1000000).default(0),
    maxPrice: z.number().min(0).max(1000000).default(1000000),
    extraCommissionOnly: z.boolean().default(false),
    freeShippingOnly: z.boolean().default(false),
  }).default({
    minCommission: 0, minRating: 0, minDiscount: 0, minPrice: 0,
    maxPrice: 1000000, extraCommissionOnly: false,
    freeShippingOnly: false,
  }),
}).superRefine((value, context) => {
  const total = value.rules.reduce((sum, rule) => sum + rule.quantity, 0);
  if (value.rules.length && total > 200) context.addIssue({ code: "custom", path: ["rules"], message: "A soma das regras não pode ultrapassar 200 produtos." });
  if (value.filters.maxPrice < value.filters.minPrice) context.addIssue({ code: "custom", path: ["filters", "maxPrice"], message: "O preço máximo deve ser maior que o mínimo." });
});
app.post("/api/search/schedules", async (req, res) => {
  const parsed = searchScheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Revise o plano de busca." });
  res.json(await saveSearchSchedule(parsed.data));
});
app.put("/api/search/schedules/:id", async (req, res) => {
  const parsed = searchScheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Revise o plano de busca." });
  const schedule = await updateSearchSchedule(req.params.id, parsed.data);
  if (!schedule) return res.status(404).json({ error: "Plano de busca não encontrado." });
  res.json(schedule);
});
app.post("/api/search/schedules/:id/run", async (req, res, next) => {
  try {
    const execution = await runSearchScheduleNow(req.params.id);
    if (!execution) return res.status(404).json({ error: "Plano de busca não encontrado." });
    res.json(execution);
  } catch (error) { next(error); }
});
app.delete("/api/search/schedules/:id", async (req, res) => {
  const removed = await removeSearchSchedule(req.params.id);
  if (!removed) return res.status(404).json({ error: "Agendamento não encontrado." });
  res.status(204).end();
});
app.post("/api/mercadolivre/connect", async (_req, res, next) => {
  try {
    res.json({ authorizationUrl: await createAuthorizationUrl() });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/offers/:id/status", async (req, res) => {
  const parsed = z
    .object({
      status: z.enum(["pending", "approved", "rejected", "published"]),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Status inválido." });
  const currentOffer = await db.offer.findUnique({
    where: { id: req.params.id },
    select: { affiliateUrl: true },
  });
  if (!currentOffer)
    return res.status(404).json({ error: "Produto não encontrado." });
  if (
    ["approved", "published"].includes(parsed.data.status) &&
    !currentOffer.affiliateUrl
  )
    return res.status(409).json({
      error:
        "O link oficial de afiliado ainda não foi gerado para este produto.",
    });
  const offer = await db.offer.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      publishedAt: parsed.data.status === "published" ? new Date() : undefined,
    },
  });
  if (parsed.data.status === "published")
    await db.publication.updateMany({
      where: { offerId: offer.id },
      data: { status: "manual_complete", publishedAt: new Date() },
    });
  await db.auditLog.create({
    data: {
      action: `offer.${parsed.data.status}`,
      entityType: "Offer",
      entityId: offer.id,
    },
  });
  res.json(offer);
});
app.delete("/api/offers", async (req, res, next) => {
  const parsed = z
    .object({ ids: z.array(z.string().min(1)).min(1).max(100) })
    .safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Selecione ao menos um produto para excluir." });
  try {
    const result = await db.offer.deleteMany({
      where: { id: { in: parsed.data.ids } },
    });
    await db.auditLog.create({
      data: {
        action: "offers.deleted",
        entityType: "Offer",
        metadata: JSON.stringify({ ids: parsed.data.ids, count: result.count }),
      },
    });
    res.json({ deleted: result.count });
  } catch (error) {
    next(error);
  }
});
app.delete("/api/offers/all", async (req, res, next) => {
  const parsed = z
    .object({ confirmation: z.literal("LIMPAR_TODOS") })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      error: "Confirmação inválida para limpar os produtos de teste.",
    });
  try {
    const deleted = await db.$transaction(async (tx) => {
      const count = await tx.offer.count();
      await tx.offer.deleteMany();
      return count;
    });
    await db.auditLog.create({
      data: {
        action: "offers.test_data_cleared",
        entityType: "Offer",
        metadata: JSON.stringify({ deleted }),
      },
    });
    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});
app.patch("/api/offers/:id/affiliate-link", async (req, res, next) => {
  const parsed = z
    .object({
      url: z
        .url()
        .refine((url) => url.startsWith("https://"), "Use uma URL HTTPS."),
      commissionPercent: z.number().min(0).max(100).optional(),
      extraCommissionPercent: z.number().min(0).max(100).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Link de afiliado inválido." });
  try {
    const totalCommission = parsed.data.commissionPercent;
    const offerBeforeUpdate = await db.offer.findUnique({
      where: { id: req.params.id },
      select: { currentPrice: true },
    });
    if (!offerBeforeUpdate)
      return res.status(404).json({ error: "Produto não encontrado." });
    const offer = await db.offer.update({
      where: { id: req.params.id },
      data: {
        affiliateUrl: parsed.data.url,
        commissionPercent: totalCommission,
        extraCommissionPercent: parsed.data.extraCommissionPercent,
        estimatedCommission:
          totalCommission == null
            ? undefined
            : (offerBeforeUpdate.currentPrice * totalCommission) / 100,
      },
    });
    await db.affiliateLink.create({
      data: {
        offerId: offer.id,
        url: parsed.data.url,
        source: "manual_confirmed",
      },
    });
    await db.publication.updateMany({
      where: { offerId: offer.id, status: { in: ["queued", "approved"] } },
      data: {
        message: formatOfferMessage({
          externalId: offer.externalId,
          storeId: offer.storeId,
          title: offer.title,
          imageUrl: offer.imageUrl ?? undefined,
          originalUrl: offer.originalUrl,
          affiliateUrl: parsed.data.url,
          currentPrice: offer.currentPrice,
          previousPrice: offer.previousPrice ?? undefined,
          rating: offer.rating ?? undefined,
          reviewCount: offer.reviewCount ?? undefined,
          seller: offer.seller ?? undefined,
          sellerReputation: offer.sellerReputation ?? undefined,
          shipping: offer.shipping ?? undefined,
          freeShipping: offer.freeShipping,
          stock: offer.stock ?? undefined,
        }),
      },
    });
    await db.auditLog.create({
      data: {
        action: "affiliate_link.updated",
        entityType: "Offer",
        entityId: offer.id,
      },
    });
    res.json(offer);
  } catch (e) {
    next(e);
  }
});
app.patch("/api/niches/:id", async (req, res) => {
  const parsed = z
    .object({
      active: z.boolean().optional(),
      wantedKeywords: z
        .array(z.string().trim().min(1).max(60))
        .max(30)
        .optional(),
      minDiscount: z.number().min(0).max(100).optional(),
      minRating: z.number().min(0).max(5).optional(),
      maxOffers: z.number().int().min(1).max(100).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: "Configuração inválida." });
  const { wantedKeywords, ...data } = parsed.data;
  res.json(
    await db.niche.update({
      where: { id: req.params.id },
      data: {
        ...data,
        ...(wantedKeywords
          ? { wantedKeywords: JSON.stringify(wantedKeywords) }
          : {}),
      },
    }),
  );
});
app.post("/api/integrations/test", (_req, res) =>
  res.json({
    results: adapters.map((item) => ({
      id: item.id,
      ok: false,
      message: item.reason,
    })),
  }),
);

app.get("/api/lico-agents", async (_req, res, next) => {
  try {
    res.json(await listAgents());
  } catch (e) {
    next(e);
  }
});
app.get("/api/lico-agents/:id", async (req, res, next) => {
  try {
    const agent = await getAgent(req.params.id);
    if (!agent) return res.status(404).json({ error: "Agente não encontrado." });
    res.json(agent);
  } catch (e) {
    next(e);
  }
});
app.post("/api/lico-agents", async (req, res, next) => {
  const parsed = agentInputSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Revise os dados do agente." });
  try {
    const agent = await createAgent(parsed.data);
    await db.auditLog.create({
      data: { action: "whatsapp_agent.created", entityType: "WhatsAppAgent", entityId: agent.id },
    });
    res.status(201).json(agent);
  } catch (e) {
    next(e);
  }
});
app.put("/api/lico-agents/:id", async (req, res, next) => {
  const parsed = agentInputSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Revise os dados do agente." });
  try {
    const agent = await updateAgent(req.params.id, parsed.data);
    if (!agent) return res.status(404).json({ error: "Agente não encontrado." });
    await db.auditLog.create({
      data: { action: "whatsapp_agent.updated", entityType: "WhatsAppAgent", entityId: agent.id },
    });
    res.json(agent);
  } catch (e) {
    next(e);
  }
});
app.delete("/api/lico-agents/:id", async (req, res, next) => {
  try {
    const removed = await deleteAgent(req.params.id);
    if (!removed) return res.status(404).json({ error: "Agente não encontrado." });
    await db.auditLog.create({
      data: { action: "whatsapp_agent.deleted", entityType: "WhatsAppAgent", entityId: req.params.id },
    });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error instanceof Error ? error.message : "Erro interno");
    res.status(500).json({
      error: error instanceof Error ? error.message : "Erro interno.",
    });
  },
);

if (config.NODE_ENV === "production") {
  const dist = path.resolve("dist");
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
export function startServer() {
  cron.schedule("* * * * *", () => void runDueAutomaticSearch().catch((error) =>
    console.error("Busca automática:", error.message),
  ), { timezone: config.TIMEZONE, noOverlap: true });
  cron.schedule("* * * * *", () => void processScheduledDistributions(), {
    timezone: config.TIMEZONE,
    noOverlap: true,
  });
  cron.schedule("17 * * * *", () => void verifyOfferPrices("cron").catch((error) =>
    console.error("Verificação de preços:", error instanceof Error ? error.message : error),
  ), { timezone: config.TIMEZONE, noOverlap: true });
  cron.schedule("43 * * * *", () => void captureWhatsAppGroupMetrics().catch((error) =>
    console.error("Métricas dos grupos:", error instanceof Error ? error.message : error),
  ), { timezone: config.TIMEZONE, noOverlap: true });
  return app.listen(config.PORT, () => {
    const publishingMode = config.DRY_RUN || !config.EXTERNAL_PUBLISHING_ENABLED
      ? "dry run ativo"
      : "envio externo habilitado";
    console.log(`API segura em http://localhost:${config.PORT} — ${publishingMode}`);
    void restoreWhatsAppWebSession().catch((error) =>
      console.error("Não foi possível restaurar o WhatsApp Web:", error instanceof Error ? error.message : error),
    );
  });
}

startServer();
