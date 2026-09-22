import { useMemo, useState } from "react";

import { AiChat } from "./studio/AiChat.js";
import { BulkCreate } from "./studio/BulkCreate.js";
import { brandToStyle, listBrands } from "./studio/brand.js";
import { buildSlides } from "./studio/compositions.js";
import { resolveDocAssets } from "./studio/library.js";
import { nameFromHook } from "./studio/search.js";
import { Compose } from "./studio/Compose.js";
import { FirstRun } from "./studio/FirstRun.js";
import { Home } from "./studio/Home.js";
import { Repurpose } from "./studio/Repurpose.js";
import { Frameworks } from "./studio/Frameworks.js";
import { makeDoc, type Doc } from "./studio/model.js";
import { THEMES } from "./studio/presets.js";
import { buildFrameworkSamples } from "./studio/samples.js";
import { saveDoc } from "./studio/storage.js";
import { Studio } from "./studio/Studio.js";
import { STRUCTURES, type Structure } from "./studio/structures.js";
import {
  decorScale,
  hasOnboarded,
  loadPrefs,
  styleFromPrefs,
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
  | { view: "firstRun" }
  | { view: "start" }
  | { view: "bulk" }
  | { view: "longform" }
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
  // Brands lead it: a saved brand is a stronger default than a stock palette, and
  // it is the reason someone made one.
  const styles = useMemo(
    () => [...listBrands().map(brandToStyle), ...stylesFor(prefs)],
    // Recomputed whenever a screen changes, because a brand made on the Brands
    // screen has to appear in the picker without a reload.
    [prefs, screen.view],
  );
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
          if (answered) {
            setPrefs(answered);
            setScreen({ view: "firstRun" });
            return;
          }
          // They asked to be taken straight in, so do not ask again.
          setScreen({ view: "start" });
        }}
      />
    );
  }

  if (screen.view === "firstRun") {
    return (
      <FirstRun
        onCreate={() => setScreen({ view: "frameworks", theme: "ink" })}
        onLater={() => setScreen({ view: "start" })}
        onExamples={() => {
          const theme = prefs ? styleFromPrefs(prefs).theme : THEMES.ink!;
          const docs = buildFrameworkSamples(theme, build);
          for (const d of docs) saveDoc(d);
          const first = docs[0];
          setScreen(first ? { view: "studio", doc: first } : { view: "start" });
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

  if (screen.view === "longform") {
    return (
      <Repurpose
        onHome={() => setScreen({ view: "start" })}
        onOpen={(doc: Doc) => setScreen({ view: "studio", doc })}
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
            ...makeDoc(nameFromHook(draft.texts[0] ?? "")),
            // Recorded once, here, because analytics can only attribute performance to
            // a framework if something remembered which one produced the slides.
            framework: draft.structure.id,
            styleId: style.id,
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
    <Home
      // Resolved before the editor sees it. A stored document carries asset
      // REFERENCES, not files; this is where they become URLs the painter can
      // use. Nothing here waits on a network when there are none to resolve.
      onOpen={(doc) => {
        void resolveDocAssets(doc).then((ready) => setScreen({ view: "studio", doc: ready }));
      }}
      onCompose={(theme, framework) => {
        // "Make another like this" arrives with a framework already chosen, so it skips
        // the picker rather than asking a question it has the answer to.
        const picked = framework ? STRUCTURES.find((s) => s.id === framework) : undefined;
        setScreen(picked ? { view: "ai", structure: picked, theme } : { view: "frameworks", theme });
      }}
      onBulk={() => setScreen({ view: "bulk" })}
      onLongForm={() => setScreen({ view: "longform" })}
    />
  );
}
