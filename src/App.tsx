import { useState } from "react";

import { buildSlides } from "./studio/compositions.js";
import { AiChat } from "./studio/AiChat.js";
import { Compose } from "./studio/Compose.js";
import { Frameworks } from "./studio/Frameworks.js";
import { makeDoc, type Doc } from "./studio/model.js";
import { THEMES } from "./studio/presets.js";
import { Start } from "./studio/Start.js";
import { saveDoc } from "./studio/storage.js";
import { Studio } from "./studio/Studio.js";
import type { Structure } from "./studio/structures.js";

type Screen =
  | { view: "start" }
  | { view: "frameworks"; theme: keyof typeof THEMES }
  | { view: "ai"; structure: Structure; theme: keyof typeof THEMES }
  | { view: "compose"; structure: Structure; theme: keyof typeof THEMES; texts?: string[] }
  | { view: "studio"; doc: Doc };

export function App() {
  const [screen, setScreen] = useState<Screen>({ view: "start" });

  if (screen.view === "frameworks") {
    return (
      <Frameworks
        onCancel={() => setScreen({ view: "start" })}
        onPick={(structure) => setScreen({ view: "ai", structure, theme: screen.theme })}
      />
    );
  }

  if (screen.view === "ai") {
    return (
      <AiChat
        structure={screen.structure}
        onCancel={() => setScreen({ view: "frameworks", theme: screen.theme })}
        onWriteMyself={() =>
          setScreen({ view: "compose", structure: screen.structure, theme: screen.theme })
        }
        onDrafted={(texts) =>
          setScreen({ view: "compose", structure: screen.structure, theme: screen.theme, texts })
        }
      />
    );
  }

  if (screen.view === "compose") {
    return (
      <Compose
        structure={screen.structure}
        initialTheme={screen.theme}
        initialTexts={screen.texts}
        onBack={() => setScreen({ view: "ai", structure: screen.structure, theme: screen.theme })}
        onGenerate={({ texts, roles, themeId }) => {
          const theme = THEMES[themeId]!;
          const doc: Doc = {
            ...makeDoc(texts[0]?.slice(0, 40).trim() || "Untitled"),
            palette: [
              theme.bg, theme.fg, theme.accent, theme.muted,
              "#ffffff", "#000000", "#e5545a", "#3dbe7a", "#4c86d6", "#db2777",
            ],
            slides: buildSlides(texts, theme, roles),
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
      onCompose={(theme) => setScreen({ view: "frameworks", theme })}
    />
  );
}
