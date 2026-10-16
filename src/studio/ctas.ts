/**
 * Calls to action by goal (25.4).
 *
 * Keyed by what the post is FOR, and worded per platform, because the same ask
 * is said differently on each: LinkedIn reposts, Instagram shares; "link in
 * bio" means nothing on LinkedIn, where links live in the comments.
 *
 * The closing slide is the one the caption route already reads as the post's
 * CTA (Batch 12.1, `PostSheet` sends the last slide), so a CTA chosen here
 * puts the same ask on the slide and in the caption by construction.
 *
 * Nothing is ranked, and nothing claims a conversion rate. Pure.
 */
import type { PlatformId } from "./platforms.js";

export type CtaGoal =
  | "follow"
  | "save"
  | "share"
  | "comment"
  | "comment-keyword"
  | "dm-keyword"
  | "link"
  | "newsletter"
  | "book-call"
  | "part-two";

export type CtaDef = {
  id: CtaGoal;
  label: string;
  note: string;
  /** Asks for a word the reader types back. */
  keyword?: boolean | undefined;
  /** Wordings, per platform; `default` for any platform not named. */
  lines: Partial<Record<PlatformId | "default", string[]>> & { default: string[] };
};

export const CTAS: CtaDef[] = [
  {
    id: "follow",
    label: "Follow",
    note: "For a series or a regular topic",
    lines: {
      default: ["Follow for more on [topic].", "Follow so you see the next one."],
      linkedin: ["Follow me for more on [topic].", "Hit follow so the next one reaches you."],
    },
  },
  {
    id: "save",
    label: "Save",
    note: "For a reference people come back to",
    lines: {
      default: ["Save this for later.", "Save it before your next [topic]."],
      linkedin: ["Bookmark this for your next [topic].", "Save this post so you can find it later."],
    },
  },
  {
    id: "share",
    label: "Share",
    note: "For something a colleague needs",
    lines: {
      default: ["Share this with someone who needs it.", "Send this to a friend who does [topic]."],
      linkedin: ["Repost this for someone in your network.", "Repost if your team needs to see this."],
      x: ["Repost this for someone who needs it."],
      bluesky: ["Repost this for someone who needs it."],
    },
  },
  {
    id: "comment",
    label: "Comment",
    note: "For an opinion or a question",
    lines: {
      default: ["Which one are you? Tell me below.", "Agree or disagree? Comment below."],
      linkedin: ["What would you add? Tell me in the comments.", "Agree or disagree? I read every comment."],
    },
  },
  {
    id: "comment-keyword",
    label: "Comment a keyword",
    note: "Comment a word to get something",
    keyword: true,
    lines: {
      default: ["Comment [keyword] and I will send you the [thing].", "Want the [thing]? Comment [keyword]."],
    },
  },
  {
    id: "dm-keyword",
    label: "DM a keyword",
    note: "Message a word to get something",
    keyword: true,
    lines: {
      default: ["DM me [keyword] for the [thing].", "Send me [keyword] and I will send you the [thing]."],
      linkedin: ["Message me [keyword] and I will send you the [thing]."],
    },
  },
  {
    id: "link",
    label: "Link",
    note: "Send them to a page",
    lines: {
      default: ["The [thing] is linked in my bio.", "Link in bio for the full [thing]."],
      linkedin: ["The [thing] is linked in the first comment.", "Link to the full [thing] in the comments."],
      x: ["The full [thing] is in the reply below."],
      bluesky: ["The full [thing] is in the reply below."],
      pinterest: ["Tap through for the full [thing]."],
    },
  },
  {
    id: "newsletter",
    label: "Newsletter",
    note: "Turn a reader into a subscriber",
    lines: {
      default: ["Get one of these every week: newsletter link in bio.", "Want the long version? It is in my newsletter."],
      linkedin: ["I write one of these every week. Subscribe to my newsletter above."],
    },
  },
  {
    id: "book-call",
    label: "Book a call",
    note: "For a service offer",
    lines: {
      default: ["Want help with [topic]? Book a call, link in bio.", "Two spots open this month. DM me to book a call."],
      linkedin: ["Want help with [topic]? Book a call, link in the comments.", "Two spots open this month. Message me to book a call."],
    },
  },
  {
    id: "part-two",
    label: "Part 2 tomorrow",
    note: "For a series: brings them back",
    lines: {
      default: ["Part 2 tomorrow. Follow so you do not miss it.", "This is part 1. Part 2 lands tomorrow."],
    },
  },
];

/** The wordings a goal has on a platform, with its blanks filled where given. */
export function ctaLines(goal: CtaGoal, platform: PlatformId | null | undefined, fill: Record<string, string> = {}): string[] {
  const def = CTAS.find((c) => c.id === goal);
  if (!def) return [];
  const lines = (platform ? def.lines[platform] : undefined) ?? def.lines.default;
  return lines.map((l) =>
    l.replace(/\[([^\]]+)\]/g, (whole, label: string) => {
      const v = (fill[label] ?? "").trim();
      return v || whole;
    }),
  );
}

/** The blanks a goal's wordings use, so the picker asks for exactly those. */
export function ctaBlanks(goal: CtaGoal): string[] {
  const def = CTAS.find((c) => c.id === goal);
  const all = Object.values(def?.lines ?? {}).flat();
  const out: string[] = [];
  for (const l of all) for (const m of l.matchAll(/\[([^\]]+)\]/g)) if (!out.includes(m[1]!)) out.push(m[1]!);
  return out;
}
