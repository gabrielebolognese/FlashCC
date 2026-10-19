/**
 * Send to FlashCC (Batch 31.4).
 *
 * Right-click a selection: "as an idea" or "as a source to distil". The
 * selected words, and nothing else, open in FlashCC through the URL fragment
 * (`#send=idea&text=...`), which the browser never sends to any server. The
 * extension reads no page, asks for no host permission and makes no network
 * request: the person's browser already has the page, the person chooses the
 * words, and only those words leave it. Batch 13 refused to make FlashCC the
 * one requesting somebody else's page, and this does not.
 */
export const DEFAULT_ORIGIN = "http://localhost:5173";

/** The address the app opens at, with the words in the fragment. Exported for the test. */
export function handoffUrl(origin, kind, text) {
  const base = String(origin || DEFAULT_ORIGIN).replace(/\/+$/, "");
  const limit = kind === "idea" ? 2000 : 40000;
  const params = new URLSearchParams({ send: kind, text: String(text).trim().slice(0, limit) });
  return `${base}/app#${params.toString()}`;
}

if (typeof chrome !== "undefined" && chrome.contextMenus) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({ id: "fcc-idea", title: "Send to FlashCC as an idea", contexts: ["selection"] });
    chrome.contextMenus.create({ id: "fcc-distil", title: "Send to FlashCC as a source to distil", contexts: ["selection"] });
  });

  chrome.contextMenus.onClicked.addListener(async (info) => {
    const text = info.selectionText ?? "";
    if (!text.trim()) return;
    const kind = info.menuItemId === "fcc-idea" ? "idea" : "distil";
    const { origin } = await chrome.storage.sync.get({ origin: DEFAULT_ORIGIN });
    await chrome.tabs.create({ url: handoffUrl(origin, kind, text) });
  });
}
