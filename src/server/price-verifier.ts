import { db } from "./db.js";
import { calculateDiscount, isConfirmedAffiliateUrl, type OfferInput } from "./domain.js";
import { adapters } from "./integrations.js";

export type PriceInspection = {
  active: boolean;
  price: number;
  previousPrice?: number;
  stock: number;
  freeShipping: boolean;
  permalink?: string;
  imageUrl?: string;
};

export function priceChange(previous: number, current: number) {
  if (!Number.isFinite(previous) || !Number.isFinite(current) || previous <= 0) return 0;
  return Math.round(((current - previous) / previous) * 10_000) / 100;
}

const toInput = (offer: {
  externalId: string; storeId: string; title: string; imageUrl: string | null;
  originalUrl: string; affiliateUrl: string | null; currentPrice: number;
  previousPrice: number | null; rating: number | null; reviewCount: number | null;
  seller: string | null; sellerReputation: number | null; shipping: string | null;
  freeShipping: boolean; stock: number | null;
}): OfferInput => ({
  externalId: offer.externalId, storeId: offer.storeId, title: offer.title,
  imageUrl: offer.imageUrl ?? undefined, originalUrl: offer.originalUrl,
  affiliateUrl: offer.affiliateUrl ?? undefined, currentPrice: offer.currentPrice,
  previousPrice: offer.previousPrice ?? undefined, rating: offer.rating ?? undefined,
  reviewCount: offer.reviewCount ?? undefined, seller: offer.seller ?? undefined,
  sellerReputation: offer.sellerReputation ?? undefined, shipping: offer.shipping ?? undefined,
  freeShipping: offer.freeShipping, stock: offer.stock ?? undefined,
});

async function replacementFor(offerId: string, nicheId: string | null) {
  if (!nicheId) return null;
  return db.offer.findFirst({
    where: { id: { not: offerId }, nicheId, status: { in: ["pending", "approved"] }, stock: { gt: 0 }, affiliateUrl: { startsWith: "https://meli.la/" } },
    orderBy: [{ score: "desc" }, { discoveredAt: "desc" }],
    select: { id: true, title: true, affiliateUrl: true, currentPrice: true },
  });
}

export async function verifyOfferPrices(trigger = "periodic", requestedLimit?: number) {
  const limit = Math.max(1, Math.min(100, requestedLimit ?? Number(process.env.PRICE_VERIFIER_BATCH_SIZE ?? 20)));
  const run = await db.schedulerRun.create({ data: { trigger: `price_verifier:${trigger}`, status: "running" } });
  const offers = await db.offer.findMany({
    where: { status: { in: ["pending", "approved", "published", "suspicious"] }, affiliateUrl: { not: null } },
    orderBy: { discoveredAt: "asc" }, take: limit,
  });
  let checked = 0; let changed = 0; let expired = 0; let errors = 0;
  for (const offer of offers) {
    const adapter = adapters.find((item) => item.id === offer.storeId);
    if (!adapter?.enabled || !adapter.inspect || !isConfirmedAffiliateUrl(offer.affiliateUrl)) continue;
    try {
      const inspection = await adapter.inspect(toInput(offer));
      const deltaPercent = priceChange(offer.currentPrice, inspection.price);
      const status = inspection.active ? (offer.status === "expired" ? "pending" : offer.status) : "expired";
      const didChange = inspection.price !== offer.currentPrice;
      const replacement = inspection.active ? null : await replacementFor(offer.id, offer.nicheId);
      await db.offer.update({ where: { id: offer.id }, data: {
        currentPrice: inspection.price, previousPrice: inspection.previousPrice ?? offer.currentPrice,
        discountPercent: calculateDiscount(inspection.price, inspection.previousPrice ?? offer.currentPrice),
        stock: inspection.stock, freeShipping: inspection.freeShipping, status,
        originalUrl: inspection.permalink ?? offer.originalUrl, imageUrl: inspection.imageUrl ?? offer.imageUrl,
      } });
      if (didChange) await db.priceHistory.create({ data: { offerId: offer.id, price: inspection.price } });
      await db.auditLog.create({ data: {
        action: !inspection.active ? "price_verifier.expired" : deltaPercent <= -15 ? "price_verifier.price_drop" : "price_verifier.checked",
        entityType: "Offer", entityId: offer.id,
        metadata: JSON.stringify({ oldPrice: offer.currentPrice, newPrice: inspection.price, deltaPercent, active: inspection.active, replacement, checkedAt: new Date().toISOString() }),
      } });
      checked++; if (didChange) changed++; if (!inspection.active) expired++;
    } catch (error) {
      errors++;
      await db.auditLog.create({ data: { action: "price_verifier.failed", entityType: "Offer", entityId: offer.id, metadata: JSON.stringify({ message: error instanceof Error ? error.message : "Erro desconhecido" }) } });
    }
  }
  const result = { checked, changed, expired, errors, finishedAt: new Date().toISOString() };
  await db.schedulerRun.update({ where: { id: run.id }, data: { status: errors && !checked ? "failed" : "success", finishedAt: new Date(), foundCount: changed, errorCount: errors, details: JSON.stringify(result) } });
  await db.setting.upsert({ where: { key: "price_verifier_last_run" }, update: { value: JSON.stringify(result) }, create: { key: "price_verifier_last_run", value: JSON.stringify(result) } });
  return result;
}
