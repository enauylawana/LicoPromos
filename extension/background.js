const API_URL = "http://127.0.0.1:3000/api/extension/capture";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "lico:import") return false;
  fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lico-Primos-Extension": "capture-v1"
    },
    body: JSON.stringify({ offers: message.offers })
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Lico Primos respondeu com erro ${response.status}.`);
      sendResponse({ ok: true, ...data });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
