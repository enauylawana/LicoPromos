export type OfferInput = {
  externalId: string;
  storeId: string;
  title: string;
  imageUrl?: string;
  originalUrl: string;
  affiliateUrl?: string;
  currentPrice: number;
  previousPrice?: number;
  rating?: number;
  reviewCount?: number;
  commissionPercent?: number;
  extraCommissionPercent?: number;
  estimatedCommission?: number;
  seller?: string;
  sellerReputation?: number;
  shipping?: string;
  freeShipping?: boolean;
  stock?: number;
  soldQuantity?: number;
  sellerLevel?: string;
  fullShipping?: boolean;
  reviewSentiment?: number;
  reviewsAnalyzed?: number;
  reviewSignals?: string[];
  reviewRejected?: boolean;
  promotionEndsAt?: string;
  catalogProductId?: string;
  galleryImages?: string[];
  sourcePage?: number;
  sourceNiche?: string;
};

export type NicheRules = {
  wantedKeywords: string[];
  forbiddenKeywords: string[];
  allowedBrands?: string[];
  forbiddenBrands?: string[];
  minPrice: number;
  maxPrice: number;
  minDiscount: number;
  minRating: number;
  minReviewCount: number;
  minSellerReputation: number;
  freeShippingRequired: boolean;
};

export function calculateDiscount(current: number, previous?: number | null) {
  if (!previous || previous <= current || previous <= 0) return 0;
  return Math.round(((previous - current) / previous) * 10000) / 100;
}

export function scoreOffer(offer: OfferInput) {
  const discount = calculateDiscount(offer.currentPrice, offer.previousPrice);
  const rating = Math.max(0, Math.min(5, offer.rating ?? 0));
  const reviews = Math.min(20, Math.log10((offer.reviewCount ?? 0) + 1) * 6);
  const reputation = Math.max(0, Math.min(100, offer.sellerReputation ?? 0)) / 10;
  const shipping = offer.freeShipping ? 10 : 0;
  const fullShipping = offer.fullShipping ? 5 : 0;
  const sales = Math.min(10, Math.log10((offer.soldQuantity ?? 0) + 1) * 3);
  const sellerLevel = /platinum/i.test(offer.sellerLevel ?? '') ? 7 : /gold/i.test(offer.sellerLevel ?? '') ? 4 : 0;
  const commission = Math.min(8, Math.max(offer.commissionPercent ?? 0, offer.extraCommissionPercent ?? 0) / 5);
  const sentiment = Math.max(-8, Math.min(8, (offer.reviewSentiment ?? 0) / 12.5));
  const availability = (offer.stock ?? 1) > 0 ? 5 : -50;
  return Math.round(Math.max(0, Math.min(100, discount * 0.75 + rating * 4 + reviews + reputation + shipping + fullShipping + sales + sellerLevel + commission + sentiment + availability)));
}

export function matchesNiche(offer: OfferInput, rules: NicheRules) {
  const haystack = offer.title.toLocaleLowerCase('pt-BR');
  const wanted = rules.wantedKeywords.map((word) => word.toLocaleLowerCase('pt-BR'));
  const forbidden = [...rules.forbiddenKeywords, ...(rules.forbiddenBrands ?? [])].map((word) => word.toLocaleLowerCase('pt-BR'));
  if (wanted.length && !wanted.some((phrase) => {
    if (haystack.includes(phrase)) return true;
    const tokens = phrase.split(/\s+/).filter((token) => token.length >= 3);
    return tokens.length > 1 && tokens.filter((token) => haystack.includes(token)).length >= Math.ceil(tokens.length / 2);
  })) return false;
  if (forbidden.some((word) => word && haystack.includes(word))) return false;
  if (rules.allowedBrands?.length && !rules.allowedBrands.some((word) => haystack.includes(word.toLowerCase()))) return false;
  if (offer.currentPrice < rules.minPrice || offer.currentPrice > rules.maxPrice) return false;
  if (calculateDiscount(offer.currentPrice, offer.previousPrice) < rules.minDiscount) return false;
  if ((offer.rating ?? 0) < rules.minRating || (offer.reviewCount ?? 0) < rules.minReviewCount) return false;
  if ((offer.sellerReputation ?? 0) < rules.minSellerReputation) return false;
  if (rules.freeShippingRequired && !offer.freeShipping) return false;
  return (offer.stock ?? 1) > 0;
}

export const formatBRL = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export type OfferCopyStyle = 'urgent' | 'rational';

export function isConfirmedAffiliateUrl(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLocaleLowerCase('pt-BR') === 'meli.la';
  } catch {
    return false;
  }
}

export function offerQuality(offer: OfferInput) {
  const discount = calculateDiscount(offer.currentPrice, offer.previousPrice);
  const checks = {
    confirmedAffiliateLink: isConfirmedAffiliateUrl(offer.affiliateUrl),
    realPrice: Number.isFinite(offer.currentPrice) && offer.currentPrice > 0,
    relevantDiscount: discount >= 20,
    trustedRating: (offer.rating ?? 0) >= 4,
    enoughReviews: (offer.reviewCount ?? 0) >= 50,
    available: (offer.stock ?? 1) > 0,
  };
  const verified = checks.confirmedAffiliateLink && checks.realPrice && checks.available;
  const recommended = verified && checks.relevantDiscount && checks.trustedRating && checks.enoughReviews;
  return { checks, verified, recommended, discount };
}

export function formatOfferMessage(
  offer: OfferInput,
  includeLink = true,
  options: { style?: OfferCopyStyle; destinationName?: string } = {},
) {
  const style = options.style ?? (calculateDiscount(offer.currentPrice, offer.previousPrice) >= 30 ? 'urgent' : 'rational');
  const title = offer.title.replace(/\s+/g, ' ').trim().slice(0, 115);
  const discount = calculateDiscount(offer.currentPrice, offer.previousPrice);
  const proof = offer.rating
    ? `⭐ ${offer.rating.toLocaleString('pt-BR')}${offer.reviewCount ? ` (${offer.reviewCount.toLocaleString('pt-BR')} avaliações)` : ''}`
    : '✓ Produto conferido na Central de Afiliados';
  const benefit = offer.fullShipping ? '🚚 Frete grátis pelo Mercado Envios Full' : offer.freeShipping ? '🚚 Frete grátis' : offer.shipping ? `🚚 ${offer.shipping}` : '🚚 Consulte o frete no anúncio';
  const price = offer.previousPrice && offer.previousPrice > offer.currentPrice
    ? `~${formatBRL(offer.previousPrice)}~ → *${formatBRL(offer.currentPrice)}*${discount ? ` (-${discount}%)` : ''}`
    : `*${formatBRL(offer.currentPrice)}*`;
  const openings = style === 'urgent'
    ? ['🔥 *OFERTA EM DESTAQUE*', '⚡ *PROMOÇÃO DETECTADA*', '👀 *OLHA O QUE EU ACHEI*']
    : ['💡 *BOA ESCOLHA PELO PREÇO*', '🔎 *ACHADO DO DIA*', '✅ *OPÇÃO BEM AVALIADA*'];
  const openingIndex = [...offer.externalId].reduce((total, character) => total + character.charCodeAt(0), 0) % openings.length;
  const lines = [
    openings[openingIndex],
    `📦 *${title}*`,
    style === 'urgent' ? 'Economia real para aproveitar enquanto o anúncio estiver ativo.' : 'Uma opção com bom equilíbrio entre preço e avaliação.',
    proof,
    `💰 ${price}`,
    benefit,
  ];
  if (offer.stock != null && offer.stock > 0 && offer.stock < 5) lines.push(`⚠️ Apenas ${offer.stock} unidade${offer.stock === 1 ? '' : 's'} disponível${offer.stock === 1 ? '' : 'is'} no momento da consulta.`);
  if ((offer.soldQuantity ?? 0) >= 1000) lines.push(`🔥 Mais de ${(offer.soldQuantity ?? 0).toLocaleString('pt-BR')} unidades vendidas no total.`);
  if (offer.promotionEndsAt) {
    const remainingMs = new Date(offer.promotionEndsAt).getTime() - Date.now();
    if (remainingMs > 0 && remainingMs <= 48 * 60 * 60_000) lines.push(`⏳ Promoção informada até ${new Date(offer.promotionEndsAt).toLocaleString('pt-BR')}.`);
  }
  if (includeLink) lines.push(`🛒 Comprar: ${offer.affiliateUrl ?? offer.originalUrl}`);
  lines.push('⏰ Preço e disponibilidade podem mudar.');
  return lines.join('\n');
}

export function retryDelay(attempt: number) {
  return Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));
}
