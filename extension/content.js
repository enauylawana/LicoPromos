const CARD_SELECTOR = "li.poly-card";
const selectedIds = new Set();

function injectStyles() {
  if (document.getElementById("lico-primos-extension-styles")) return;
  const style = document.createElement("style");
  style.id = "lico-primos-extension-styles";
  style.textContent = `
    .lico-capture-check { position:absolute; z-index:20; top:10px; left:10px; width:24px; height:24px;
      accent-color:#2f69bd; cursor:pointer; filter:drop-shadow(0 1px 3px rgba(0,0,0,.25)); }
    ${CARD_SELECTOR}.lico-selected { outline:3px solid #2f69bd !important; outline-offset:-3px; border-radius:10px; }
  `;
  document.documentElement.appendChild(style);
}

function cardId(card) {
  return card.querySelector('input[name="id"]')?.value || card.dataset.id || "";
}

function decorateCards() {
  injectStyles();
  document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
    if (card.querySelector(".lico-capture-check")) return;
    const id = cardId(card);
    if (!id) return;
    if (getComputedStyle(card).position === "static") card.style.position = "relative";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "lico-capture-check";
    checkbox.title = "Selecionar para o Lico Primos";
    checkbox.checked = selectedIds.has(id);
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      card.classList.toggle("lico-selected", checkbox.checked);
    });
    card.prepend(checkbox);
  });
}

const observer = new MutationObserver(() => decorateCards());
observer.observe(document.documentElement, { childList: true, subtree: true });
decorateCards();

function parseMoney(label) {
  if (!label) return undefined;
  const normalized = label.replace(/\u00a0/g, " ");
  const ariaReais = normalized.match(/([\d.]+)\s+reais?/i)?.[1]?.replace(/\./g, "");
  const ariaCents = normalized.match(/com\s+(\d+)\s+centavos?/i)?.[1] || "0";
  if (ariaReais) return Number(ariaReais) + Number(ariaCents) / 100;
  const numeric = normalized.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(numeric);
  return Number.isFinite(value) ? value : undefined;
}

function readCard(card) {
  const titleAnchor = card.querySelector("a.poly-component__title") || card.querySelector("a[href*='mercadolivre.com.br']");
  const image = card.querySelector("img.poly-component__picture") || card.querySelector("img");
  const prices = [...card.querySelectorAll("[data-andes-money-amount]")];
  const current = prices.find((node) => node.className.includes("poly-price__amount")) || prices.at(-1);
  const previous = prices.find((node) => node.className.includes("poly-price__previous"));
  const chip = card.querySelector(".poly-component__chip")?.textContent?.replace(/\s+/g, " ").trim() || "";
  const percent = Number(chip.match(/(\d+(?:[.,]\d+)?)%/)?.[1]?.replace(",", "."));
  const reviewText = card.querySelector(".poly-component__review-compacted")?.textContent || "";
  const rating = Number(reviewText.match(/([0-5](?:[.,]\d)?)/)?.[1]?.replace(",", "."));
  const reviewCount = Number(reviewText.match(/\((\d[\d.]*)\)/)?.[1]?.replace(/\./g, ""));
  const currentPrice = parseMoney(current?.getAttribute("aria-label") || current?.textContent);
  const externalId = cardId(card);
  if (!externalId || !titleAnchor?.href || !titleAnchor.textContent?.trim() || !currentPrice) return null;
  const originalUrl = new URL(titleAnchor.href);
  originalUrl.hash = "";
  return {
    externalId: externalId.replace(/[-_]/g, "").toUpperCase(),
    storeId: "mercado_livre",
    title: titleAnchor.textContent.trim(),
    imageUrl: image?.currentSrc || image?.dataset?.src || image?.src || undefined,
    originalUrl: originalUrl.toString(),
    currentPrice,
    previousPrice: parseMoney(previous?.getAttribute("aria-label") || previous?.textContent),
    rating: Number.isFinite(rating) ? rating : undefined,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : undefined,
    commissionPercent: Number.isFinite(percent) && !/extra/i.test(chip) ? percent : undefined,
    extraCommissionPercent: Number.isFinite(percent) && /extra/i.test(chip) ? percent : undefined,
    shipping: /frete gr[aá]tis/i.test(card.textContent || "") ? "Frete grátis" : "Consulte o frete no anúncio",
    freeShipping: /frete gr[aá]tis/i.test(card.textContent || ""),
    stock: 1,
    galleryImages: image?.src ? [image.currentSrc || image.src] : []
  };
}

function visibleMeliLinks() {
  const values = [];
  document.querySelectorAll("a[href], input, textarea").forEach((element) => {
    if (element instanceof HTMLAnchorElement) values.push(element.href);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) values.push(element.value);
  });
  const bodyMatches = document.body.innerText.match(/https:\/\/meli\.la\/[A-Za-z0-9_-]+/g) || [];
  return [...new Set([...values, ...bodyMatches])].filter((value) => /^https:\/\/meli\.la\/[A-Za-z0-9_-]+/.test(value));
}

async function waitForNewMeliLink(before, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = visibleMeliLinks().find((link) => !before.has(link));
    if (found) return found.match(/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/)?.[0];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return undefined;
}

function closeShareDialog() {
  const dialog = [...document.querySelectorAll("[role='dialog'], .andes-modal")].at(-1);
  const close = dialog?.querySelector("button[aria-label='Fechar'], button[aria-label='Close']");
  close?.click();
}

async function generateAffiliateLink(card) {
  const existing = card.querySelector("a[href^='https://meli.la/']")?.href;
  if (existing) return existing;
  const before = new Set(visibleMeliLinks());
  const action = card.querySelector(".poly-action button") ||
    [...card.querySelectorAll("button")].find((button) => /compartilhar|gerar link|link/i.test(button.textContent || button.getAttribute("aria-label") || ""));
  if (!action) throw new Error("Botão de gerar link não encontrado neste produto.");
  action.click();
  const link = await waitForNewMeliLink(before);
  closeShareDialog();
  if (!link) throw new Error("A Central não exibiu o link de afiliado deste produto.");
  return link;
}

async function captureSelected() {
  const cards = [...document.querySelectorAll(CARD_SELECTOR)].filter((card) => selectedIds.has(cardId(card)));
  if (!cards.length) throw new Error("Selecione pelo menos um produto na página.");
  const offers = [];
  const failures = [];
  for (let index = 0; index < cards.length; index++) {
    const card = cards[index];
    chrome.runtime.sendMessage({ type: "lico:progress", current: index + 1, total: cards.length });
    try {
      const product = readCard(card);
      if (!product) throw new Error("Dados do anúncio incompletos.");
      product.affiliateUrl = await generateAffiliateLink(card);
      offers.push(product);
    } catch (error) {
      failures.push({ id: cardId(card), error: error.message });
    }
  }
  return { offers, failures };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "lico:status") {
    decorateCards();
    sendResponse({ cards: document.querySelectorAll(CARD_SELECTOR).length, selected: selectedIds.size });
    return false;
  }
  if (message?.type === "lico:select-all") {
    decorateCards();
    document.querySelectorAll(CARD_SELECTOR).forEach((card) => {
      const id = cardId(card);
      if (id) selectedIds.add(id);
      card.classList.add("lico-selected");
      const checkbox = card.querySelector(".lico-capture-check");
      if (checkbox) checkbox.checked = true;
    });
    sendResponse({ selected: selectedIds.size });
    return false;
  }
  if (message?.type === "lico:clear") {
    selectedIds.clear();
    document.querySelectorAll(".lico-selected").forEach((card) => card.classList.remove("lico-selected"));
    document.querySelectorAll(".lico-capture-check").forEach((checkbox) => { checkbox.checked = false; });
    sendResponse({ selected: 0 });
    return false;
  }
  if (message?.type === "lico:capture") {
    captureSelected().then((result) => sendResponse({ ok: true, ...result })).catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
