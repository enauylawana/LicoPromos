import { describe, expect, it } from 'vitest';
import { equivalentProductKey, keepCheapestEquivalent } from './product-equivalence.js';

describe('product equivalence', () => {
  it('recognizes the same iPhone model, capacity and color', () => {
    expect(equivalentProductKey('Apple iPhone 16 128 GB Preto', 'MLB1'))
      .toBe(equivalentProductKey('iPhone 16 Preto 128gb Novo Original', 'MLB2'));
  });

  it('keeps different storage or color variations separate', () => {
    const base = equivalentProductKey('iPhone 16 128 GB Preto', 'MLB1');
    expect(base).not.toBe(equivalentProductKey('iPhone 16 256 GB Preto', 'MLB2'));
    expect(base).not.toBe(equivalentProductKey('iPhone 16 128 GB Rosa', 'MLB3'));
  });

  it('keeps the cheapest equivalent listing', () => {
    const products = keepCheapestEquivalent([
      { externalId: 'MLB1', title: 'iPhone 16 128 GB Preto', currentPrice: 5200 },
      { externalId: 'MLB2', title: 'Apple iPhone 16 Preto 128gb', currentPrice: 4900 },
      { externalId: 'MLB3', title: 'iPhone 16 256 GB Preto', currentPrice: 5900 },
    ]);
    expect(products.map((item) => item.externalId)).toEqual(['MLB2', 'MLB3']);
  });
});
