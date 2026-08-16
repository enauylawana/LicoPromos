const state = document.getElementById("state");
const cards = document.getElementById("cards");
const selected = document.getElementById("selected");
const capture = document.getElementById("capture");

function setState(message, kind = "") {
  state.textContent = message;
  state.className = `state ${kind}`.trim();
}

async function activeHubTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://www.mercadolivre.com.br/afiliados/hub")) {
    throw new Error("Abra a Central de Afiliados do Mercado Livre nesta guia.");
  }
  return tab;
}

async function send(type) {
  const tab = await activeHubTab();
  return chrome.tabs.sendMessage(tab.id, { type });
}

async function refresh() {
  try {
    const result = await send("lico:status");
    cards.textContent = result.cards;
    selected.textContent = result.selected;
    capture.disabled = result.selected === 0;
    setState(result.cards ? "Central conectada. Selecione os produtos desejados." : "Nenhum card foi encontrado nesta página.", result.cards ? "success" : "");
  } catch (error) {
    capture.disabled = true;
    setState(error.message, "error");
  }
}

document.getElementById("selectAll").addEventListener("click", async () => {
  try { await send("lico:select-all"); await refresh(); } catch (error) { setState(error.message, "error"); }
});
document.getElementById("clear").addEventListener("click", async () => {
  try { await send("lico:clear"); await refresh(); } catch (error) { setState(error.message, "error"); }
});
capture.addEventListener("click", async () => {
  capture.disabled = true;
  setState("Gerando os links selecionados na Central…");
  try {
    const captured = await send("lico:capture");
    if (!captured.ok) throw new Error(captured.error);
    if (!captured.offers.length) throw new Error(captured.failures[0]?.error || "Nenhum link pôde ser confirmado.");
    setState(`Enviando ${captured.offers.length} produto(s) ao Lico Primos…`);
    const imported = await chrome.runtime.sendMessage({ type: "lico:import", offers: captured.offers });
    if (!imported.ok) throw new Error(imported.error);
    const suffix = captured.failures.length ? ` ${captured.failures.length} item(ns) não puderam ser capturados.` : "";
    setState(`${imported.imported} produto(s) enviados à Distribuição.${suffix}`, "success");
    await send("lico:clear");
    selected.textContent = "0";
  } catch (error) {
    setState(error.message, "error");
  } finally {
    capture.disabled = false;
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "lico:progress") setState(`Gerando link ${message.current} de ${message.total}…`);
});
refresh();
