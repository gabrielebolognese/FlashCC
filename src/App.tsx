import { useState } from "react";

import { buildSlides } from "./studio/compositions.js";
import { Compose } from "./studio/Compose.js";
import { makeDoc, type Doc } from "./studio/model.js";
import { THEMES } from "./studio/presets.js";
import { Start } from "./studio/Start.js";
import { saveDoc } from "./studio/storage.js";
import { Studio } from "./studio/Studio.js";

type Screen =
  | { view: "start" }
  | { view: "compose"; theme: keyof typeof THEMES }
  | { view: "studio"; doc: Doc };

export function App() {
  const [screen, setScreen] = useState<Screen>({ view: "start" });

  if (screen.view === "compose") {
    return (
      <Compose
        initialTheme={screen.theme}
        onCancel={() => setScreen({ view: "start" })}
        onGenerate={({ texts, themeId }) => {
          const theme = THEMES[themeId]!;
          const doc: Doc = {
            ...makeDoc(texts[0]?.slice(0, 40).trim() || "Untitled"),
            palette: [theme.bg, theme.fg, theme.accent, theme.muted, "#ffffff", "#000000", "#e5545a", "#3dbe7a", "#4c86d6", "#db2777"],
            slides: buildSlides(texts, theme),
          };
          saveDoc(doc);
          setScreen({ view: "studio", doc });
        }}
      />
    );
  }

  if (screen.view === "studio") {
    // key: a different project gets fresh state and a fresh history stack.
    return <Studio key={screen.doc.id} initial={screen.doc} onHome={() => setScreen({ view: "start" })} />;
  }

  return (
    <Start
      onOpen={(doc) => setScreen({ view: "studio", doc })}
      onCompose={(theme) => setScreen({ view: "compose", theme })}
    />
  );
}
