/**
 * A sample history, so the insight screens can be judged on what they say rather than
 * on an empty state.
 *
 * The numbers are not random noise. A real pattern is baked in, Problem → Solution
 * carousels and question hooks genuinely do better here, short Showcase posts
 * genuinely do worse, because a demo whose charts show nothing teaches nothing, and
 * because it makes the gates below testable by eye: the story framework appears twice,
 * so however good its numbers look, the app should refuse to draw a conclusion from it.
 *
 * Nothing here is written unless the user asks for it.
 */

import { EMPTY_METRICS, makePost, type Metrics, type Platform, type Post } from "./pipeline.js";

type Seed = {
  title: string;
  hook: string;
  framework: string;
  slides: number;
  style: string;
  platform: Platform;
  /** Days before today. */
  ago: number;
  reach: number;
  /** Engagement as a share of reach, before rounding. */
  rate: number;
  follows: number;
};

const SEEDS: Seed[] = [
  // The winners: problem-solve, asked as a question.
  { title: "Why your edits drag", hook: "Why do your edits feel slow?", framework: "problem", slides: 7, style: "ink", platform: "linkedin", ago: 12, reach: 24800, rate: 0.071, follows: 96 },
  { title: "The silent client killer", hook: "Why do good edits still lose clients?", framework: "problem", slides: 8, style: "ink", platform: "linkedin", ago: 33, reach: 19200, rate: 0.064, follows: 71 },
  { title: "Pacing problems", hook: "Why does your cut lose people at 8 seconds?", framework: "problem", slides: 7, style: "cobalt", platform: "linkedin", ago: 54, reach: 15600, rate: 0.058, follows: 54 },
  { title: "Revisions spiral", hook: "Why does every project need five revisions?", framework: "problem", slides: 6, style: "ink", platform: "linkedin", ago: 71, reach: 11400, rate: 0.052, follows: 38 },

  // Educational: solid, unspectacular.
  { title: "Colour in 6 steps", hook: "6 grading moves that cost nothing", framework: "educational", slides: 9, style: "noir", platform: "linkedin", ago: 5, reach: 6100, rate: 0.038, follows: 17 },
  { title: "Sound design basics", hook: "5 sound choices that carry a whole cut", framework: "educational", slides: 8, style: "ink", platform: "linkedin", ago: 26, reach: 5400, rate: 0.041, follows: 14 },
  { title: "B-roll that earns its place", hook: "How to cut b-roll that is not filler", framework: "educational", slides: 10, style: "noir", platform: "instagram", ago: 40, reach: 4900, rate: 0.045, follows: 21 },
  { title: "Export settings", hook: "How to export without wrecking the grade", framework: "educational", slides: 6, style: "terminal", platform: "linkedin", ago: 62, reach: 3800, rate: 0.033, follows: 9 },
  { title: "Transitions, honestly", hook: "Most transitions are hiding a bad cut.", framework: "educational", slides: 7, style: "ink", platform: "linkedin", ago: 84, reach: 4400, rate: 0.036, follows: 12 },

  // Showcase: the underperformer, and short.
  { title: "Brand film cutdown", hook: "A 60 second brand film.", framework: "showcase", slides: 5, style: "paper", platform: "instagram", ago: 9, reach: 2100, rate: 0.029, follows: 4 },
  { title: "Product launch reel", hook: "A launch reel for a hardware client.", framework: "showcase", slides: 4, style: "paper", platform: "instagram", ago: 30, reach: 1700, rate: 0.031, follows: 3 },
  { title: "Founder interview", hook: "A founder interview, cut three ways.", framework: "showcase", slides: 5, style: "sand", platform: "linkedin", ago: 47, reach: 2600, rate: 0.026, follows: 6 },
  { title: "Event recap", hook: "Two days on site, ninety seconds on screen.", framework: "showcase", slides: 5, style: "paper", platform: "instagram", ago: 66, reach: 1900, rate: 0.028, follows: 2 },

  // Story: only two, on purpose. Great numbers the app must refuse to conclude from.
  { title: "The client who ghosted", hook: "The client ghosted us for three weeks.", framework: "story", slides: 9, style: "cobalt", platform: "linkedin", ago: 18, reach: 21400, rate: 0.068, follows: 83 },
  { title: "Losing the pitch", hook: "We lost a pitch we should have won.", framework: "story", slides: 8, style: "cobalt", platform: "linkedin", ago: 77, reach: 17300, rate: 0.061, follows: 62 },
];

const daysAgo = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
};

const daysAhead = (n: number, hour = 9): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

function metricsFor(s: Seed): Metrics {
  const total = Math.round(s.reach * s.rate);
  // A plausible split of engagement, weighted the way these platforms actually behave.
  const likes = Math.round(total * 0.72);
  const comments = Math.round(total * 0.11);
  const shares = Math.round(total * 0.09);
  return {
    ...EMPTY_METRICS,
    impressions: s.reach,
    likes,
    comments,
    shares,
    saves: total - likes - comments - shares,
    follows: s.follows,
    clicks: Math.round(s.reach * 0.012),
  };
}

/** The published history. */
const history = (): Post[] =>
  SEEDS.map((s) =>
    makePost({
      title: s.title,
      hook: s.hook,
      framework: s.framework,
      slideCount: s.slides,
      styleId: s.style,
      platform: s.platform,
      stage: "posted",
      postedAt: daysAgo(s.ago),
      createdAt: daysAgo(s.ago + 3),
      metrics: metricsFor(s),
    }),
  );

/** And a working pipeline in front of it, so the board is not empty either. */
const queue = (): Post[] => [
  makePost({
    title: "Why your thumbnails miss",
    hook: "Why do your thumbnails get scrolled past?",
    framework: "problem",
    slideCount: 7,
    styleId: "ink",
    stage: "scheduled",
    scheduledFor: daysAhead(2),
  }),
  makePost({
    title: "Retainer clients",
    hook: "How to turn one project into a retainer",
    framework: "educational",
    slideCount: 8,
    styleId: "ink",
    stage: "scheduled",
    scheduledFor: daysAhead(5, 17),
  }),
  makePost({
    title: "Doc series, part one",
    hook: "A three part documentary, cut solo.",
    framework: "showcase",
    slideCount: 6,
    styleId: "paper",
    platform: "instagram",
    stage: "scheduled",
    // Deliberately in the past: the board should surface this as overdue.
    scheduledFor: daysAgo(1),
  }),
  makePost({
    title: "Pricing, out loud",
    hook: "What I charge, and why.",
    framework: "story",
    slideCount: 9,
    styleId: "cobalt",
    stage: "ready",
  }),
  makePost({
    title: "The brief that saved a shoot",
    hook: "A one page brief saved a two day shoot.",
    framework: "story",
    slideCount: 7,
    styleId: "cobalt",
    stage: "drafting",
  }),
  makePost({ title: "Why clients ask for one more version", stage: "idea" }),
  makePost({ title: "The edit I would not take on again", stage: "idea" }),
  makePost({ title: "Three lies about turnaround time", stage: "idea" }),
];

export const demoPosts = (): Post[] => [...queue(), ...history()];

export const DEMO_COUNT = SEEDS.length + queue().length;
