import { useState } from "react";

import type { Doc } from "./studio/model.js";
import { Start } from "./studio/Start.js";
import { Studio } from "./studio/Studio.js";

export function App() {
  const [doc, setDoc] = useState<Doc | null>(null);

  if (!doc) return <Start onOpen={setDoc} />;
  // key: a different project gets fresh state and a fresh history stack.
  return <Studio key={doc.id} initial={doc} onHome={() => setDoc(null)} />;
}
