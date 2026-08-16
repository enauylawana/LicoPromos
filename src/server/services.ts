import { db } from './db.js';
import { convertCatalogCandidate, discoverMercadoLivreCatalog, searchAffiliateBestSellers, searchAffiliateProductByUrl, type SearchStrategy } from './affiliate-hub.js';
import { calculateDiscount, formatOfferMessage, matchesNiche, offerQuality, scoreOffer, type NicheRules } from './domain.js';
import { MercadoLivreAdapter } from './integrations.js';
import { catalogKeywords, chooseSearchKeyword, expandKeyword, type KeywordHistory } from './keyword-catalog.js';

const parseList = (value: string): string[] => { try { return JSON.parse(value); } catch { return []; } };
const broadTopics: Record<string, string[]> = {
  esporte: ['esporte', 'academia', 'fitness', 'corrida', 'futebol', 'ciclismo'],
  treino: ['treino', 'academia', 'fitness', 'musculação', 'corrida', 'yoga'],
  suplementos: ['suplementos', 'whey protein', 'creatina', 'vitaminas', 'pré treino'],
  beleza: ['beleza', 'maquiagem', 'skincare', 'perfume', 'cabelo', 'cuidados pessoais'],
  casa: ['casa', 'cozinha', 'decoração', 'organização', 'eletrodomésticos'],
  tecnologia: ['tecnologia', 'celular', 'notebook', 'fone bluetooth', 'smartwatch'],
};
const PRODUCTS_PER_SEARCH = 20;
let activeSearchAbort: AbortController | null = null;

export type SearchFilters = {
  minCommission?: number;
  minRating?: number;
  minDiscount?: number;
  minPrice?: number;
  maxPrice?: number;
  extraCommissionOnly?: boolean;
  freeShippingOnly?: boolean;
};

function matchesSearchFilters(input: Parameters<typeof scoreOffer>[0], filters?: SearchFilters) {
  if (!filters) return true;
  const commission = Math.max(input.commissionPercent ?? 0, input.extraCommissionPercent ?? 0);
  if (commission < (filters.minCommission ?? 0)) return false;
  if ((input.rating ?? 0) < (filters.minRating ?? 0)) return false;
  if (calculateDiscount(input.currentPrice, input.previousPrice) < (filters.minDiscount ?? 0)) return false;
  if (input.currentPrice < (filters.minPrice ?? 0)) return false;
  if (input.currentPrice > (filters.maxPrice ?? 1000000)) return false;
  if (filters.extraCommissionOnly && !(input.extraCommissionPercent && input.extraCommissionPercent > 0)) return false;
  if (filters.freeShippingOnly && !input.freeShipping) return false;
  return true;
}

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function matchesSearchIntent(title: string, term?: string) {
  if (!term?.trim()) return true;
  const expanded = broadTopics[term.trim().toLocaleLowerCase('pt-BR')] ?? [term];
  const titleText = normalized(title);
  const meaningful = expanded.flatMap((item) => normalized(item).split(/\s+/)).filter((word) => word.length >= 3);
  return meaningful.length === 0 || meaningful.some((word) => titleText.includes(word));
}

export async function cancelActiveSearch() {
  const inMemory = Boolean(activeSearchAbort && !activeSearchAbort.signal.aborted);
  activeSearchAbort?.abort();
  const stale = await db.schedulerRun.updateMany({
    where: { status: 'running' },
    data: { status: 'cancelled', finishedAt: new Date(), details: JSON.stringify({ message: 'Busca cancelada pelo usuário.' }) },
  });
  return inMemory || stale.count > 0;
}

export async function runLinkImport(url: string) {
  const input = await searchAffiliateProductByUrl(url);
  const niche = await db.niche.findFirst({ where: { active: true }, orderBy: { name: 'asc' } });
  if (!niche) throw new Error('Ative pelo menos um tema antes de adicionar produtos.');
  const { catalogProductId, galleryImages, sourcePage, sourceNiche, reviewRejected: _reviewRejected, reviewSignals, promotionEndsAt, ...offerData } = input;
  const score = scoreOffer(input);
  const offer = await db.offer.upsert({
    where: { storeId_externalId: { storeId: input.storeId, externalId: input.externalId } },
    update: { title: input.title, imageUrl: input.imageUrl, originalUrl: input.originalUrl, affiliateUrl: input.affiliateUrl, currentPrice: input.currentPrice, previousPrice: input.previousPrice, discountPercent: calculateDiscount(input.currentPrice, input.previousPrice), rating: input.rating, reviewCount: input.reviewCount, commissionPercent: input.commissionPercent, extraCommissionPercent: input.extraCommissionPercent, estimatedCommission: input.estimatedCommission, shipping: input.shipping, freeShipping: input.freeShipping, stock: input.stock, soldQuantity: input.soldQuantity, sellerLevel: input.sellerLevel, fullShipping: input.fullShipping, score, status: 'pending', rawData: JSON.stringify({ source: 'mercado_livre_product_page', sourcePage, sourceNiche, catalogProductId, galleryImages: galleryImages ?? [], collectedAt: new Date().toISOString() }) },
    create: { ...offerData, reviewSignals: JSON.stringify(reviewSignals ?? []), promotionEndsAt: promotionEndsAt ? new Date(promotionEndsAt) : null, nicheId: niche.id, discountPercent: calculateDiscount(input.currentPrice, input.previousPrice), score, status: 'pending', rawData: JSON.stringify({ source: 'mercado_livre_product_page', sourcePage, sourceNiche, catalogProductId, galleryImages: galleryImages ?? [], collectedAt: new Date().toISOString() }) },
  });
  await db.affiliateLink.upsert({ where: { id: `affiliate-link-${offer.id}` }, update: { url: input.affiliateUrl!, source: 'mercado_livre_affiliate_hub' }, create: { id: `affiliate-link-${offer.id}`, offerId: offer.id, url: input.affiliateUrl!, source: 'mercado_livre_affiliate_hub' } });
  await db.priceHistory.create({ data: { offerId: offer.id, price: input.currentPrice } });
  const message = formatOfferMessage(input);
  await db.publication.upsert({ where: { id: `queue-${offer.id}` }, update: { message }, create: { id: `queue-${offer.id}`, offerId: offer.id, message } });
  await db.auditLog.create({ data: { action: 'affiliate_link.imported', entityType: 'Offer', entityId: offer.id, metadata: JSON.stringify({ originalUrl: input.originalUrl }) } });
  return offer;
}

/**
 * Persiste um produto que já foi confirmado pela interface da Central de
 * Afiliados. A extensão envia somente os dados visíveis do anúncio e o link
 * curto gerado pelo próprio Mercado Livre; nenhuma credencial é recebida.
 */
export async function importCapturedAffiliateOffer(input: Parameters<typeof scoreOffer>[0]) {
  if (!input.affiliateUrl?.startsWith('https://meli.la/')) {
    throw new Error('O produto ainda não possui um link de afiliado confirmado.');
  }
  const niche = await db.niche.findFirst({ where: { active: true }, orderBy: { name: 'asc' } });
  if (!niche) throw new Error('Ative pelo menos um tema antes de adicionar produtos.');
  const { catalogProductId, galleryImages, reviewRejected: _reviewRejected, reviewSignals, promotionEndsAt, ...offerData } = input;
  const score = scoreOffer(input);
  const offer = await db.offer.upsert({
    where: { storeId_externalId: { storeId: input.storeId, externalId: input.externalId } },
    update: {
      title: input.title, imageUrl: input.imageUrl, originalUrl: input.originalUrl,
      affiliateUrl: input.affiliateUrl, currentPrice: input.currentPrice,
      previousPrice: input.previousPrice, discountPercent: calculateDiscount(input.currentPrice, input.previousPrice),
      rating: input.rating, reviewCount: input.reviewCount,
      commissionPercent: input.commissionPercent, extraCommissionPercent: input.extraCommissionPercent,
      estimatedCommission: input.estimatedCommission, shipping: input.shipping,
      freeShipping: input.freeShipping, stock: input.stock, soldQuantity: input.soldQuantity,
      sellerLevel: input.sellerLevel, fullShipping: input.fullShipping, score, status: 'pending',
      rawData: JSON.stringify({ source: 'lico_primos_extension', catalogProductId, galleryImages: galleryImages ?? [], collectedAt: new Date().toISOString() }),
    },
    create: {
      ...offerData, reviewSignals: JSON.stringify(reviewSignals ?? []), promotionEndsAt: promotionEndsAt ? new Date(promotionEndsAt) : null, nicheId: niche.id,
      discountPercent: calculateDiscount(input.currentPrice, input.previousPrice), score, status: 'pending',
      rawData: JSON.stringify({ source: 'lico_primos_extension', catalogProductId, galleryImages: galleryImages ?? [], collectedAt: new Date().toISOString() }),
    },
  });
  await db.affiliateLink.upsert({
    where: { id: `affiliate-link-${offer.id}` },
    update: { url: input.affiliateUrl, source: 'lico_primos_extension' },
    create: { id: `affiliate-link-${offer.id}`, offerId: offer.id, url: input.affiliateUrl, source: 'lico_primos_extension' },
  });
  await db.priceHistory.create({ data: { offerId: offer.id, price: input.currentPrice } });
  const message = formatOfferMessage(input);
  await db.publication.upsert({
    where: { id: `queue-${offer.id}` }, update: { message },
    create: { id: `queue-${offer.id}`, offerId: offer.id, message },
  });
  await db.auditLog.create({
    data: { action: 'extension.offer_captured', entityType: 'Offer', entityId: offer.id },
  });
  return offer;
}

async function rememberSearch(term: string, foundCount: number, broad: boolean) {
  const current = await db.setting.findUnique({ where: { key: 'search_history' } });
  const history = current ? parseList(current.value) as unknown as Array<{ term: string; searches: number; lastResultCount: number; broad: boolean; lastSearchedAt: string }> : [];
  const normalized = term.toLocaleLowerCase('pt-BR');
  const previous = history.find((item) => item.term.toLocaleLowerCase('pt-BR') === normalized);
  const next = [{ term, searches: (previous?.searches ?? 0) + 1, lastResultCount: foundCount, broad, lastSearchedAt: new Date().toISOString() }, ...history.filter((item) => item !== previous)].slice(0, 100);
  await db.setting.upsert({ where: { key: 'search_history' }, update: { value: JSON.stringify(next) }, create: { key: 'search_history', value: JSON.stringify(next) } });
}

export type SearchMode = 'quick' | 'wide';
export type SearchSource = 'affiliate_hub' | 'official_api';

export async function runSearch(trigger = 'manual', searchTerm?: string, requestedTarget = PRODUCTS_PER_SEARCH, filters?: SearchFilters, _strategy: SearchStrategy = 'general', mode: SearchMode = 'quick', existingRunId?: string, source: SearchSource = 'affiliate_hub') {
  const active = await db.schedulerRun.findFirst({ where: { status: 'running', ...(existingRunId ? { id: { not: existingRunId } } : {}) } });
  if (active && activeSearchAbort && !activeSearchAbort.signal.aborted) throw new Error('Já existe uma busca em andamento.');
  if (active) {
    await db.schedulerRun.updateMany({
      where: { status: 'running' },
      data: { status: 'cancelled', finishedAt: new Date(), details: JSON.stringify({ message: 'Busca anterior interrompida após reinício do servidor.' }) },
    });
  }
  const run = existingRunId
    ? await db.schedulerRun.findUniqueOrThrow({ where: { id: existingRunId } })
    : await db.schedulerRun.create({ data: { trigger, status: 'running' } });
  const abortController = new AbortController();
  activeSearchAbort = abortController;
  let foundCount = 0;
  try {
    const niches = await db.niche.findMany({ where: { active: true } });
    if (!niches.length) throw new Error('Ative pelo menos um nicho antes de procurar ofertas.');
    const manualTerm = searchTerm?.trim();
    const normalizedTerm = manualTerm?.toLocaleLowerCase('pt-BR');
    const isBroad = Boolean(normalizedTerm && (broadTopics[normalizedTerm] || normalizedTerm.split(/\s+/).length === 1));
    const configuredKeywords = niches.flatMap((niche) => parseList(niche.wantedKeywords));
    const baseKeywords = manualTerm ? (broadTopics[normalizedTerm ?? ''] ?? [manualTerm]) : [...catalogKeywords(), ...configuredKeywords];
    const historySetting = await db.setting.findUnique({ where: { key: 'search_history' } });
    const history = historySetting ? parseList(historySetting.value) as unknown as KeywordHistory[] : [];
    const selectedKeyword = chooseSearchKeyword(baseKeywords, history);
    const keywords = [...expandKeyword(selectedKeyword), ...baseKeywords.filter((term) => term !== selectedKeyword)];
    const target = Math.max(1, Math.min(200, Math.trunc(requestedTarget)));
    const affiliateSearchTerm = selectedKeyword;
    const persistInput = async (input: Awaited<ReturnType<typeof searchAffiliateProductByUrl>>, discoverySource: SearchSource = source) => {
      if (abortController.signal.aborted) throw new Error('Busca cancelada pelo usuário.');
      if (!input?.imageUrl || input.reviewRejected || !matchesSearchFilters(input, filters) || !matchesSearchIntent(input.title, manualTerm)) return false;
      const duplicate = await db.offer.findUnique({
        where: { storeId_externalId: { storeId: input.storeId, externalId: input.externalId } },
        select: { id: true, rawData: true },
      });
      if (duplicate) {
        const previousPrices = await db.priceHistory.findMany({ where: { offerId: duplicate.id }, orderBy: { collectedAt: 'desc' }, take: 20 });
        const historicalMax = Math.max(0, ...previousPrices.map((entry) => entry.price));
        const suspiciousDiscount = Boolean(input.previousPrice && historicalMax > 0 && input.previousPrice > historicalMax * 1.1);
        let priorMetadata: Record<string, unknown> = {};
        try { priorMetadata = JSON.parse(duplicate.rawData) as Record<string, unknown>; } catch { priorMetadata = {}; }
        await db.$transaction([
          db.offer.update({ where: { id: duplicate.id }, data: {
            currentPrice: input.currentPrice, previousPrice: input.previousPrice,
            discountPercent: calculateDiscount(input.currentPrice, input.previousPrice),
            rating: input.rating, reviewCount: input.reviewCount, seller: input.seller,
            sellerReputation: input.sellerReputation, stock: input.stock, soldQuantity: input.soldQuantity,
            sellerLevel: input.sellerLevel, fullShipping: input.fullShipping,
            reviewSentiment: input.reviewSentiment, reviewsAnalyzed: input.reviewsAnalyzed ?? 0,
            reviewSignals: JSON.stringify(input.reviewSignals ?? []),
            promotionEndsAt: input.promotionEndsAt ? new Date(input.promotionEndsAt) : null,
            rawData: JSON.stringify({ ...priorMetadata, lastDiscoverySource: discoverySource, checkedAt: new Date().toISOString(), suspiciousDiscount, historicalMax: historicalMax || null }),
          } }),
          db.priceHistory.create({ data: { offerId: duplicate.id, price: input.currentPrice } }),
          ...(input.soldQuantity == null ? [] : [db.salesHistory.create({ data: { offerId: duplicate.id, soldQuantity: input.soldQuantity } })]),
        ]);
        return false;
      }
      const { catalogProductId, galleryImages, sourcePage, sourceNiche, reviewRejected: _reviewRejected, reviewSignals, promotionEndsAt, ...offerData } = input;
      const niche = niches.find((item) => parseList(item.wantedKeywords).length > 0 && matchesNiche(input, {
        wantedKeywords: parseList(item.wantedKeywords), forbiddenKeywords: parseList(item.forbiddenKeywords),
        allowedBrands: parseList(item.allowedBrands), forbiddenBrands: parseList(item.forbiddenBrands),
        minPrice: item.minPrice, maxPrice: item.maxPrice, minDiscount: item.minDiscount, minRating: item.minRating,
        minReviewCount: item.minReviewCount, minSellerReputation: item.minSellerReputation, freeShippingRequired: item.freeShippingRequired,
      } satisfies NicheRules));
      if (!niche) return false;
      const score = scoreOffer(input);
      const quality = offerQuality(input);
      const historicalMax = 0;
      const suspiciousDiscount = false;
      const status = input.affiliateUrl ? (quality.verified && !suspiciousDiscount ? 'pending' : 'suspicious') : 'awaiting_affiliate_link';
      const offer = await db.offer.upsert({
        where: { storeId_externalId: { storeId: input.storeId, externalId: input.externalId } },
        update: { title: input.title, imageUrl: input.imageUrl, originalUrl: input.originalUrl, affiliateUrl: input.affiliateUrl, currentPrice: input.currentPrice, previousPrice: input.previousPrice, discountPercent: calculateDiscount(input.currentPrice, input.previousPrice), rating: input.rating, reviewCount: input.reviewCount, seller: input.seller, sellerReputation: input.sellerReputation, commissionPercent: input.commissionPercent, extraCommissionPercent: input.extraCommissionPercent, estimatedCommission: input.estimatedCommission, shipping: input.shipping, freeShipping: input.freeShipping, stock: input.stock, soldQuantity: input.soldQuantity, sellerLevel: input.sellerLevel, fullShipping: input.fullShipping, reviewSentiment: input.reviewSentiment, reviewsAnalyzed: input.reviewsAnalyzed ?? 0, reviewSignals: JSON.stringify(reviewSignals ?? []), promotionEndsAt: promotionEndsAt ? new Date(promotionEndsAt) : null, score, status, rawData: JSON.stringify({ source: discoverySource, sourcePage, sourceNiche, catalogProductId: input.catalogProductId, galleryImages: input.galleryImages ?? [], collectedAt: new Date().toISOString(), verification: quality, suspiciousDiscount, historicalMax: historicalMax || null }) },
        create: { ...offerData, reviewSignals: JSON.stringify(reviewSignals ?? []), promotionEndsAt: promotionEndsAt ? new Date(promotionEndsAt) : null, nicheId: niche.id, discountPercent: calculateDiscount(input.currentPrice, input.previousPrice), score, status, rawData: JSON.stringify({ source: discoverySource, sourcePage, sourceNiche, catalogProductId, galleryImages: galleryImages ?? [], collectedAt: new Date().toISOString(), verification: quality, suspiciousDiscount, historicalMax: historicalMax || null }) },
      });
      await db.priceHistory.create({ data: { offerId: offer.id, price: input.currentPrice } });
      if (input.soldQuantity != null) await db.salesHistory.create({ data: { offerId: offer.id, soldQuantity: input.soldQuantity } });
      if (input.affiliateUrl) await db.affiliateLink.upsert({
        where: { id: `affiliate-link-${offer.id}` },
        update: { url: input.affiliateUrl, source: 'mercado_livre_affiliate_hub' },
        create: { id: `affiliate-link-${offer.id}`, offerId: offer.id, url: input.affiliateUrl, source: 'mercado_livre_affiliate_hub' },
      });
      if (input.affiliateUrl) {
        const message = formatOfferMessage(input);
        await db.publication.upsert({ where: { id: `queue-${offer.id}` }, update: { message }, create: { id: `queue-${offer.id}`, offerId: offer.id, message } });
      }
      foundCount++;
      await db.schedulerRun.update({
        where: { id: run.id },
        data: {
          foundCount,
          details: JSON.stringify({ source, mode, stage: 'converting', requested: target, confirmed: foundCount }),
        },
      });
      return true;
    };

    if (source === 'official_api') {
      const officialOffers = await new MercadoLivreAdapter().search(keywords, { target });
      for (const input of officialOffers) {
        if (foundCount >= target) break;
        await persistInput(input, 'official_api');
      }
    } else if (mode === 'wide') {
      const candidates = await discoverMercadoLivreCatalog(affiliateSearchTerm, target, abortController.signal);
      await db.schedulerRun.update({
        where: { id: run.id },
        data: { details: JSON.stringify({ mode, stage: 'converting', requested: target, candidates: candidates.length, confirmed: 0 }) },
      });
      for (const candidate of candidates) {
        if (foundCount >= target) break;
        if (abortController.signal.aborted) throw new Error('Busca cancelada pelo usuário.');
        try {
          const converted = await convertCatalogCandidate(candidate, abortController.signal);
          await persistInput(converted);
        } catch (error) {
          if (abortController.signal.aborted) throw error;
          console.warn(`Não foi possível confirmar ${candidate.externalId} na página do produto:`, error instanceof Error ? error.message : error);
        }
      }
    } else {
      const realOffers = await searchAffiliateBestSellers(
        affiliateSearchTerm,
        target,
        abortController.signal,
        _strategy,
      );
      for (const input of realOffers) {
        if (foundCount >= target) break;
        await persistInput(input);
      }
    }
    await db.schedulerRun.update({ where: { id: run.id }, data: { status: 'success', finishedAt: new Date(), foundCount, details: JSON.stringify({ source, mode, stage: 'finished', requested: target, confirmed: foundCount }) } });
    await rememberSearch(affiliateSearchTerm, foundCount, isBroad);
    await db.auditLog.create({ data: { action: 'search.completed', entityType: 'SchedulerRun', entityId: run.id, metadata: JSON.stringify({ trigger, mode, foundCount }) } });
    return { runId: run.id, foundCount, mode };
  } catch (error) {
    const cancelled = abortController.signal.aborted;
    await db.schedulerRun.update({ where: { id: run.id }, data: { status: cancelled ? 'cancelled' : 'failed', finishedAt: new Date(), foundCount, errorCount: cancelled ? 0 : 1, details: JSON.stringify({ message: cancelled ? 'Busca cancelada pelo usuário.' : error instanceof Error ? error.message : 'Erro desconhecido' }) } });
    throw error;
  } finally {
    if (activeSearchAbort === abortController) activeSearchAbort = null;
  }
}
