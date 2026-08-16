import { calculateDiscount, formatBRL, type OfferInput } from './domain.js';

export function buildInstagramStoryPayload(offer: OfferInput) {
  return {
    channel: 'instagram_story',
    canvas: { width: 1080, height: 1920, format: 'png' },
    content: {
      title: offer.title.slice(0, 100),
      imageUrl: offer.imageUrl ?? null,
      currentPrice: formatBRL(offer.currentPrice),
      previousPrice: offer.previousPrice ? formatBRL(offer.previousPrice) : null,
      discountPercent: calculateDiscount(offer.currentPrice, offer.previousPrice),
      destinationUrl: offer.affiliateUrl ?? offer.originalUrl,
      disclaimer: 'Preço e disponibilidade podem mudar.',
    },
    publishAutomatically: false,
  };
}
