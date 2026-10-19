const DEFAULT_ORIGIN = "http://localhost:5173";
const input = document.getElementById("origin");
const saved = document.getElementById("saved");

chrome.storage.sync.get({ origin: DEFAULT_ORIGIN }).then(({ origin }) => {
  input.value = origin;
});

document.getElementById("save").addEventListener("click", async () => {
  const value = input.value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("https only");
    await chrome.storage.sync.set({ origin: url.origin });
    saved.textContent = `Saved: ${url.origin}`;
  } catch {
    saved.textContent = "That is not an https address.";
  }
});
