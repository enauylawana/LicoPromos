import { z } from 'zod';
import { config } from './config.js';
import type { OfferInput } from './domain.js';
import { analyzeReviews } from './review-intelligence.js';

export interface StoreAdapter {
  id: string;
  name: string;
  enabled: boolean;
  reason?: string;
  search(keywords: string[], options?: { target?: number }): Promise<OfferInput[]>;
  revalidate(offer: OfferInput): Promise<boolean>;
  inspect?(offer: OfferInput): Promise<{
    active: boolean;
    price: number;
    previousPrice?: number;
    stock: number;
    freeShipping: boolean;
    permalink?: string;
    imageUrl?: string;
  }>;
}

const searchSchema = z.object({
  results: z.array(z.object({ id: z.string() })).default([]),
});

const listingSchema = z.object({
  item_id: z.string(),
  seller_id: z.number().optional(),
  price: z.number().positive(),
  original_price: z.number().positive().nullable().optional(),
  shipping: z.object({ free_shipping: z.boolean().default(false) }).optional(),
  available_quantity: z.number().int().nonnegative().optional(),
  sold_quantity: z.number().int().nonnegative().optional(),
  condition: z.string().optional(),
  logistic_type: z.string().nullable().optional(),
});

const productItemsSchema = z.object({ results: z.array(listingSchema).default([]) });

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  permalink: z.string().nullable().optional(),
  pictures: z.array(z.object({ url: z.string() })).optional(),
  buy_box_winner: listingSchema.nullable().optional(),
});

const reviewsSchema = z.object({
  paging: z.object({ total: z.number().int().nonnegative().optional() }).passthrough().optional(),
  rating_average: z.number().min(0).max(5).nullable().optional(),
  rating_levels: z.object({
    one_star: z.number().int().nonnegative().default(0),
    two_star: z.number().int().nonnegative().default(0),
    three_star: z.number().int().nonnegative().default(0),
    four_star: z.number().int().nonnegative().default(0),
    five_star: z.number().int().nonnegative().default(0),
  }).optional(),
  reviews: z.array(z.object({
    title: z.string().nullable().optional(),
    tittle: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    rate: z.number().min(0).max(5).optional(),
  })).default([]),
});

const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number().positive(),
  original_price: z.number().positive().nullable().optional(),
  permalink: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  available_quantity: z.number().int().optional(),
  seller_id: z.number().optional(),
  seller_address: z.object({ state: z.object({ name: z.string() }).optional() }).optional(),
  shipping: z.object({ free_shipping: z.boolean().default(false) }).optional(),
  status: z.string(),
});

const sellerSchema = z.object({
  nickname: z.string().optional(),
  seller_reputation: z.object({
    power_seller_status: z.string().nullable().optional(),
    level_id: z.string().nullable().optional(),
    transactions: z.object({
      ratings: z.object({ positive: z.number().min(0).max(1).optional() }).optional(),
    }).optional(),
  }).optional(),
});

type FetchLike = typeof fetch;

function publicUrl(value?: string | null) {
  if (!value) return undefined;
  const candidate = value.startsWith('//') ? `https:${value}` : value.replace(/^http:/, 'https:');
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export class MercadoLivreAdapter implements StoreAdapter {
  id = 'mercado_livre';
  name = 'Mercado Livre';
  enabled: boolean;
  reason?: string;

  constructor(private readonly accessToken = config.MERCADO_LIVRE_ACCESS_TOKEN, private readonly request: FetchLike = fetch) {
    this.enabled = Boolean(accessToken);
    this.reason = this.enabled ? undefined : 'Configure MERCADO_LIVRE_ACCESS_TOKEN para habilitar a busca oficial.';
  }

  private async api<T>(path: string, schema: z.ZodType<T>, attempt = 1, notFoundValue?: T): Promise<T> {
    if (!this.accessToken) throw new Error('Mercado Livre não conectado. Configure o token oficial no arquivo .env.');
    let response: Response;
    try {
      response = await this.request(`https://api.mercadolibre.com${path}`, {
        headers: { Authorization: `Bearer ${this.accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      return this.api(path, schema, attempt + 1, notFoundValue);
    }
    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await new Promise((resolve) => setTimeout(resolve, Number.isFinite(retryAfter) ? retryAfter * 1000 : 500 * 2 ** (attempt - 1)));
      return this.api(path, schema, attempt + 1, notFoundValue);
    }
    if (response.status === 404 && notFoundValue !== undefined) return notFoundValue;
    if (response.status === 401 || response.status === 403) throw new Error('Token do Mercado Livre inválido, expirado ou sem permissão.');
    if (!response.ok) throw new Error(`Mercado Livre respondeu com erro ${response.status}.`);
    return schema.parse(await response.json());
  }

  async search(keywords: string[], options?: { target?: number }): Promise<OfferInput[]> {
    const terms = [...new Set(keywords.map((term) => term.trim()).filter(Boolean))];
    const target = Math.max(1, Math.min(200, options?.target ?? 10));
    const collected = new Map<string, OfferInput>();
    const sellers = new Map<number, z.infer<typeof sellerSchema>>();
    for (const term of terms) {
      const query = new URLSearchParams({ status: 'active', site_id: 'MLB', q: term, limit: String(Math.max(config.MERCADO_LIVRE_SEARCH_LIMIT, 20)) });
      const found = await this.api(`/products/search?${query}`, searchSchema);
      for (const result of found.results) {
        if (collected.size >= target) return [...collected.values()];
        const product = await this.api(`/products/${encodeURIComponent(result.id)}`, productSchema);
        const competingItems = await this.api(
          `/products/${encodeURIComponent(result.id)}/items`,
          productItemsSchema,
          1,
          { results: [] },
        );
        const listings = [product.buy_box_winner, ...competingItems.results]
          .filter((listing): listing is z.infer<typeof listingSchema> => Boolean(listing))
          .filter((listing, index, all) => all.findIndex((candidate) => candidate.item_id === listing.item_id) === index);
        if (!listings.length) continue;
        const reviewItemId = listings[0].item_id;
        const reviews = await this.api(
          `/reviews/item/${encodeURIComponent(reviewItemId)}?catalog_product_id=${encodeURIComponent(product.id)}`,
          reviewsSchema,
          1,
          { paging: { total: 0 }, rating_average: null, reviews: [] },
        );
        const levels = reviews.rating_levels;
        const reviewCount = reviews.paging?.total ?? (levels
          ? levels.one_star + levels.two_star + levels.three_star + levels.four_star + levels.five_star
          : 0);
        const reviewAnalysis = analyzeReviews(reviews.reviews.map((review) => ({
          title: review.title ?? review.tittle ?? undefined,
          content: review.content ?? undefined,
          rate: review.rate,
        })));
        const originalUrl = publicUrl(product.permalink) ?? `https://www.mercadolivre.com.br/p/${encodeURIComponent(product.id)}`;
        if (!originalUrl) continue;
        const galleryImages = (product.pictures ?? []).map((picture) => publicUrl(picture.url)).filter((url): url is string => Boolean(url));
        for (const listing of listings) {
          if (listing.condition && listing.condition !== 'new') continue;
          let seller: z.infer<typeof sellerSchema> | undefined;
          if (listing.seller_id) {
            seller = sellers.get(listing.seller_id);
            if (!seller) {
              seller = await this.api(`/users/${listing.seller_id}`, sellerSchema, 1, {});
              sellers.set(listing.seller_id, seller);
            }
          }
          collected.set(listing.item_id, {
            externalId: listing.item_id,
            storeId: this.id,
            title: product.name,
            imageUrl: galleryImages[0],
            originalUrl,
            currentPrice: listing.price,
            previousPrice: listing.original_price ?? undefined,
            rating: reviews.rating_average ?? undefined,
            reviewCount,
            reviewSentiment: reviewAnalysis.score,
            reviewsAnalyzed: reviewAnalysis.analyzed,
            reviewSignals: [...reviewAnalysis.positiveSignals, ...reviewAnalysis.negativeSignals],
            reviewRejected: reviewAnalysis.shouldReject,
            seller: seller?.nickname ?? (listing.seller_id ? `Vendedor ${listing.seller_id}` : undefined),
            sellerReputation: seller?.seller_reputation?.transactions?.ratings?.positive != null
              ? Math.round(seller.seller_reputation.transactions.ratings.positive * 10000) / 100
              : undefined,
            sellerLevel: seller?.seller_reputation?.power_seller_status ?? undefined,
            shipping: listing.logistic_type === 'fulfillment' ? 'Mercado Envios Full' : listing.shipping?.free_shipping ? 'Frete grátis' : 'Consulte o frete no anúncio',
            freeShipping: listing.shipping?.free_shipping ?? false,
            fullShipping: listing.logistic_type === 'fulfillment',
            stock: listing.available_quantity ?? 1,
            soldQuantity: listing.sold_quantity,
            catalogProductId: product.id,
            galleryImages,
          });
          if (collected.size >= target) return [...collected.values()];
        }
      }
    }
    return [...collected.values()];
  }

  async revalidate(offer: OfferInput) {
    return (await this.inspect(offer)).active;
  }

  async inspect(offer: OfferInput) {
    const item = await this.api(`/items/${encodeURIComponent(offer.externalId)}`, itemSchema);
    const stock = item.available_quantity ?? 1;
    return {
      active: item.status === 'active' && stock > 0 && item.price > 0,
      price: item.price,
      previousPrice: item.original_price ?? undefined,
      stock,
      freeShipping: item.shipping?.free_shipping ?? false,
      permalink: publicUrl(item.permalink),
      imageUrl: publicUrl(item.thumbnail),
    };
  }
}

export const adapters: StoreAdapter[] = [new MercadoLivreAdapter()];
