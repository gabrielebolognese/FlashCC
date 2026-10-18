/**
 * This cover, beside the last eight, at the size a profile visitor sees them.
 *
 * People judge a cover by how it sits next to the others, and until now they
 * found out after posting. Nothing new is fetched for it: published covers
 * already live at public URLs (Batch 5), and when there is no account the
 * local copy of each carousel is drawn instead.
 *
 * Every tile is the grid's own 3:4 crop, so a 4:5 cover shows what Instagram
 * actually cuts off its sides, which is the reason to look at all.
 */
import { publicUrl, SLIDES_BUCKET } from "./cloud.js";
import type { Slide } from "./model.js";
import type { Post } from "./pipeline.js";
import { slidePath } from "./publish.js";
import { SlidePreview } from "./SlidePreview.js";
import { loadDoc } from "./storage.js";

/** The grid's tile, width over height. */
const TILE = 3 / 4;

/** A slide rendered to cover a 3:4 tile, centred, the way the grid crops it. */
export function Cropped({ slide, w, h }: { slide: Slide | undefined; w: number; h: number }) {
  const board = w / h;
  // Wider than the tile: fill the height and let the sides fall off. Taller:
  // fill the width and lose the top and bottom.
  const width = board > TILE ? (board / TILE) * 100 : 100;
  const height = board > TILE ? 100 : (TILE / board) * 100;
  return (
    <div className="relative aspect-[3/4] overflow-hidden bg-surface-1">
      <div
        className="absolute"
        style={{ width: `${width}%`, left: `${(100 - width) / 2}%`, top: `${(100 - height) / 2}%` }}
      >
        <SlidePreview slide={slide} w={w} h={h} />
      </div>
    </div>
  );
}

function Neighbour({ post, userId }: { post: Post; userId: string | null }) {
  if (userId && post.docId) {
    return (
      <div className="relative aspect-[3/4] overflow-hidden bg-surface-1">
        <img
          src={publicUrl(SLIDES_BUCKET, slidePath(userId, post.docId, 0, "jpg"))}
          alt={post.title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }
  const doc = post.docId ? loadDoc(post.docId) : null;
  return doc ? (
    <Cropped slide={doc.slides[0]} w={doc.width} h={doc.height} />
  ) : (
    <div className="aspect-[3/4] bg-surface-1" />
  );
}

export function GridPreview({
  cover,
  w,
  h,
  neighbours,
  userId,
}: {
  cover: Slide | undefined;
  w: number;
  h: number;
  neighbours: readonly Post[];
  userId: string | null;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-hairline bg-surface-1 p-3.5">
      <div className="flex items-center gap-2">
        <span className="text-body-strong text-secondary">On your profile</span>
        <span className="text-caption text-muted">
          {neighbours.length === 0
            ? "Nothing published to Instagram yet"
            : `Beside your last ${neighbours.length}`}
        </span>
      </div>
      <div className="mx-auto mt-2.5 grid max-w-[300px] grid-cols-3 gap-0.5">
        <div className="outline outline-2 outline-accent">
          <Cropped slide={cover} w={w} h={h} />
        </div>
        {neighbours.map((p) => (
          <Neighbour key={p.id} post={p} userId={userId} />
        ))}
      </div>
      <p className="mt-2 text-caption leading-4 text-muted">
        Tiles are the grid&rsquo;s own 3:4 crop, so the edges you see are the edges a profile
        visitor gets.
      </p>
    </div>
  );
}
