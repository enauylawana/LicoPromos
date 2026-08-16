import puppeteer, { type Browser, type Page } from 'puppeteer';
import type { OfferInput } from './domain.js';
import { keepCheapestEquivalent } from './product-equivalence.js';
import { ensureAffiliateBrowser, hideAffiliateBrowser } from './affiliate-browser-process.js';

const HUB_URL = 'https://www.mercadolivre.com.br/afiliados/hub?is_affiliate=true';
const CDP_URL = process.env.AFFILIATE_CHROME_URL ?? 'http://127.0.0.1:9222';
const HUB_SEARCH_SELECTOR = 'input[placeholder="Busque produtos"]';
const HUB_READY_ATTEMPTS = 3;
let searchQueue: Promise<unknown> = Promise.resolve();

type HubCard = Omit<OfferInput, 'affiliateUrl'> & { commissionLabel?: string };
export type CatalogCandidate = {
  externalId: string;
  title: string;
  originalUrl: string;
  sourcePage: number;
  sourceNiche: string;
};
export type SearchStrategy = 'general' | 'best_sellers' | 'offers' | 'discount' | 'commission';

function mercadoLivreUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLocaleLowerCase('pt-BR');
  if (host !== 'meli.la' && !host.endsWith('mercadolivre.com.br')) {
    throw new Error('Cole um link válido do Mercado Livre ou meli.la.');
  }
  return url;
}

function extractItemId(value: string) {
  const match = decodeURIComponent(value).match(/MLB[-_]?([0-9]{6,})/i);
  return match ? `MLB${match[1]}` : undefined;
}

export async function affiliateBrowserStatus() {
  try {
    await ensureAffiliateBrowser(CDP_URL);
    const browser = await puppeteer.connect({ browserURL: CDP_URL });
    const page = await findHubPage(browser);
    const connected = !page.url().includes('/login') && Boolean(await page.$(HUB_SEARCH_SELECTOR));
    await browser.disconnect();
    return { available: true, connected, mode: 'browser_session' as const };
  } catch {
    return { available: false, connected: false, mode: 'browser_session' as const };
  }
}

function parseMoneyLabel(label?: string | null) {
  if (!label) return undefined;
  const reais = label.match(/([\d.]+)\s+reais?/i)?.[1]?.replace(/\./g, '');
  const centavos = label.match(/com\s+(\d+)\s+centavos?/i)?.[1] ?? '0';
  if (!reais) return undefined;
  return Number(reais) + Number(centavos) / 100;
}

async function findHubPage(browser: Browser) {
  const pages = await browser.pages();
  const existing = pages.find((page) => page.url().includes('/afiliados/hub'));
  const page = existing ?? await browser.newPage();
  // Remove qualquer simulação de tela deixada por ferramentas de teste.
  // Assim a Central continua usando o tamanho real da janela do Chrome.
  await page.setViewport(null);
  if (!existing) await page.goto(HUB_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await hideAffiliateBrowser();
  return page;
}

async function findBackgroundPage(browser: Browser, workerName: string) {
  const pages = await browser.pages();
  for (const candidate of pages) {
    if (candidate.url().includes('/afiliados/hub')) continue;
    const name = await candidate.evaluate(() => window.name).catch(() => '');
    if (name === workerName) {
      await candidate.setViewport(null);
      return candidate;
    }
  }
  const page = await browser.newPage();
  await page.setViewport(null);
  await page.evaluate((name) => { window.name = name; }, workerName);
  await hideAffiliateBrowser();
  return page;
}

async function closeShareModal(page: Page) {
  const closed = await page.evaluate(() => {
    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Fechar"]');
    close?.click();
    return Boolean(close);
  });
  if (closed) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function waitForHubSearch(page: Page) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= HUB_READY_ATTEMPTS; attempt++) {
    if (page.url().includes('/login')) {
      throw new Error('Central de Afiliados desconectada. Entre no Mercado Livre pelo Chrome normal do Lico Primos.');
    }
    try {
      await page.waitForSelector(HUB_SEARCH_SELECTOR, { visible: true, timeout: 25_000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === HUB_READY_ATTEMPTS) break;
      // O Hub às vezes deixa somente o shell da página carregado. Uma navegação
      // limpa recupera esse estado sem abrir outra janela ou aba visível.
      await page.goto(HUB_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await hideAffiliateBrowser();
      await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
    }
  }
  const title = await page.title().catch(() => 'sem título');
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`A Central de Afiliados não terminou de carregar após ${HUB_READY_ATTEMPTS} tentativas (página: ${title}; URL: ${page.url()}). ${detail}`);
}

async function searchProducts(page: Page, term: string, bestSellers: boolean) {
  const searchSelector = HUB_SEARCH_SELECTOR;
  await waitForHubSearch(page);
  const authenticated = !page.url().includes('/login') && await page.$(searchSelector);
  if (!authenticated) throw new Error('Central de Afiliados desconectada. Entre no Mercado Livre pelo Chrome normal do Lico Primos.');

  await closeShareModal(page);
  const previousTerm = await page.$eval(searchSelector, (element) => (element as HTMLInputElement).value.trim()).catch(() => '');
  const clearedByHub = await page.$eval(searchSelector, (element) => {
    const searchBox = element.closest<HTMLElement>('[data-andes-searchbox="true"]');
    const clear = searchBox?.querySelector<HTMLButtonElement>('button[aria-label="Apagar busca"]');
    clear?.click();
    return Boolean(clear);
  });
  if (!clearedByHub) {
    await page.click(searchSelector, { clickCount: 3 });
    await page.keyboard.press('Backspace');
  }
  await page.waitForFunction((selector) => !(document.querySelector(selector) as HTMLInputElement | null)?.value, {}, searchSelector);
  if (term) {
    const previousFirstId = await page.$$eval('li.poly-card input[name="id"]', (elements) => elements.slice(0, 3).map((element) => (element as HTMLInputElement).value).join('|')).catch(() => '');
    await page.focus(searchSelector);
    await page.keyboard.type(term.trim(), { delay: 20 });
    const enteredTerm = await page.$eval(searchSelector, (element) => (element as HTMLInputElement).value.trim());
    if (enteredTerm !== term.trim()) {
      throw new Error(`A Central de Afiliados não recebeu a busca “${term}”. Tente novamente.`);
    }
    // A versão atual da Central só confirma corretamente o filtro pelo Enter;
    // clicar programaticamente na lupa mantém a lista anterior.
    await page.keyboard.press('Enter');
    // Alguns termos amplos podem manter os mesmos primeiros cards mesmo depois
    // de a Central aplicar o filtro. Nesse caso, a ausência de mudança no ID não
    // deve transformar uma busca válida em erro.
    await page.waitForFunction((oldId, repeatedQuery) => {
      const current = [...document.querySelectorAll<HTMLInputElement>('li.poly-card input[name="id"]')].slice(0, 3).map((item) => item.value).join('|');
      const text = document.body.innerText.toLocaleLowerCase('pt-BR');
      return Boolean(repeatedQuery || (current && current !== oldId) || text.includes('nenhum resultado') || text.includes('não encontramos'));
    }, { timeout: 8_000 }, previousFirstId, previousTerm === term.trim()).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  await page.waitForSelector('#best_seller', { timeout: 20_000 });
  const selected = await page.$eval('#best_seller', (button) => button.getAttribute('aria-pressed') === 'true');
  if (selected !== bestSellers) {
    const before = await page.$eval('li.poly-card input[name="id"]', (element) => (element as HTMLInputElement).value).catch(() => '');
    await page.evaluate(() => document.querySelector<HTMLElement>('#best_seller')?.click());
    await page.waitForFunction((oldId, expected) => {
      const button = document.querySelector('#best_seller');
      const current = (document.querySelector('li.poly-card input[name="id"]') as HTMLInputElement | null)?.value;
      return button?.getAttribute('aria-pressed') === String(expected) && Boolean(current && current !== oldId);
    }, { timeout: 30_000 }, before, bestSellers).catch(() => undefined);
  }
}

async function loadCards(page: Page, target: number) {
  let stableRounds = 0;
  let previous = 0;
  while (previous < target && stableRounds < 3) {
    const count = await page.$$eval('li.poly-card', (cards) => cards.length);
    stableRounds = count === previous ? stableRounds + 1 : 0;
    previous = count;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 900));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function readCards(page: Page): Promise<HubCard[]> {
  const raw = await page.$$eval('li.poly-card', (cards) => cards.map((card) => {
    const title = card.querySelector<HTMLAnchorElement>('a.poly-component__title');
    const image = card.querySelector<HTMLImageElement>('img.poly-component__picture');
    const id = card.querySelector<HTMLInputElement>('input[name="id"]')?.value;
    const amounts = [...card.querySelectorAll<HTMLElement>('[data-andes-money-amount]')];
    const previous = amounts.find((element) => element.className.includes('poly-price__previous'))?.getAttribute('aria-label');
    const current = amounts.find((element) => element.className.includes('poly-price__amount'))?.getAttribute('aria-label');
    return {
      externalId: id,
      title: title?.textContent?.trim(),
      originalUrl: title?.href,
      imageUrl: image?.currentSrc || image?.getAttribute('data-src') || image?.src,
      ratingText: card.querySelector('.poly-component__review-compacted')?.textContent?.trim(),
      commissionLabel: card.querySelector('.poly-component__chip')?.textContent?.replace(/\s+/g, ' ').trim(),
      previousLabel: previous,
      currentLabel: current,
    };
  }));

  return raw.flatMap((card) => {
    if (!card.externalId || !card.title || !card.originalUrl) return [];
    const currentPrice = parseMoneyLabel(card.currentLabel);
    if (currentPrice == null) return [];
    const percentText = card.commissionLabel?.match(/(\d+(?:[.,]\d+)?)%/)?.[1]?.replace(',', '.');
    const percent = percentText ? Number(percentText) : undefined;
    const isExtra = card.commissionLabel?.toLocaleUpperCase('pt-BR').includes('EXTRA') ?? false;
    const ratingText = card.ratingText?.match(/([0-5](?:[.,]\d)?)/)?.[1]?.replace(',', '.');
    const cleanUrl = new URL(card.originalUrl);
    cleanUrl.hash = '';
    return [{
      externalId: card.externalId,
      storeId: 'mercado_livre',
      title: card.title,
      imageUrl: card.imageUrl,
      originalUrl: cleanUrl.toString(),
      currentPrice,
      previousPrice: parseMoneyLabel(card.previousLabel),
      rating: ratingText ? Number(ratingText) : undefined,
      commissionPercent: !isExtra ? percent : undefined,
      extraCommissionPercent: isExtra ? percent : undefined,
      shipping: 'Consulte o frete no anúncio',
      stock: 1,
      galleryImages: card.imageUrl ? [card.imageUrl] : [],
      commissionLabel: card.commissionLabel,
    }];
  });
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('Busca cancelada pelo usuário.');
}

async function createAffiliateLink(page: Page, externalId: string, signal?: AbortSignal) {
  await closeShareModal(page);
  for (let attempt = 0; attempt < 2; attempt++) {
    assertNotCancelled(signal);
    const responsePromise = page.waitForResponse((response) => response.url().includes('/affiliates/createLink') && response.request().method() === 'POST', { timeout: 20_000, signal });
    const clicked = await page.evaluate((id) => {
      const card = [...document.querySelectorAll('li.poly-card')].find((item) => (item.querySelector('input[name="id"]') as HTMLInputElement | null)?.value === id);
      const button = card?.querySelector<HTMLButtonElement>('.poly-action button');
      button?.click();
      return Boolean(button);
    }, externalId);
    if (!clicked) return undefined;
    try {
      const response = await responsePromise;
      const data = await response.json() as { urls?: Array<{ short_url?: string }> };
      const shortUrl = data.urls?.[0]?.short_url;
      await closeShareModal(page);
      if (shortUrl?.startsWith('https://meli.la/')) return shortUrl;
    } catch {
      await closeShareModal(page);
    }
  }
  return undefined;
}

async function performSearch(term: string, target: number, signal?: AbortSignal, preferredExternalId?: string, strategy: SearchStrategy = 'general') {
  let browser: Browser | undefined;
  try {
    await ensureAffiliateBrowser(CDP_URL);
    browser = await puppeteer.connect({ browserURL: CDP_URL });
    assertNotCancelled(signal);
    const page = await findHubPage(browser);
    await searchProducts(page, term, strategy === 'best_sellers');
    assertNotCancelled(signal);
    // Carrega uma amostra maior para que a remoção de variações equivalentes
    // não reduza desnecessariamente a quantidade solicitada.
    const collectionTarget = Math.min(200, Math.max(target + 20, target * 3));
    await loadCards(page, collectionTarget);
    const cards = keepCheapestEquivalent(await readCards(page));
    if (strategy === 'discount' || strategy === 'offers') {
      cards.sort((left, right) => {
        const discount = (item: HubCard) => item.previousPrice && item.previousPrice > item.currentPrice ? (item.previousPrice - item.currentPrice) / item.previousPrice : 0;
        return discount(right) - discount(left);
      });
    }
    if (strategy === 'commission') {
      cards.sort((left, right) => (right.extraCommissionPercent ?? right.commissionPercent ?? 0) - (left.extraCommissionPercent ?? left.commissionPercent ?? 0));
    }
    if (preferredExternalId) {
      cards.sort((left, right) => Number(right.externalId === preferredExternalId) - Number(left.externalId === preferredExternalId));
    }
    const offers: OfferInput[] = [];
    for (const card of cards) {
      assertNotCancelled(signal);
      if (offers.length >= target) break;
      const affiliateUrl = await createAffiliateLink(page, card.externalId, signal);
      if (!affiliateUrl) continue;
      const { commissionLabel: _commissionLabel, ...offer } = card;
      offers.push({ ...offer, affiliateUrl });
    }
    if (!offers.length) throw new Error('A Central de Afiliados não retornou produtos com link confirmado. Mantenha o Chrome Lico Primos conectado e tente novamente.');
    return offers;
  } catch (error) {
    if (signal?.aborted) throw new Error('Busca cancelada pelo usuário.');
    if (error instanceof Error && error.message.includes('Central de Afiliados')) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    console.error('Falha detalhada na Central de Afiliados:', error instanceof Error ? error.stack ?? error.message : error);
    throw new Error(`Não foi possível acessar a Central de Afiliados. Detalhes: ${detail}`);
  } finally {
    await browser?.disconnect();
  }
}

export function searchAffiliateBestSellers(term: string, requestedTarget: number, signal?: AbortSignal, strategy: SearchStrategy = 'general') {
  const target = Math.max(1, Math.min(200, Math.trunc(requestedTarget)));
  const task = searchQueue.then(() => performSearch(term, target, signal, undefined, strategy), () => performSearch(term, target, signal, undefined, strategy));
  searchQueue = task.then(() => undefined, () => undefined);
  return task;
}

/**
 * Descobre uma amostra ampla no catálogo público usando uma única aba temporária.
 * Nenhum link é convertido aqui: a etapa seguinte confirma cada item no Hub.
 */
export async function discoverMercadoLivreCatalog(term: string, requestedTarget: number, signal?: AbortSignal) {
  void requestedTarget;
  // A aprovação acontece depois, na página do produto. Por isso a descoberta
  // percorre todas as páginas disponíveis (com um teto defensivo), em vez de
  // parar assim que apenas encontrou a quantidade solicitada.
  const poolTarget = 400;
  let browser: Browser | undefined;
  let catalogPage: Page | undefined;
  try {
    await ensureAffiliateBrowser(CDP_URL);
    browser = await puppeteer.connect({ browserURL: CDP_URL });
    catalogPage = await findBackgroundPage(browser, 'lico-primos-catalog-worker');
    const slug = encodeURIComponent(term.trim() || 'ofertas').replace(/%20/g, '-');
    await catalogPage.goto(`https://lista.mercadolivre.com.br/${slug}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await hideAffiliateBrowser();
    const candidates = new Map<string, CatalogCandidate>();
    for (let pageNumber = 1; pageNumber <= 50 && candidates.size < poolTarget; pageNumber++) {
      assertNotCancelled(signal);
      await catalogPage.waitForSelector('li.ui-search-layout__item, li.poly-card', { timeout: 20_000 });
      const pageCandidates = await catalogPage.$$eval('li.ui-search-layout__item, li.poly-card', (cards) => cards.flatMap((card) => {
        const link = card.querySelector<HTMLAnchorElement>('a.poly-component__title, a.ui-search-link');
        const title = link?.textContent?.trim();
        const href = link?.href;
        const match = href ? decodeURIComponent(href).match(/MLB[-_]?([0-9]{6,})/i) : null;
        if (!title || !href || !match) return [];
        return [{ externalId: `MLB${match[1]}`, title, originalUrl: href }];
      }));
      const sourceNiche = term.trim() || 'ofertas';
      for (const candidate of pageCandidates) {
        if (!candidates.has(candidate.externalId)) {
          candidates.set(candidate.externalId, { ...candidate, sourcePage: pageNumber, sourceNiche });
        }
      }
      if (candidates.size >= poolTarget) break;
      const nextHref = await catalogPage.$eval('a.andes-pagination__link[title="Seguinte"]', (link) => (link as HTMLAnchorElement).href).catch(() => '');
      if (!nextHref) break;
      await catalogPage.goto(nextHref, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await hideAffiliateBrowser();
    }
    return [...candidates.values()].slice(0, poolTarget);
  } catch (error) {
    if (signal?.aborted) throw new Error('Busca cancelada pelo usuário.');
    console.error('Falha na descoberta ampla do catálogo:', error);
    throw new Error('Não foi possível consultar o catálogo amplo do Mercado Livre. Tente a Busca rápida.');
  } finally {
    // A aba é reutilizada nas próximas buscas para não criar janelas ou abas a
    // cada produto no macOS.
    await browser?.disconnect().catch(() => undefined);
  }
}

async function affiliateLinkFromProductPage(page: Page, signal?: AbortSignal) {
  assertNotCancelled(signal);
  const before = new Set(await page.$$eval('a[href], input, textarea', (elements) => elements.flatMap((element) => {
    const value = element instanceof HTMLAnchorElement ? element.href : (element as HTMLInputElement).value;
    return /^https:\/\/meli\.la\/[A-Za-z0-9_-]+/.test(value) ? [value.match(/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/)![0]] : [];
  })));
  const responsePromise = page.waitForResponse((response) => response.url().includes('/affiliates/createLink') && response.request().method() === 'POST', { timeout: 15_000, signal }).catch(() => undefined);
  const clicked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll<HTMLElement>('button, a')];
    const action = buttons.find((button) => {
      const box = button.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && /compartilhar|gerar link/i.test(`${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`);
    });
    action?.click();
    return Boolean(action);
  });
  if (!clicked) throw new Error('Barra de Afiliados não encontrada na página do produto. Confirme a sessão e a elegibilidade do anúncio.');
  const response = await responsePromise;
  if (response) {
    const payload = await response.json().catch(() => undefined) as { urls?: Array<{ short_url?: string }> } | undefined;
    const shortUrl = payload?.urls?.find((item) => item.short_url?.startsWith('https://meli.la/'))?.short_url;
    if (shortUrl) return shortUrl;
  }
  await page.waitForFunction((known) => [...document.querySelectorAll('a[href], input, textarea')].some((element) => {
    const value = element instanceof HTMLAnchorElement ? element.href : (element as HTMLInputElement).value;
    const link = value.match(/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/)?.[0];
    return Boolean(link && !known.includes(link));
  }), { timeout: 10_000 }, [...before]).catch(() => undefined);
  const links = await page.$$eval('a[href], input, textarea', (elements) => elements.flatMap((element) => {
    const value = element instanceof HTMLAnchorElement ? element.href : (element as HTMLInputElement).value;
    return value.match(/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/)?.slice(0, 1) ?? [];
  }));
  const generated = links.find((link) => !before.has(link));
  if (!generated) throw new Error('O Mercado Livre não gerou o link na barra de compartilhamento. Renove a sessão de afiliado.');
  return generated;
}

async function affiliateLinkFromHubFallback(browser: Browser, candidate: CatalogCandidate, signal?: AbortSignal) {
  const hubPage = await findHubPage(browser);
  await searchProducts(hubPage, candidate.title, false);
  assertNotCancelled(signal);
  await loadCards(hubPage, 30);
  const cards = await readCards(hubPage);
  const exact = cards.find((card) => card.externalId === candidate.externalId);
  if (!exact) {
    throw new Error(`O item ${candidate.externalId} não apareceu na Central de Afiliados e pode não ser elegível.`);
  }
  const affiliateUrl = await createAffiliateLink(hubPage, exact.externalId, signal);
  if (!affiliateUrl) {
    throw new Error(`A Central de Afiliados não gerou o link de ${candidate.externalId}.`);
  }
  return affiliateUrl;
}

async function readProductPage(browser: Browser, page: Page, candidate: CatalogCandidate, signal?: AbortSignal): Promise<OfferInput> {
  await page.goto(candidate.originalUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await hideAffiliateBrowser();
  assertNotCancelled(signal);
  await page.waitForSelector('h1', { timeout: 20_000 });
  const details = await page.evaluate(() => {
    const amounts = [...document.querySelectorAll('.andes-money-amount')];
    const currentNode = document.querySelector('.ui-pdp-price__second-line .andes-money-amount') ?? amounts.at(-1) ?? null;
    const previousNode = document.querySelector('.ui-pdp-price__original-value .andes-money-amount');
    const currentFraction = currentNode?.querySelector('.andes-money-amount__fraction')?.textContent?.replace(/\D/g, '');
    const currentCents = currentNode?.querySelector('.andes-money-amount__cents')?.textContent?.replace(/\D/g, '') ?? '0';
    const previousFraction = previousNode?.querySelector('.andes-money-amount__fraction')?.textContent?.replace(/\D/g, '');
    const previousCents = previousNode?.querySelector('.andes-money-amount__cents')?.textContent?.replace(/\D/g, '') ?? '0';
    const ratingText = document.querySelector('.ui-pdp-review__rating, .ui-pdp-header__reviews')?.textContent ?? '';
    const reviewsText = document.body.innerText.match(/([\d.]+)\s+avalia[cç][õo]es/i)?.[1];
    return {
      title: document.querySelector('h1')?.textContent?.trim() ?? '',
      currentPrice: currentFraction ? Number(currentFraction) + Number(currentCents) / 100 : undefined,
      previousPrice: previousFraction ? Number(previousFraction) + Number(previousCents) / 100 : undefined,
      imageUrl: document.querySelector<HTMLImageElement>('.ui-pdp-gallery__figure img')?.src,
      rating: Number(ratingText.match(/[0-5](?:[.,]\d)?/)?.[0]?.replace(',', '.')) || undefined,
      reviewCount: reviewsText ? Number(reviewsText.replace(/\./g, '')) : undefined,
      freeShipping: /frete gr[aá]tis/i.test(document.body.innerText),
      stock: /estoque dispon[ií]vel|dispon[ií]vel/i.test(document.body.innerText) ? 1 : undefined,
    };
  });
  if (!details.title || !details.currentPrice) throw new Error(`Não foi possível validar preço e título de ${candidate.externalId} na página do produto.`);
  let affiliateUrl: string;
  try {
    affiliateUrl = await affiliateLinkFromProductPage(page, signal);
  } catch (directError) {
    console.warn(`Barra direta indisponível para ${candidate.externalId}; tentando confirmação isolada na Central:`, directError instanceof Error ? directError.message : directError);
    affiliateUrl = await affiliateLinkFromHubFallback(browser, candidate, signal);
  }
  return {
    externalId: candidate.externalId, storeId: 'mercado_livre', title: details.title,
    originalUrl: page.url(), affiliateUrl, currentPrice: details.currentPrice,
    previousPrice: details.previousPrice, imageUrl: details.imageUrl, rating: details.rating,
    reviewCount: details.reviewCount, freeShipping: details.freeShipping,
    shipping: details.freeShipping ? 'Frete grátis' : 'Consulte o frete no anúncio', stock: details.stock ?? 1,
    galleryImages: details.imageUrl ? [details.imageUrl] : [], sourcePage: candidate.sourcePage,
    sourceNiche: candidate.sourceNiche,
  };
}

export function convertCatalogCandidate(candidate: CatalogCandidate, signal?: AbortSignal) {
  const execute = async () => {
    await ensureAffiliateBrowser(CDP_URL);
    const browser = await puppeteer.connect({ browserURL: CDP_URL });
    const page = await findBackgroundPage(browser, 'lico-primos-product-worker');
    try { return await readProductPage(browser, page, candidate, signal); }
    finally { await browser.disconnect().catch(() => undefined); }
  };
  const task = searchQueue.then(execute, execute);
  searchQueue = task.then(() => undefined, () => undefined);
  return task;
}

export function searchAffiliateProductByUrl(rawUrl: string, signal?: AbortSignal) {
  const safeUrl = mercadoLivreUrl(rawUrl.trim()).toString();
  const execute = async () => {
    let browser: Browser | undefined;
    let detailPage: Page | undefined;
    try {
      await ensureAffiliateBrowser(CDP_URL);
      browser = await puppeteer.connect({ browserURL: CDP_URL });
      detailPage = await findBackgroundPage(browser, 'lico-primos-product-worker');
      await detailPage.goto(safeUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await hideAffiliateBrowser();
      assertNotCancelled(signal);
      const resolvedUrl = detailPage.url();
      const title = await detailPage.$eval('h1', (element) => element.textContent?.trim() ?? '').catch(() => '');
      const externalId = extractItemId(`${resolvedUrl} ${await detailPage.content()}`);
      if (!externalId || !title) throw new Error('Não foi possível identificar o produto desse link.');
      return await readProductPage(browser, detailPage, { externalId, title, originalUrl: resolvedUrl, sourcePage: 1, sourceNiche: 'link direto' }, signal);
    } finally {
      await browser?.disconnect().catch(() => undefined);
    }
  };
  const task = searchQueue.then(execute, execute);
  searchQueue = task.then(() => undefined, () => undefined);
  return task;
}
