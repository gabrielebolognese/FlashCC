# Superseded design documents

These describe FlashCC before the rewrite that replaced the document/template/role model with flat
layers on an artboard. They are kept because the reasoning in them is sometimes still interesting,
and because deleting the record of a decision makes the decision harder to revisit.

**None of them match the code.** Do not use them to answer a question about how the app works,
[`docs/reference.md`](../reference.md) is the current one.

| File | What it described | Replaced by |
| --- | --- | --- |
| `architecture.md` | A `computeLayout(role, blocks, brandKit, format)` renderer and a `src/doc/**` tree | The flat layer model; `reference.md` §3-§5 |
| `document-schema.md` | A semantic document storing no pixel positions | `Doc`/`Slide`/`Layer` in artboard pixels; `reference.md` §4 |
| `role-layouts.md` | Five roles determining layout completely, with no user positioning | The direct-manipulation canvas; `reference.md` §5 |
| `template-system.md` | A ten-slot template engine, and an argument against shipping AI | Compositions that run once; `reference.md` §11. AI drafting shipped |

`interaction-principles.md` was **not** superseded, its rules R1–R15 are design principles rather
than architecture, they are still followed, and `index.css` still cites R3 and R4 by name.
