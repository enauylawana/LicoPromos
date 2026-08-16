type ComparableProduct = {
  externalId: string;
  title: string;
  currentPrice: number;
};

const colors = [
  'preto', 'branco', 'azul', 'rosa', 'verde', 'vermelho', 'amarelo',
  'roxo', 'cinza', 'prata', 'dourado', 'grafite', 'natural', 'titânio',
];

function normalizedTitle(title: string) {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\b(novo|original|lacrado|garantia|envio|imediato|frete|gratis|nota fiscal)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function equivalentProductKey(title: string, externalId: string) {
  const normalized = normalizedTitle(title);
  const iphone = normalized.match(/\biphone\s*(\d{1,2})(?:\s*(pro max|pro|plus|e))?\b/);
  if (iphone) {
    const capacity = normalized.match(/\b(\d{2,4})\s*(gb|tb)\b/);
    const color = colors.map((item) => normalizedTitle(item)).find((item) => new RegExp(`\\b${item}\\b`).test(normalized));
    // Só consolida quando a variação está identificada. Isso evita misturar,
    // por exemplo, 128 GB com 256 GB ou cores não informadas.
    if (capacity && color) {
      return `iphone:${iphone[1]}:${iphone[2] ?? 'base'}:${capacity[1]}${capacity[2]}:${color}`;
    }
  }
  return `listing:${externalId}`;
}

export function keepCheapestEquivalent<T extends ComparableProduct>(products: T[]) {
  const selected = new Map<string, T>();
  for (const product of products) {
    const key = equivalentProductKey(product.title, product.externalId);
    const current = selected.get(key);
    if (!current || product.currentPrice < current.currentPrice) selected.set(key, product);
  }
  return [...selected.values()];
}
