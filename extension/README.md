# Send to FlashCC

A browser extension (Chrome, Edge, any Chromium; Manifest V3) for Batch 31.4.

Select words on any page, right-click, and choose **Send to FlashCC as an idea** or **as a source
to distil**. FlashCC opens with those words in the capture box or the distil screen.

- It reads no page and asks for no host permission: only `contextMenus` and `storage`.
- It makes no network request. The words travel in the URL fragment (`/app#send=idea&text=...`),
  which the browser never sends to a server; the app reads it once and clears it.
- Nothing is fetched by FlashCC's server. The person's browser already has the page, the person
  chooses the words, and only those words leave it.

**Install, unpacked:** `chrome://extensions`, turn on Developer mode, Load unpacked, choose this
folder. Then open the extension's options and set where your FlashCC is (the default is the
local dev server, `http://localhost:5173`).
