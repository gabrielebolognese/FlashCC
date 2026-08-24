import { useState } from "react";

import type { FlashCCDocument } from "./doc/types.js";
import { Editor } from "./app/Editor.js";
import { Home } from "./app/Home.js";

export function App() {
  const [open, setOpen] = useState<FlashCCDocument | null>(null);

  if (!open) return <Home onOpen={setOpen} />;
  // key: a fresh document gets fresh state and a fresh history stack.
  return <Editor key={open.id} initial={open} onHome={() => setOpen(null)} />;
}
