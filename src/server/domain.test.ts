import { describe, expect, it } from 'vitest';
import { calculateDiscount, formatBRL, formatOfferMessage, isConfirmedAffiliateUrl, matchesNiche, offerQuality, retryDelay, scoreOffer } from './domain.js';

const offer = { externalId: '1', storeId: 'demo', title: 'Notebook Gamer 16 GB', originalUrl: 'https://example.com/item', currentPrice: 3000, previousPrice: 4000, rating: 4.8, reviewCount: 500, sellerReputation: 98, freeShipping: true, shipping: 'Frete grátis', stock: 3 };
describe('regras de ofertas', () => {
  it('calcula desconto válido sem confiar em preço menor', () => { expect(calculateDiscount(75, 100)).toBe(25); expect(calculateDiscount(110, 100)).toBe(0); });
  it('pontua entre zero e cem', () => expect(scoreOffer(offer)).toBeGreaterThanOrEqual(70));
  it('aplica filtros de nicho', () => expect(matchesNiche(offer, { wantedKeywords: ['notebook'], forbiddenKeywords: ['usado'], minPrice: 1000, maxPrice: 5000, minDiscount: 20, minRating: 4, minReviewCount: 100, minSellerReputation: 90, freeShippingRequired: true })).toBe(true));
  it('rejeita palavra proibida e produto sem estoque', () => { expect(matchesNiche({ ...offer, title: 'Notebook usado' }, { wantedKeywords: ['notebook'], forbiddenKeywords: ['usado'], minPrice: 0, maxPrice: 5000, minDiscount: 0, minRating: 0, minReviewCount: 0, minSellerReputation: 0, freeShippingRequired: false })).toBe(false); expect(scoreOffer({ ...offer, stock: 0 })).toBeLessThan(scoreOffer(offer)); });
  it('formata real e mensagem curta com um único link', () => { const message = formatOfferMessage(offer); expect(formatBRL(1299.9)).toContain('1.299,90'); expect(message).not.toContain('link de afiliado'); expect(message).toContain('🛒 Comprar: https://example.com/item'); expect(message.split('\n').length).toBeLessThanOrEqual(10); expect(message.match(/https:\/\//g)).toHaveLength(1); expect(formatOfferMessage({ ...offer, previousPrice: undefined })).not.toContain('De:'); });
  it('valida somente o encurtador oficial confirmado', () => { expect(isConfirmedAffiliateUrl('https://meli.la/abc123')).toBe(true); expect(isConfirmedAffiliateUrl('https://example.com/item')).toBe(false); });
  it('separa produto verificado de produto recomendado', () => { const quality = offerQuality({ ...offer, affiliateUrl: 'https://meli.la/abc123' }); expect(quality.verified).toBe(true); expect(quality.recommended).toBe(true); });
  it('usa espera progressiva com limite', () => { expect(retryDelay(1)).toBe(30_000); expect(retryDelay(3)).toBe(120_000); expect(retryDelay(20)).toBe(3_600_000); });
  it('valoriza vendas, vendedor platinum, comissão e Full', () => {
    const basic = scoreOffer(offer);
    const enriched = scoreOffer({ ...offer, soldQuantity: 1500, sellerLevel: 'platinum', commissionPercent: 20, fullShipping: true });
    expect(enriched).toBeGreaterThan(basic);
    expect(formatOfferMessage({ ...offer, fullShipping: true })).toContain('Mercado Envios Full');
  });
});
