import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { installCustomFonts } from "./studio/fonts.js";
import "./styles/index.css";

// Register uploaded faces before React paints, so nothing flashes in a fallback.
void installCustomFonts();

const host = document.getElementById("root");
if (!host) throw new Error("#root missing from index.html");

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
