import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router, type Response } from "express";
import { z } from "zod";
import { db } from "./db.js";
import { config } from "./config.js";
import { calculateDiscount, formatOfferMessage, isConfirmedAffiliateUrl, matchesNiche, offerQuality, scoreOffer, type NicheRules, type OfferInput } from "./domain.js";
import { createDistributions, DistributionDestinationsError } from "./distribution.js";
import { requireN8nApiKey } from "./n8n-auth.js";
import { canonicalProductStatus, canTransitionProduct, productStatuses } from "./product-status.js";
import { runSearch } from "./services.js";
import { buildInstagramStoryPayload } from "./social-content.js";

const router = Router();
router.use((req, res, next) => {
  const n8nRoute =
    (req.method === "POST" && req.path === "/search/run") ||
    (req.method === "GET" && /^\/search\/jobs\/[^/]+$/.test(req.path)) ||
    (req.method === "GET" && ["/products/candidates", "/products/candidates/export.txt"].includes(req.path)) ||
    (req.method === "GET" && /^\/products\/[^/]+\/validate$/.test(req.path)) ||
    (req.method === "GET" && /^\/products\/[^/]+\/story$/.test(req.path)) ||
    (["POST", "PATCH"].includes(req.method) && /^\/products\/[^/]+(?:\/publish)?$/.test(req.path)) ||
    (req.method === "GET" && req.path === "/publications/history") ||
    (req.method === "POST" && req.path === "/logs/error");
  if (!n8nRoute) return next();
  return requireN8nApiKey(req, res, next);
});

const parseJsonList = (value: string): string[] => {
  try { return z.array(z.string()).parse(JSON.parse(value)); } catch { return []; }
};

const searchBodySchema = z.object({
  query: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(200).default(20),
  mode: z.enum(["quick", "wide"]).default("quick"),
  strategy: z.enum(["general", "best_sellers", "offers", "discount", "commission"]).default("general"),
  searchSource: z.enum(["affiliate_hub", "official_api"]).default("affiliate_hub"),
  filters: z.object({
    minCommission: z.number().min(0).max(100).optional(),
    minRating: z.number().min(0).max(5).optional(),
    minDiscount: z.number().min(0).max(100).optional(),
    minPrice: z.number().min(0).max(10_000_000).optional(),
    maxPrice: z.number().min(0).max(10_000_000).optional(),
    extraCommissionOnly: z.boolean().optional(),
    freeShippingOnly: z.boolean().optional(),
  }).optional(),
});

function apiError(res: Response, status: number, code: string, message: string, details?: unknown) {
  return res.status(status).json({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}

router.post("/search/run", async (req, res, next) => {
  const parsed = searchBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) return apiError(res, 400, "validation_error", "Parâmetros de busca inválidos.", parsed.error.flatten());
  if (parsed.data.filters?.maxPrice != null && parsed.data.filters.minPrice != null && parsed.data.filters.maxPrice < parsed.data.filters.minPrice) {
    return apiError(res, 400, "validation_error", "O preço máximo deve ser maior ou igual ao mínimo.");
  }
  try {
    const job = await db.schedulerRun.create({
      data: { trigger: "n8n", status: "running", details: JSON.stringify({ stage: "queued", requested: parsed.data.limit }) },
    });
    setImmediate(() => void runSearch(
      "n8n", parsed.data.query, parsed.data.limit, parsed.data.filters,
      parsed.data.strategy, parsed.data.mode, job.id, parsed.data.searchSource,
    ).catch((error) => console.error("Busca n8n:", error instanceof Error ? error.message : error)));
    res.status(202).json({ jobId: job.id, status: "running", statusUrl: `/api/search/jobs/${job.id}` });
  } catch (error) { next(error); }
});

router.get("/search/jobs/:jobId", async (req, res, next) => {
  try {
    const job = await db.schedulerRun.findUnique({ where: { id: req.params.jobId } });
    if (!job) return apiError(res, 404, "job_not_found", "Execução de busca não encontrada.");
    let details: unknown = {};
    try { details = JSON.parse(job.details); } catch { details = {}; }
    const status = job.status === "success" ? "succeeded" : job.status === "failed" || job.status === "cancelled" ? "failed" : "running";
    res.json({ jobId: job.id, status, internalStatus: job.status, startedAt: job.startedAt, finishedAt: job.finishedAt, foundCount: job.foundCount, errorCount: job.errorCount, details });
  } catch (error) { next(error); }
});

const candidatesQuerySchema = z.object({
  status: z.enum(productStatuses).optional(),
  nicheId: z.string().min(1).optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/products/candidates", async (req, res, next) => {
  const parsed = candidatesQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, 400, "validation_error", "Filtros de candidatos inválidos.", parsed.error.flatten());
  const { limit, offset, status, nicheId, minScore } = parsed.data;
  try {
    const where = {
      ...(status ? { status: status === "failed" ? { in: ["failed", "suspicious"] } : status } : {}),
      ...(nicheId ? { nicheId } : {}),
      ...(minScore == null ? {} : { score: { gte: minScore } }),
    };
    const [rows, total] = await Promise.all([
      db.offer.findMany({ where, include: { niche: { select: { id: true, name: true } } }, orderBy: [{ score: "desc" }, { discoveredAt: "desc" }], skip: offset, take: limit }),
      db.offer.count({ where }),
    ]);
    res.json({ items: rows.map((row) => ({ ...row, status: canonicalProductStatus(row.status), rawData: undefined })), pagination: { limit, offset, total, hasMore: offset + rows.length < total } });
  } catch (error) { next(error); }
});

router.get("/products/candidates/export.txt", async (req, res, next) => {
  const parsed = candidatesQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, 400, "validation_error", "Filtros de exportação inválidos.", parsed.error.flatten());
  try {
    const rows = await db.offer.findMany({
      where: {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.nicheId ? { nicheId: parsed.data.nicheId } : {}),
        ...(parsed.data.minScore == null ? {} : { score: { gte: parsed.data.minScore } }),
      },
      include: { niche: { select: { name: true } } },
      orderBy: [{ score: "desc" }, { discoveredAt: "desc" }],
      skip: parsed.data.offset,
      take: parsed.data.limit,
    });
    const lines = [
      "LICO PRIMOS — CANDIDATOS PARA REVISÃO",
      "ATENÇÃO: URLs normais do Mercado Livre não podem ser publicadas. Gere e cadastre o link oficial https://meli.la/ antes de aprovar.",
      "",
      ...rows.flatMap((offer, index) => [
        `${index + 1}. ${offer.title}`,
        `ID: ${offer.id} | Status: ${canonicalProductStatus(offer.status)} | Nicho: ${offer.niche?.name ?? "não definido"}`,
        `Preço: R$ ${offer.currentPrice.toFixed(2)} | Desconto: ${offer.discountPercent ?? 0}% | Nota: ${offer.rating ?? "sem nota"} | Score: ${offer.score}`,
        `Link para análise: ${offer.affiliateUrl ?? offer.originalUrl}`,
        "",
      ]),
    ];
    res.type("text/plain; charset=utf-8").setHeader("Content-Disposition", 'attachment; filename="candidatos-mercado-livre.txt"').send(lines.join("\n"));
  } catch (error) { next(error); }
});

function offerInput(offer: Awaited<ReturnType<typeof db.offer.findUniqueOrThrow>>): OfferInput {
  return {
    externalId: offer.externalId, storeId: offer.storeId, title: offer.title,
    imageUrl: offer.imageUrl ?? undefined, originalUrl: offer.originalUrl,
    affiliateUrl: offer.affiliateUrl ?? undefined, currentPrice: offer.currentPrice,
    previousPrice: offer.previousPrice ?? undefined, rating: offer.rating ?? undefined,
    reviewCount: offer.reviewCount ?? undefined, commissionPercent: offer.commissionPercent ?? undefined,
    extraCommissionPercent: offer.extraCommissionPercent ?? undefined, estimatedCommission: offer.estimatedCommission ?? undefined,
    seller: offer.seller ?? undefined, sellerReputation: offer.sellerReputation ?? undefined,
    shipping: offer.shipping ?? undefined, freeShipping: offer.freeShipping, stock: offer.stock ?? undefined,
    soldQuantity: offer.soldQuantity ?? undefined, sellerLevel: offer.sellerLevel ?? undefined,
    fullShipping: offer.fullShipping,
    reviewSentiment: offer.reviewSentiment ?? undefined, reviewsAnalyzed: offer.reviewsAnalyzed,
    reviewSignals: parseJsonList(offer.reviewSignals), promotionEndsAt: offer.promotionEndsAt?.toISOString(),
  };
}

router.get("/products/:id/validate", async (req, res, next) => {
  try {
    const offer = await db.offer.findUnique({ where: { id: req.params.id }, include: { niche: true, publications: { orderBy: { createdAt: "desc" }, take: 20 } } });
    if (!offer) return apiError(res, 404, "product_not_found", "Produto não encontrado.");
    const input = offerInput(offer);
    const quality = offerQuality(input);
    const nicheMatches = offer.niche ? matchesNiche(input, {
      wantedKeywords: parseJsonList(offer.niche.wantedKeywords), forbiddenKeywords: parseJsonList(offer.niche.forbiddenKeywords),
      allowedBrands: parseJsonList(offer.niche.allowedBrands), forbiddenBrands: parseJsonList(offer.niche.forbiddenBrands),
      minPrice: offer.niche.minPrice, maxPrice: offer.niche.maxPrice, minDiscount: offer.niche.minDiscount,
      minRating: offer.niche.minRating, minReviewCount: offer.niche.minReviewCount,
      minSellerReputation: offer.niche.minSellerReputation, freeShippingRequired: offer.niche.freeShippingRequired,
    } satisfies NicheRules) : false;
    const alreadyPublished = offer.publications.some((publication) => ["sent", "manual_complete"].includes(publication.status));
    res.json({
      productId: offer.id,
      status: canonicalProductStatus(offer.status),
      valid: quality.verified && nicheMatches && !alreadyPublished,
      nicheMatches,
      alreadyPublished,
      available: quality.checks.available,
      realPrice: quality.checks.realPrice,
      confirmedAffiliateLink: quality.checks.confirmedAffiliateLink,
      currentPrice: offer.currentPrice,
      affiliateUrl: offer.affiliateUrl,
      stock: offer.stock,
      freeShipping: offer.freeShipping,
      quality,
    });
  } catch (error) { next(error); }
});

router.get("/products/:id/story", async (req, res, next) => {
  try {
    const offer = await db.offer.findUnique({ where: { id: req.params.id } });
    if (!offer) return apiError(res, 404, "product_not_found", "Produto não encontrado.");
    res.json(buildInstagramStoryPayload(offerInput(offer)));
  } catch (error) { next(error); }
});

const patchProductSchema = z.object({
  status: z.enum(productStatuses).optional(),
  title: z.string().trim().min(3).max(500).optional(),
  affiliateUrl: z.string().url().refine(isConfirmedAffiliateUrl, "Use um link oficial https://meli.la/.").nullable().optional(),
  currentPrice: z.number().positive().max(10_000_000).optional(),
  previousPrice: z.number().positive().max(10_000_000).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).nullable().optional(),
  stock: z.number().int().min(0).nullable().optional(),
  freeShipping: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "Informe ao menos um campo.");

router.patch("/products/:id", async (req, res, next) => {
  const parsed = patchProductSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, "validation_error", "Alteração de produto inválida.", parsed.error.flatten());
  try {
    const current = await db.offer.findUnique({ where: { id: req.params.id } });
    if (!current) return apiError(res, 404, "product_not_found", "Produto não encontrado.");
    if (parsed.data.status && !canTransitionProduct(current.status, parsed.data.status)) {
      return apiError(res, 409, "invalid_status_transition", `Não é permitido alterar ${canonicalProductStatus(current.status)} para ${parsed.data.status}.`);
    }
    const nextAffiliateUrl = parsed.data.affiliateUrl === undefined ? current.affiliateUrl : parsed.data.affiliateUrl;
    if (parsed.data.status && ["approved", "queued", "published"].includes(parsed.data.status) && !isConfirmedAffiliateUrl(nextAffiliateUrl)) {
      return apiError(res, 409, "affiliate_link_required", "Um link oficial meli.la é obrigatório para este status.");
    }
    if (parsed.data.status === "published") {
      const completedPublication = await db.publication.findFirst({
        where: { offerId: current.id, status: { in: ["sent", "manual_complete"] } },
        select: { id: true },
      });
      if (!completedPublication) {
        return apiError(res, 409, "publication_not_completed", "O produto só pode ser marcado como publicado depois de um envio concluído.");
      }
    }
    const prospective = offerInput({ ...current, ...parsed.data } as typeof current);
    const updated = await db.$transaction(async (tx) => {
      const automaticStatus = parsed.data.affiliateUrl && current.status === "awaiting_affiliate_link" && !parsed.data.status ? "pending" : undefined;
      const offer = await tx.offer.update({ where: { id: current.id }, data: {
        ...parsed.data,
        status: parsed.data.status ?? automaticStatus,
        discountPercent: calculateDiscount(prospective.currentPrice, prospective.previousPrice),
        score: scoreOffer(prospective),
        publishedAt: parsed.data.status === "published" ? new Date() : undefined,
      } });
      if (parsed.data.affiliateUrl) {
        await tx.affiliateLink.upsert({
          where: { id: `affiliate-link-${offer.id}` },
          update: { url: parsed.data.affiliateUrl, source: "manual_n8n" },
          create: { id: `affiliate-link-${offer.id}`, offerId: offer.id, url: parsed.data.affiliateUrl, source: "manual_n8n" },
        });
        await tx.publication.upsert({
          where: { id: `queue-${offer.id}` },
          update: { message: formatOfferMessage(offerInput(offer)) },
          create: { id: `queue-${offer.id}`, offerId: offer.id, message: formatOfferMessage(offerInput(offer)) },
        });
      }
      await tx.auditLog.create({ data: { action: "n8n.product.updated", entityType: "Offer", entityId: offer.id, metadata: JSON.stringify({ fields: Object.keys(parsed.data), statusBefore: current.status, statusAfter: offer.status }) } });
      return offer;
    });
    res.json({ ...updated, status: canonicalProductStatus(updated.status), rawData: undefined });
  } catch (error) { next(error); }
});

const publishBodySchema = z.object({
  channelIds: z.array(z.string().min(1)).min(1).max(10),
  name: z.string().trim().min(3).max(100).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  intervalMinutes: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10), z.literal(30), z.literal(60)]).default(5),
  dryRun: z.boolean().default(false),
});

router.post("/products/:id/publish", async (req, res, next) => {
  const parsed = publishBodySchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, "validation_error", "Parâmetros de publicação inválidos.", parsed.error.flatten());
  const idempotencyKey = req.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return apiError(res, 400, "idempotency_key_required", "Envie um cabeçalho Idempotency-Key entre 8 e 200 caracteres.");
  }
  const operation = `publish:${req.params.id}`;
  const requestHash = crypto.createHash("sha256").update(JSON.stringify(parsed.data)).digest("hex");
  try {
    const existing = await db.apiIdempotencyKey.findUnique({ where: { operation_key: { operation, key: idempotencyKey } } });
    if (existing) {
      if (existing.requestHash !== requestHash) return apiError(res, 409, "idempotency_conflict", "A mesma chave foi usada com outro conteúdo.");
      if (existing.state === "completed" && existing.responseBody && existing.responseStatus) {
        return res.status(existing.responseStatus).json(JSON.parse(existing.responseBody));
      }
      return apiError(res, 409, "request_in_progress", "Uma publicação com essa chave está em andamento.");
    }
    try {
      await db.apiIdempotencyKey.create({ data: { key: idempotencyKey, operation, requestHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const concurrent = await db.apiIdempotencyKey.findUniqueOrThrow({ where: { operation_key: { operation, key: idempotencyKey } } });
      if (concurrent.requestHash !== requestHash) return apiError(res, 409, "idempotency_conflict", "A mesma chave foi usada com outro conteúdo.");
      if (concurrent.state === "completed" && concurrent.responseBody && concurrent.responseStatus) {
        return res.status(concurrent.responseStatus).json(JSON.parse(concurrent.responseBody));
      }
      return apiError(res, 409, "request_in_progress", "Uma publicação com essa chave está em andamento.");
    }
    try {
      const offer = await db.offer.findUnique({ where: { id: req.params.id } });
      if (!offer) {
        await db.apiIdempotencyKey.delete({ where: { operation_key: { operation, key: idempotencyKey } } });
        return apiError(res, 404, "product_not_found", "Produto não encontrado.");
      }
      if (canonicalProductStatus(offer.status) !== "approved") {
        await db.apiIdempotencyKey.delete({ where: { operation_key: { operation, key: idempotencyKey } } });
        return apiError(res, 409, "product_not_approved", "Apenas produtos aprovados podem entrar na fila de publicação.");
      }
      if (!isConfirmedAffiliateUrl(offer.affiliateUrl)) {
        await db.apiIdempotencyKey.delete({ where: { operation_key: { operation, key: idempotencyKey } } });
        return apiError(res, 409, "affiliate_link_required", "O produto não possui link oficial meli.la.");
      }
      if (parsed.data.dryRun) {
        const body = {
          productId: offer.id,
          status: "approved",
          dryRun: true,
          distribution: {
            created: 0,
            skippedWithoutAffiliateLink: 0,
            startNow: false,
            preview: {
              channelIds: parsed.data.channelIds,
              name: parsed.data.name ?? null,
              scheduledAt: parsed.data.scheduledAt ?? null,
              intervalMinutes: parsed.data.intervalMinutes,
            },
          },
        };
        await db.apiIdempotencyKey.update({ where: { operation_key: { operation, key: idempotencyKey } }, data: { state: "completed", responseStatus: 200, responseBody: JSON.stringify(body) } });
        await db.auditLog.create({ data: { action: "n8n.product.publish_dry_run", entityType: "Offer", entityId: offer.id, metadata: JSON.stringify({ idempotencyKeyHash: crypto.createHash("sha256").update(idempotencyKey).digest("hex"), dryRun: true, channelIds: parsed.data.channelIds }) } });
        return res.status(200).json(body);
      }
      const distribution = await createDistributions({ offerIds: [offer.id], channelIds: parsed.data.channelIds, name: parsed.data.name, scheduledAt: parsed.data.scheduledAt, intervalMinutes: parsed.data.intervalMinutes, intervalMode: "fixed" });
      await db.offer.update({ where: { id: offer.id }, data: { status: "queued" } });
      const body = { productId: offer.id, status: "queued", dryRun: config.DRY_RUN || !config.EXTERNAL_PUBLISHING_ENABLED, distribution };
      await db.apiIdempotencyKey.update({ where: { operation_key: { operation, key: idempotencyKey } }, data: { state: "completed", responseStatus: 202, responseBody: JSON.stringify(body) } });
      await db.auditLog.create({ data: { action: "n8n.product.queued", entityType: "Offer", entityId: offer.id, metadata: JSON.stringify({ idempotencyKeyHash: crypto.createHash("sha256").update(idempotencyKey).digest("hex"), dryRun: body.dryRun }) } });
      res.status(202).json(body);
    } catch (error) {
      await db.apiIdempotencyKey.deleteMany({ where: { operation, key: idempotencyKey, state: "processing" } });
      if (error instanceof DistributionDestinationsError) {
        return apiError(res, 400, "invalid_destinations", error.message, { channelIds: error.destinationIds });
      }
      throw error;
    }
  } catch (error) { next(error); }
});

const historyQuerySchema = z.object({
  productId: z.string().min(1).optional(),
  status: z.enum(productStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get("/publications/history", async (req, res, next) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) return apiError(res, 400, "validation_error", "Filtros de histórico inválidos.", parsed.error.flatten());
  try {
    const where = { ...(parsed.data.productId ? { offerId: parsed.data.productId } : {}) };
    const all = await db.publication.findMany({ where, include: { offer: { select: { id: true, title: true, externalId: true } } }, orderBy: { createdAt: "desc" } });
    const mapped = all.map((row) => ({ ...row, status: canonicalProductStatus(row.status) })).filter((row) => !parsed.data.status || row.status === parsed.data.status);
    const items = mapped.slice(parsed.data.offset, parsed.data.offset + parsed.data.limit);
    res.json({ items, pagination: { limit: parsed.data.limit, offset: parsed.data.offset, total: mapped.length, hasMore: parsed.data.offset + items.length < mapped.length } });
  } catch (error) { next(error); }
});

const errorLogSchema = z.object({
  executionId: z.union([z.string(), z.number()]).transform(String).optional(),
  workflowId: z.union([z.string(), z.number()]).transform(String).optional(),
  workflowName: z.string().trim().max(200).optional(),
  node: z.string().trim().max(200).optional(),
  productId: z.string().trim().max(200).optional(),
  endpoint: z.string().trim().max(500).optional(),
  httpStatus: z.coerce.number().int().min(0).max(599).optional(),
  message: z.string().trim().min(1).max(2000),
  timestamp: z.string().datetime({ offset: true }).optional(),
  attempts: z.coerce.number().int().min(0).max(100).optional(),
}).strict();

router.post("/logs/error", async (req, res, next) => {
  const parsed = errorLogSchema.safeParse(req.body);
  if (!parsed.success) return apiError(res, 400, "validation_error", "Registro de erro inválido.", parsed.error.flatten());
  try {
    const log = await db.auditLog.create({
      data: {
        action: "n8n.workflow.error",
        entityType: "N8nExecution",
        entityId: parsed.data.executionId,
        metadata: JSON.stringify({ ...parsed.data, receivedAt: new Date().toISOString() }),
      },
    });
    res.status(201).json({ registered: true, logId: log.id });
  } catch (error) { next(error); }
});

export const n8nApiRouter = router;
