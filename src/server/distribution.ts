import { z } from "zod";
import { db } from "./db.js";
import { formatOfferMessage, isConfirmedAffiliateUrl } from "./domain.js";
import { distributionConnections } from "./platform-settings.js";
import { sendWhatsAppWebOffer, whatsappWebStatus } from "./whatsapp-web.js";
import { config } from "./config.js";
import { quietHoursDecision } from "./delivery-policy.js";

const WHATSAPP_OFFLINE_ERROR = "WhatsApp Web desconectado";

export class DistributionDestinationsError extends Error {
  constructor(public readonly destinationIds: string[]) {
    super(`Destinos inexistentes ou desativados: ${destinationIds.join(", ")}. Nenhuma publicação foi criada.`);
    this.name = "DistributionDestinationsError";
  }
}

function isWhatsAppConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /WhatsApp (Web )?(desconectado|não ficou pronto)|Conecte o WhatsApp|QR Code/i.test(message);
}

type DistributionCampaign = {
  id: string;
  name: string;
  status: "scheduled" | "running" | "paused" | "completed" | "completed_with_errors" | "cancelled";
  publicationIds: string[];
  channelIds: string[];
  offerCount: number;
  intervalMinutes: number;
  intervalMode?: "fixed" | "safe_random";
  scheduledAt: string;
  createdAt: string;
};

const CAMPAIGNS_KEY = "distributionCampaigns";
async function readCampaigns(): Promise<DistributionCampaign[]> {
  const setting = await db.setting.findUnique({ where: { key: CAMPAIGNS_KEY } });
  if (!setting) return [];
  try { return JSON.parse(setting.value) as DistributionCampaign[]; } catch { return []; }
}
async function writeCampaigns(campaigns: DistributionCampaign[]) {
  const value = JSON.stringify(campaigns.slice(0, 100));
  await db.setting.upsert({ where: { key: CAMPAIGNS_KEY }, update: { value }, create: { key: CAMPAIGNS_KEY, value } });
}

export const distributionInputSchema = z.object({
  offerIds: z.array(z.string()).min(1).max(200),
  channelIds: z.array(z.string()).min(1).max(10),
  name: z.string().trim().min(3).max(100).optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  intervalMinutes: z
    .union([
      z.literal(1),
      z.literal(2),
      z.literal(5),
      z.literal(10),
      z.literal(30),
      z.literal(60),
    ])
    .default(5),
  intervalMode: z.enum(["fixed", "safe_random"]).default("fixed"),
});

const randomSafeIntervalMinutes = () => 2 + Math.floor(Math.random() * 14);
const startOfToday = () => { const value = new Date(); value.setHours(0, 0, 0, 0); return value; };
const endOfToday = () => { const value = new Date(); value.setHours(23, 59, 59, 999); return value; };
const nextSafeWindow = () => { const value = new Date(); value.setDate(value.getDate() + 1); value.setHours(8, Math.floor(Math.random() * 31), 0, 0); return value; };

async function dailyWhatsAppLimitReached(destination: string) {
  const [groupSent, totalSent] = await Promise.all([
    db.publication.count({ where: { destination, status: "sent", publishedAt: { gte: startOfToday(), lte: endOfToday() } } }),
    db.publication.count({ where: { destination: { not: "manual" }, status: "sent", publishedAt: { gte: startOfToday(), lte: endOfToday() } } }),
  ]);
  const groupLimit = Math.max(1, Number(process.env.WHATSAPP_DAILY_GROUP_LIMIT ?? 15));
  const totalLimit = Math.max(groupLimit, Number(process.env.WHATSAPP_DAILY_TOTAL_LIMIT ?? 100));
  return groupSent >= groupLimit || totalSent >= totalLimit;
}

export async function listDistributions() {
  const { channels } = await distributionConnections();
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  const rows = await db.publication.findMany({
    where: { destination: { not: "manual" } },
    include: { offer: true },
    orderBy: { createdAt: "desc" },
    take: 150,
  });
  return rows.map((row) => ({
    ...row,
    channel: channelMap.get(row.destination) ?? null,
  }));
}

export async function createDistributions(input: unknown) {
  const value = distributionInputSchema.parse(input);
  const { channels } = await distributionConnections();
  const destinations = channels.filter(
    (channel) => value.channelIds.includes(channel.id) && channel.enabled,
  );
  const resolvedDestinationIds = new Set(destinations.map((channel) => channel.id));
  const unavailableDestinationIds = [...new Set(value.channelIds)].filter(
    (channelId) => !resolvedDestinationIds.has(channelId),
  );
  if (unavailableDestinationIds.length) {
    throw new DistributionDestinationsError(unavailableDestinationIds);
  }
  const offers = await db.offer.findMany({
    where: {
      id: { in: value.offerIds },
    },
  });
  const validOffers = offers.filter((offer) => isConfirmedAffiliateUrl(offer.affiliateUrl));
  if (!validOffers.length)
    throw new Error(
      "As ofertas selecionadas precisam de um link de afiliado confirmado.",
    );
  const baseTime = value.scheduledAt
    ? new Date(value.scheduledAt).getTime()
    : Date.now();
  let created = 0;
  const campaignId = `campaign-${crypto.randomUUID()}`;
  const publicationIds: string[] = [];
  let elapsedMinutes = 0;
  for (const [offerIndex, offer] of validOffers.entries()) {
    if (offerIndex > 0) elapsedMinutes += value.intervalMode === "safe_random" ? randomSafeIntervalMinutes() : value.intervalMinutes;
    for (const channel of destinations) {
      const scheduledAt = new Date(
        baseTime + elapsedMinutes * 60_000,
      );
      const status = "scheduled";
      const id = `${campaignId}-${offer.id}-${channel.id}`;
      const message = formatOfferMessage({
        externalId: offer.externalId,
        storeId: offer.storeId,
        title: offer.title,
        imageUrl: offer.imageUrl ?? undefined,
        originalUrl: offer.originalUrl,
        affiliateUrl: offer.affiliateUrl!,
        currentPrice: offer.currentPrice,
        previousPrice: offer.previousPrice ?? undefined,
        rating: offer.rating ?? undefined,
        reviewCount: offer.reviewCount ?? undefined,
        seller: offer.seller ?? undefined,
        sellerReputation: offer.sellerReputation ?? undefined,
        shipping: offer.shipping ?? undefined,
        freeShipping: offer.freeShipping,
        stock: offer.stock ?? undefined,
        soldQuantity: offer.soldQuantity ?? undefined,
        sellerLevel: offer.sellerLevel ?? undefined,
        fullShipping: offer.fullShipping,
        reviewSentiment: offer.reviewSentiment ?? undefined,
        reviewsAnalyzed: offer.reviewsAnalyzed,
        reviewSignals: (() => { try { return JSON.parse(offer.reviewSignals) as string[]; } catch { return []; } })(),
        promotionEndsAt: offer.promotionEndsAt?.toISOString(),
      }, true, { destinationName: channel.name });
      await db.publication.upsert({
        where: { id },
        update: { message, status, scheduledAt, lastError: null },
        create: {
          id,
          offerId: offer.id,
          destination: channel.id,
          message,
          status,
          scheduledAt,
        },
      });
      publicationIds.push(id);
      created++;
    }
  }
  const campaigns = await readCampaigns();
  const campaign: DistributionCampaign = {
    id: campaignId,
    name: value.name || `Campanha de ${new Date().toLocaleDateString("pt-BR")}`,
    status: value.scheduledAt ? "scheduled" : "running",
    publicationIds,
    channelIds: destinations.map((channel) => channel.id),
    offerCount: validOffers.length,
    intervalMinutes: value.intervalMinutes,
    intervalMode: value.intervalMode,
    scheduledAt: new Date(baseTime).toISOString(),
    createdAt: new Date().toISOString(),
  };
  campaigns.unshift(campaign);
  await writeCampaigns(campaigns);
  return {
    created,
    skippedWithoutAffiliateLink: offers.length - validOffers.length,
    campaign,
    startNow: !value.scheduledAt,
  };
}

export async function listDistributionCampaigns() {
  const campaigns = await readCampaigns();
  const { channels } = await distributionConnections();
  const channelMap = new Map(channels.map((channel) => [channel.id, channel]));
  return Promise.all(campaigns.map(async (campaign) => {
    const jobs = await db.publication.findMany({ where: { id: { in: campaign.publicationIds } }, include: { offer: true }, orderBy: { scheduledAt: "asc" } });
    const sent = jobs.filter((job) => job.status === "sent").length;
    const failed = jobs.filter((job) => job.status === "failed").length;
    const pending = jobs.filter((job) => ["scheduled", "sending", "paused"].includes(job.status)).length;
    const cancelled = jobs.filter((job) => job.status === "cancelled").length;
    let status = campaign.status;
    if (jobs.length && sent === jobs.length) status = "completed";
    else if (jobs.length && sent + failed === jobs.length) status = failed ? "completed_with_errors" : "completed";
    else if (status !== "paused" && status !== "cancelled" && sent > 0) status = "running";
    return {
      ...campaign, status, totalMessages: jobs.length, sent, failed, pending, cancelled,
      channels: campaign.channelIds.map((id) => channelMap.get(id)).filter(Boolean),
      nextJob: jobs.find((job) => ["scheduled", "sending", "paused"].includes(job.status)) ?? null,
      jobs,
    };
  }));
}

export async function controlDistributionCampaign(id: string, action: "pause" | "resume" | "cancel") {
  const campaigns = await readCampaigns();
  const campaign = campaigns.find((item) => item.id === id);
  if (!campaign) throw new Error("Campanha não encontrada.");
  if (action === "pause") {
    await db.publication.updateMany({ where: { id: { in: campaign.publicationIds }, status: "scheduled" }, data: { status: "paused" } });
    campaign.status = "paused";
  } else if (action === "cancel") {
    await db.publication.updateMany({ where: { id: { in: campaign.publicationIds }, status: { in: ["scheduled", "paused", "failed"] } }, data: { status: "cancelled" } });
    campaign.status = "cancelled";
  } else {
    const pending = await db.publication.findMany({ where: { id: { in: campaign.publicationIds }, status: { in: ["paused", "failed", "cancelled"] } }, orderBy: { scheduledAt: "asc" } });
    if (!pending.length) throw new Error("Esta campanha não possui envios pendentes para retomar.");

    // Se o destino já atingiu o limite de hoje, retomamos na próxima janela
    // segura. Assim a fila não fica tentando a cada minuto nem ultrapassa o teto.
    const destinations = [...new Set(pending.map((job) => job.destination))];
    const limitChecks = await Promise.all(destinations.map((destination) => dailyWhatsAppLimitReached(destination)));
    const baseTime = limitChecks.some(Boolean) ? nextSafeWindow().getTime() : Date.now();
    let elapsedMinutes = 0;
    for (const [index, job] of pending.entries()) {
      if (index > 0) elapsedMinutes += campaign.intervalMode === "safe_random" ? randomSafeIntervalMinutes() : campaign.intervalMinutes;
      await db.publication.update({
        where: { id: job.id },
        data: {
          status: "scheduled",
          scheduledAt: new Date(baseTime + elapsedMinutes * 60_000),
          nextAttemptAt: null,
          lastError: null,
        },
      });
    }
    campaign.status = baseTime > Date.now() + 60_000 ? "scheduled" : "running";
    campaign.scheduledAt = new Date(baseTime).toISOString();
  }
  await writeCampaigns(campaigns);
  await db.auditLog.create({
    data: {
      action: `distribution.campaign.${action}`,
      entityType: "DistributionCampaign",
      entityId: campaign.id,
      metadata: JSON.stringify({ status: campaign.status }),
    },
  });
  return campaign;
}

export async function deleteDistributionCampaign(id: string) {
  const campaigns = await readCampaigns();
  const campaign = campaigns.find((item) => item.id === id);
  if (!campaign) throw new Error("Campanha não encontrada.");
  if (!["cancelled", "completed", "completed_with_errors"].includes(campaign.status))
    throw new Error("Somente campanhas canceladas ou concluídas podem ser excluídas.");
  await db.publication.deleteMany({
    where: { id: { in: campaign.publicationIds } },
  });
  await writeCampaigns(campaigns.filter((item) => item.id !== id));
  return { deleted: true };
}

export async function sendDistribution(id: string) {
  const publication = await db.publication.findUnique({
    where: { id },
    include: { offer: true },
  });
  if (!publication || publication.destination === "manual")
    throw new Error("Distribuição não encontrada.");
  if (config.DRY_RUN || !config.EXTERNAL_PUBLISHING_ENABLED) {
    await db.publication.update({
      where: { id },
      data: {
        status: "paused",
        nextAttemptAt: null,
        lastError: "Envio bloqueado pelas travas DRY_RUN/EXTERNAL_PUBLISHING_ENABLED.",
      },
    });
    await db.auditLog.create({
      data: {
        action: "distribution.blocked.dry_run",
        entityType: "Publication",
        entityId: id,
      },
    });
    return { sent: false, dryRun: true, blocked: true };
  }
  const { channels, messaging } = await distributionConnections();
  const channel = channels.find((item) => item.id === publication.destination);
  if (!channel) throw new Error("Destino não encontrado.");
  if (channel.type === "whatsapp") {
    if (!isConfirmedAffiliateUrl(publication.offer.affiliateUrl))
      throw new Error("O produto não possui um link oficial de afiliado confirmado.");
    const quietHours = quietHoursDecision(new Date(), config.TIMEZONE, process.env.WHATSAPP_QUIET_START ?? "23:30", process.env.WHATSAPP_QUIET_END ?? "07:00");
    if (!quietHours.allowed) {
      await db.publication.update({ where: { id }, data: { status: "scheduled", scheduledAt: quietHours.nextAllowedAt, lastError: "Envio adiado pela janela silenciosa." } });
      return { sent: false, deferred: true, reason: "quiet_hours", scheduledAt: quietHours.nextAllowedAt };
    }
    if (await dailyWhatsAppLimitReached(publication.destination)) {
      const scheduledAt = nextSafeWindow();
      await db.publication.update({ where: { id }, data: { status: "scheduled", scheduledAt, nextAttemptAt: null, lastError: "Limite diário de segurança atingido; envio adiado automaticamente." } });
      await db.auditLog.create({ data: { action: "distribution.deferred.daily_limit", entityType: "Publication", entityId: id, metadata: JSON.stringify({ destination: publication.destination, scheduledAt }) } });
      return { sent: false, deferred: true, scheduledAt };
    }
    await db.publication.update({
      where: { id },
      data: { status: "sending", attempts: { increment: 1 }, lastError: null },
    });
    try {
      const whatsappOffer = {
        externalId: publication.offer.externalId,
        storeId: publication.offer.storeId,
        title: publication.offer.title,
        imageUrl: publication.offer.imageUrl ?? undefined,
        originalUrl: publication.offer.originalUrl,
        affiliateUrl: publication.offer.affiliateUrl ?? undefined,
        currentPrice: publication.offer.currentPrice,
        previousPrice: publication.offer.previousPrice ?? undefined,
        rating: publication.offer.rating ?? undefined,
        reviewCount: publication.offer.reviewCount ?? undefined,
        seller: publication.offer.seller ?? undefined,
        sellerReputation: publication.offer.sellerReputation ?? undefined,
        shipping: publication.offer.shipping ?? undefined,
        freeShipping: publication.offer.freeShipping,
        stock: publication.offer.stock ?? undefined,
        soldQuantity: publication.offer.soldQuantity ?? undefined,
        sellerLevel: publication.offer.sellerLevel ?? undefined,
        fullShipping: publication.offer.fullShipping,
        reviewSentiment: publication.offer.reviewSentiment ?? undefined,
        reviewsAnalyzed: publication.offer.reviewsAnalyzed,
        reviewSignals: (() => { try { return JSON.parse(publication.offer.reviewSignals) as string[]; } catch { return []; } })(),
        promotionEndsAt: publication.offer.promotionEndsAt?.toISOString(),
      };
      const result = await sendWhatsAppWebOffer(
        channel.externalId,
        formatOfferMessage(whatsappOffer, true, { destinationName: channel.name }),
        publication.offer.imageUrl,
      );
      await db.publication.update({
        where: { id },
        data: { status: "sent", publishedAt: new Date(), nextAttemptAt: null, lastError: null },
      });
      await db.auditLog.create({
        data: {
          action: "distribution.sent",
          entityType: "Publication",
          entityId: id,
          metadata: JSON.stringify({
            channelId: channel.id,
            type: channel.type,
            messageId: result.messageId,
            withImage: result.withImage,
            affiliateUrl: publication.offer.affiliateUrl,
            tracking: { source: "mercado_livre", medium: channel.type, campaign: publication.id.split("-").slice(0, 6).join("-"), content: publication.offer.externalId },
          }),
        },
      });
      return result;
    } catch (error) {
      const connectionUnavailable = isWhatsAppConnectionError(error);
      await db.publication.update({
        where: { id },
        data: {
          // Uma sessão offline não é falha do produto. Mantemos o item pendente
          // para retomá-lo automaticamente assim que o WhatsApp reconectar.
          status: connectionUnavailable ? "scheduled" : "failed",
          attempts: connectionUnavailable ? { decrement: 1 } : undefined,
          lastError: error instanceof Error ? error.message : "Falha desconhecida",
          scheduledAt: connectionUnavailable
            ? new Date(Date.now() + 60_000)
            : undefined,
          nextAttemptAt: connectionUnavailable
            ? null
            : new Date(Date.now() + ([1, 5, 15][Math.min(publication.attempts, 2)] ?? 15) * 60_000),
        },
      });
      throw error;
    }
  }
  if (!messaging?.telegram.botToken || !channel.externalId)
    throw new Error(
      "Configure o token do Telegram e o ID do canal antes de enviar.",
    );
  await db.publication.update({
    where: { id },
    data: { status: "sending", attempts: { increment: 1 }, lastError: null },
  });
  try {
    const hasImage = Boolean(publication.offer.imageUrl);
    const response = await fetch(
      `https://api.telegram.org/bot${messaging.telegram.botToken}/${hasImage ? "sendPhoto" : "sendMessage"}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          hasImage
            ? {
                chat_id: channel.externalId,
                photo: publication.offer.imageUrl,
                caption: publication.message,
                parse_mode: "Markdown",
              }
            : {
                chat_id: channel.externalId,
                text: publication.message,
                parse_mode: "Markdown",
                disable_web_page_preview: false,
              },
        ),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const result = (await response.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    if (!response.ok || !result.ok)
      throw new Error(
        result.description || `Telegram respondeu com erro ${response.status}.`,
      );
    await db.publication.update({
      where: { id },
      data: { status: "sent", publishedAt: new Date() },
    });
    await db.auditLog.create({
      data: {
        action: "distribution.sent",
        entityType: "Publication",
        entityId: id,
        metadata: JSON.stringify({ channelId: channel.id, type: channel.type }),
      },
    });
    return { sent: true };
  } catch (error) {
    await db.publication.update({
      where: { id },
      data: {
        status: "failed",
        lastError:
          error instanceof Error ? error.message : "Falha desconhecida",
      },
    });
    throw error;
  }
}

export async function processScheduledDistributions() {
  // Campanhas antigas podiam esgotar as tentativas somente porque a sessão
  // estava offline. Ao reconectar, devolvemos esses itens à fila.
  if (whatsappWebStatus().status === "ready") {
    await db.publication.updateMany({
      where: {
        status: "failed",
        destination: { not: "manual" },
        lastError: { startsWith: WHATSAPP_OFFLINE_ERROR },
      },
      data: {
        status: "scheduled",
        attempts: 0,
        scheduledAt: new Date(),
        nextAttemptAt: null,
      },
    });
  }
  const due = await db.publication.findMany({
    where: {
      OR: [
        { status: "scheduled", scheduledAt: { lte: new Date() } },
        { status: "failed", attempts: { lt: 3 }, nextAttemptAt: { lte: new Date() } },
      ],
      destination: { not: "manual" },
    },
    select: { id: true },
    take: 10,
  });
  for (const job of due)
    await sendDistribution(job.id).catch((error) =>
      console.error(
        "Distribuição agendada:",
        error instanceof Error ? error.message : error,
      ),
    );
}
