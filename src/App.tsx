import { useState } from "react";

import type { Template } from "./doc/template.js";
import type { FlashCCDocument } from "./doc/types.js";
import { Editor } from "./app/Editor.js";
import { Home } from "./app/Home.js";
import { TemplateEditor } from "./app/TemplateEditor.js";

type Screen =
  | { view: "home" }
  | { view: "editor"; doc: FlashCCDocument }
  | { view: "template"; template: Template | null };

export function App() {
  const [screen, setScreen] = useState<Screen>({ view: "home" });

  if (screen.view === "editor") {
    // key: a fresh document gets fresh state and a fresh history stack.
    return (
      <Editor
        key={screen.doc.id}
        initial={screen.doc}
        onHome={() => setScreen({ view: "home" })}
      />
    );
  }

  if (screen.view === "template") {
    return (
      <TemplateEditor initial={screen.template} onDone={() => setScreen({ view: "home" })} />
    );
  }

  return (
    <Home
      onOpen={(doc) => setScreen({ view: "editor", doc })}
      onEditTemplate={(template) => setScreen({ view: "template", template })}
    />
  );
}
