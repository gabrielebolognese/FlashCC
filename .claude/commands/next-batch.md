---
description: Load the next unbuilt batch from the feature roadmap and wait for GO
allowed-tools: Read, Grep, Glob, Bash
---

Load the next batch of work from `docs/feature-roadmap.md` into context, then stop.

## What to do

1. **Read `docs/feature-roadmap.md` in full.**

2. **Find the target batch.** If the user passed an argument (`$ARGUMENTS`), that
   names the batch, match it against the batch number or its title. Otherwise take
   the **first batch whose status line is not `done`**. Batch status is the
   `**Status:**` line directly under each `## Batch N` heading: `next`, `queued`,
   `in progress`, or `done`.

3. **If every batch is `done`**, say so plainly and stop. Do not invent more work.

4. **Print the whole batch verbatim**, every feature, its rationale, its
   acceptance criteria. This is the point of the command: the batch has to be in
   context, not summarised away. Do not compress it.

5. **Then add a short build plan of your own**, which the roadmap does not contain:
   - Which existing files each feature touches, verified by actually looking
   - What order to build them in, and why
   - Anything in the batch that is now wrong, already built, or blocked by
     something outside the repo, say so now rather than discovering it mid-build
   - Roughly how big the batch is

6. **Stop there. Do not write a single line of code.** End with one line saying you
   are holding for `GO`.

## When the user replies GO

Build the whole batch. Then:

- Follow `CLAUDE.md`: ESM with `.js` extensions on relative imports, the strict
  tsconfig flags, pure DOM-free modules where the logic is testable, `LayerView`
  as the only painter, FlashFX tokens for app chrome.
- Put the reasoning in code comments where a reader would otherwise wonder, the
  non-obvious decision, not the obvious one.
- Add tests for anything with real logic. Tests here are design guards; they have
  already caught contrast failures, identical adjacent slides and silently dropped
  CSS classes.
- Run `npm run typecheck` and `npx vitest run` before claiming it works.
- Mark the batch `done` in `docs/feature-roadmap.md` and set the next one to
  `next`.
- Commit and push. State the localhost URL with its port in the recap.

If the user says GO with a qualifier ("GO but skip the third one", "GO, just the
export bits"), honour the qualifier and say what you left out.

## Rules

- Never silently reorder or skip a batch. If the order looks wrong, say why and
  let the user decide.
- If a feature in the batch turns out to be a bad idea on closer inspection, say
  so before building it, then build the rest.
- The roadmap is the plan of record. Changes to scope go in the file, not just in
  the conversation.
