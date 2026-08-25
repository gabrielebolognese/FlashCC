import { useState } from "react";

import { AiChat } from "./studio/AiChat.js";
import { buildSlides } from "./studio/compositions.js";
import { Compose } from "./studio/Compose.js";
import { Frameworks } from "./studio/Frameworks.js";
import { makeDoc, type Doc } from "./studio/model.js";
import { THEMES } from "./studio/presets.js";
import { Start } from "./studio/Start.js";
import { saveDoc } from "./studio/storage.js";
import { Studio } from "./studio/Studio.js";
import type { Structure } from "./studio/structures.js";
import { StylePicker } from "./studio/StylePicker.js";
import type { Style } from "./studio/styles.js";

type Draft = { structure: Structure; texts: string[]; roles: string[] };

type Screen =
  | { view: "start" }
  | { view: "frameworks"; theme: keyof typeof THEMES }
  | { view: "ai"; structure: Structure; theme: keyof typeof THEMES }
  | { view: "compose"; structure: Structure; theme: keyof typeof THEMES; texts?: string[] }
  | { view: "style"; draft: Draft; theme: keyof typeof THEMES }
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
        onGenerate={({ texts, roles, themeId }) =>
          setScreen({
            view: "style",
            theme: themeId,
            draft: { structure: screen.structure, texts, roles },
          })
        }
      />
    );
  }

  if (screen.view === "style") {
    const { draft } = screen;
    return (
      <StylePicker
        texts={draft.texts}
        roles={draft.roles}
        onBack={() =>
          setScreen({
            view: "compose",
            structure: draft.structure,
            theme: screen.theme,
            texts: draft.texts,
          })
        }
        onUse={(style: Style) => {
          const t = style.theme;
          const doc: Doc = {
            ...makeDoc(draft.texts[0]?.slice(0, 40).trim() || "Untitled"),
            palette: [
              t.bg, t.fg, t.accent, t.muted,
              "#ffffff", "#000000", "#e5545a", "#3dbe7a", "#4c86d6", "#db2777",
            ],
            slides: buildSlides(draft.texts, t, draft.roles),
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
