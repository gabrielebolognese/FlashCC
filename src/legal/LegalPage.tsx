/**
 * One painter for both legal documents.
 *
 * Light on chrome on purpose. These pages are read once, by somebody checking a
 * clause or by whoever reviews the account for a payment provider, and the job is
 * legibility at length: a measure of about 70 characters, generous leading, and
 * headings that are findable by eye rather than decorative.
 *
 * It uses the app's own tokens rather than the source document's inline Arial and
 * #595959, which would have been white text on a white background here and light
 * grey on dark everywhere else.
 */
import { ArrowLeft } from "lucide-react";

import { parse, type Block, type Inline, type LegalDoc } from "./legal.js";

function Spans({ spans }: { spans: readonly Inline[] }) {
  return (
    <>
      {spans.map((s, i) => {
        if (s.k === "bold") {
          return (
            <strong key={i} className="font-semibold text-primary">
              {s.text}
            </strong>
          );
        }
        if (s.k === "link") {
          const internal = s.href.startsWith("/") || s.href.startsWith("#");
          return (
            <a
              key={i}
              href={s.href}
              // An internal link stays in the tab; anything leaving does not get
              // to keep a handle on this window.
              {...(internal ? {} : { target: "_blank", rel: "noreferrer noopener" })}
              className="text-accent underline decoration-accent-dim underline-offset-2 hover:decoration-accent"
            >
              {s.text}
            </a>
          );
        }
        return <span key={i}>{s.text}</span>;
      })}
    </>
  );
}

function Painted({ block }: { block: Block }) {
  switch (block.k) {
    case "h2":
      return (
        <h2
          id={block.id}
          // scroll-mt so an anchor jump does not tuck the heading under the
          // sticky header at the top of the page.
          className="scroll-mt-20 pt-8 text-[19px] font-semibold leading-7 tracking-[-0.3px] text-primary"
        >
          {block.text}
        </h2>
      );
    case "h3":
      return (
        <h3 className="pt-5 text-[16px] font-semibold leading-6 text-primary">{block.text}</h3>
      );
    case "note":
      return (
        <p className="border-l-2 border-accent-dim pl-3.5 text-[14px] italic leading-[23px] text-tertiary">
          <Spans spans={block.spans} />
        </p>
      );
    case "ul":
      return (
        <ul className="flex flex-col gap-2 pl-5">
          {block.items.map((item, i) => (
            <li key={i} className="list-disc text-[14px] leading-[23px] text-secondary">
              <Spans spans={item} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="scroll-quiet overflow-x-auto rounded-2xl border border-hairline">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-hairline bg-surface-1 px-3 py-2.5 font-semibold text-primary"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="border-b border-hairline px-3 py-2.5 align-top leading-[20px] text-secondary"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return (
        <p className="text-[14px] leading-[23px] text-secondary">
          <Spans spans={block.spans} />
        </p>
      );
  }
}

export function LegalPage({ doc, onHome }: { doc: LegalDoc; onHome: () => void }) {
  const blocks = parse(doc.body);

  return (
    <div className="min-h-full bg-base">
      <header className="sticky top-0 z-10 border-b border-hairline bg-base/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[820px] items-center gap-3 px-6">
          <button
            type="button"
            onClick={onHome}
            className="flex h-8 items-center gap-1.5 rounded-xl border border-hairline px-3 text-caption text-secondary hover:border-accent-dim hover:text-accent"
          >
            <ArrowLeft size={13} strokeWidth={2} />
            Back
          </button>
          <div className="flex-1" />
          <span className="truncate text-caption text-muted">{doc.title}</span>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-6 pb-24 pt-10">
        <h1 className="text-[30px] font-semibold leading-9 tracking-[-0.8px] text-primary">
          {doc.title}
        </h1>
        <p className="mt-2 text-caption text-muted">Last updated {doc.updated}</p>

        <nav className="mt-8 rounded-2xl border border-hairline bg-surface-1 p-4">
          <div className="text-overline uppercase text-tertiary">Contents</div>
          <ol className="mt-2.5 flex flex-col gap-1">
            {doc.contents.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  className="text-[13px] leading-5 text-tertiary hover:text-accent"
                >
                  {c.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-2 flex flex-col gap-3.5">
          {blocks.map((block, i) => (
            <Painted key={i} block={block} />
          ))}
        </div>
      </main>
    </div>
  );
}
