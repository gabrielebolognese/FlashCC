import type { ReactNode } from "react";

/**
 * The explanation that belongs beside a choice, not after it.
 *
 * Both creation steps ask somebody to pick from a grid of things they have never
 * seen, and both used to say why in one grey line above the grid, where it reads
 * as a caption and gets skipped. The cost of skipping it is real: picking the
 * wrong framework, or a second style that does not match the first, is the
 * expensive mistake in this flow and neither is obvious from a thumbnail.
 *
 * So the reasoning gets its own column, at a size that competes with the cards
 * for attention rather than apologising to them.
 *
 * **Sticky on wide screens.** The grids scroll and the advice applies to all of
 * it, so it stays put rather than scrolling away from the cards it is about.
 * Below `lg` it sits above the grid as an ordinary block, because a sticky
 * element on a phone is just a thing eating the screen.
 */
export function StepGuide({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="w-full shrink-0 lg:sticky lg:top-8 lg:w-[340px] lg:self-start">
      <h2 className="text-[32px] font-semibold leading-[38px] tracking-[-0.6px] text-accent">
        {title}
      </h2>
      <div className="mt-4 flex flex-col gap-3.5 text-[15px] leading-[23px] text-primary">
        {children}
      </div>
    </div>
  );
}

/**
 * Emphasis inside guide copy.
 *
 * The alternative is shouting in capitals, which reads as a warning label on a
 * screen whose whole job is to be reassuring. Weight and colour carry the same
 * emphasis without the tone.
 */
export function Strong({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-accent">{children}</span>;
}
