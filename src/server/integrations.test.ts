import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreAdapter } from './integrations.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('integração oficial do Mercado Livre', () => {
  it('transforma produto e publicação reais no formato interno', async () => {
    const request = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/products/search')) return json({ results: [{ id: 'MLB-PRODUCT-1' }] });
      if (url.includes('/reviews/item/')) return json({ paging: { total: 128 }, rating_average: 4.9, rating_levels: { one_star: 1, two_star: 1, three_star: 2, four_star: 8, five_star: 116 } });
      if (url.includes('/users/42')) return json({ nickname: 'Loja Oficial', seller_reputation: { level_id: '5_green', transactions: { ratings: { positive: 0.98 } } } });
      if (url.includes('/products/MLB-PRODUCT-1')) return json({ id: 'MLB-PRODUCT-1', name: 'Notebook', permalink: 'https://produto.mercadolivre.com.br/item', pictures: [{ url: 'http://http2.mlstatic.com/test.jpg' }], buy_box_winner: { item_id: 'MLB123', seller_id: 42, price: 2999, original_price: 3999, shipping: { free_shipping: true } } });
      return json({ id: 'MLB123', title: 'Notebook 16 GB', price: 2999, original_price: 3999, permalink: 'https://produto.mercadolivre.com.br/MLB123', thumbnail: 'http://http2.mlstatic.com/test.jpg', available_quantity: 8, seller_id: 42, shipping: { free_shipping: true }, status: 'active' });
    }) as typeof fetch;
    const adapter = new MercadoLivreAdapter('token-de-teste', request);
    const offers = await adapter.search(['notebook']);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ externalId: 'MLB123', currentPrice: 2999, previousPrice: 3999, freeShipping: true, stock: 1, rating: 4.9, reviewCount: 128, seller: 'Loja Oficial', sellerReputation: 98 });
    expect(offers[0].imageUrl).toMatch(/^https:/);
  });

  it('recusa busca sem token', async () => {
    const adapter = new MercadoLivreAdapter(undefined, vi.fn() as unknown as typeof fetch);
    await expect(adapter.search(['tv'])).rejects.toThrow('não conectado');
  });

  it('informa token inválido sem expor credenciais', async () => {
    const adapter = new MercadoLivreAdapter('segredo', vi.fn(async () => json({}, 401)) as unknown as typeof fetch);
    await expect(adapter.search(['tv'])).rejects.toThrow('inválido');
  });
});
