import { useMemo, useState } from "react";

import { AiChat } from "./studio/AiChat.js";
import { BulkCreate } from "./studio/BulkCreate.js";
import { buildSlides } from "./studio/compositions.js";
import { Compose } from "./studio/Compose.js";
import { Frameworks } from "./studio/Frameworks.js";
import { makeDoc, type Doc } from "./studio/model.js";
import { THEMES } from "./studio/presets.js";
import { Start } from "./studio/Start.js";
import { saveDoc } from "./studio/storage.js";
import { Studio } from "./studio/Studio.js";
import type { Structure } from "./studio/structures.js";
import {
  decorScale,
  hasOnboarded,
  loadPrefs,
  stylesFor,
  wantsImages,
  type Prefs,
} from "./studio/onboarding.js";
import { StylePicker } from "./studio/StylePicker.js";
import { Welcome } from "./studio/Welcome.js";
import type { Style } from "./studio/styles.js";

type Draft = { structure: Structure; texts: string[]; roles: string[] };

type Screen =
  | { view: "welcome" }
  | { view: "start" }
  | { view: "bulk" }
  | { view: "frameworks"; theme: keyof typeof THEMES }
  | { view: "ai"; structure: Structure; theme: keyof typeof THEMES }
  | { view: "compose"; structure: Structure; theme: keyof typeof THEMES; texts?: string[] }
  | { view: "style"; draft: Draft; theme: keyof typeof THEMES }
  | { view: "studio"; doc: Doc };

export function App() {
  // First run gets the welcome; everyone else goes straight in.
  const [screen, setScreen] = useState<Screen>(() =>
    hasOnboarded() ? { view: "start" } : { view: "welcome" },
  );
  const [prefs, setPrefs] = useState<Prefs | null>(() => loadPrefs());

  // The answers become the gallery's first style and two real build settings.
  const styles = useMemo(() => stylesFor(prefs), [prefs]);
  const build = useMemo(
    () =>
      prefs
        ? { images: wantsImages(prefs.images), decor: decorScale(prefs.decor) }
        : {},
    [prefs],
  );

  if (screen.view === "welcome") {
    return (
      <Welcome
        onDone={(answered) => {
          if (answered) setPrefs(answered);
          setScreen({ view: "start" });
        }}
      />
    );
  }

  if (screen.view === "bulk") {
    return (
      <BulkCreate
        styles={styles}
        build={build}
        onCancel={() => setScreen({ view: "start" })}
        onDone={(docs) => {
          for (const d of docs) saveDoc(d);
          // Straight into the first one; the rest are waiting on the project list.
          const first = docs[0];
          setScreen(first ? { view: "studio", doc: first } : { view: "start" });
        }}
      />
    );
  }

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
        styles={styles}
        build={build}
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
            slides: buildSlides(draft.texts, t, draft.roles, build),
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
      onBulk={() => setScreen({ view: "bulk" })}
    />
  );
}
