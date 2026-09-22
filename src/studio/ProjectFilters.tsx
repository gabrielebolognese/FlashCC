/**
 * The bar above the project grid.
 *
 * Everything in it is derived. There is no tag field and there never will be:
 * tagging fails in practice, not from laziness but from vocabulary drift and
 * from the maintenance time small teams do not have. Framework, style and format
 * are already recorded on every document, so these filters populate themselves
 * and cannot go stale.
 *
 * Facets only appear once there is more than one value to choose between. A
 * dropdown with a single option is a control that cannot do anything, and a row
 * of them is how a simple screen starts feeling like enterprise software.
 */
import { Archive, FolderOpen, Search, Send, X } from "lucide-react";

import {
  isFiltering,
  NO_FILTERS,
  type Facets,
  type Filters,
  type Published,
  type Scope,
} from "./search.js";

const field =
  "h-8 rounded-xl border border-hairline bg-surface-1 px-2.5 text-caption text-secondary outline-none focus:border-accent-dim";

function Pill({
  active,
  onClick,
  children,
  count,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
  count?: number;
  icon?: typeof Archive;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-caption",
        active
          ? "border-accent-dim bg-accent-wash text-accent"
          : "border-hairline text-tertiary hover:text-primary",
      ].join(" ")}
    >
      {Icon ? <Icon size={12} strokeWidth={2} /> : null}
      {children}
      {count === undefined || count === 0 ? null : (
        <span className={active ? "text-accent" : "text-muted"}>{count}</span>
      )}
    </button>
  );
}

export function ProjectFilters({
  filters,
  facets,
  onChange,
  showing,
  total,
}: {
  filters: Filters;
  facets: Facets;
  onChange: (next: Filters) => void;
  showing: number;
  total: number;
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const scope = (s: Scope) => set({ scope: filters.scope === s ? "all" : s });
  const published = (p: Published) => set({ published: filters.published === p ? "any" : p });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search
          size={13}
          strokeWidth={2}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Search every slide…"
          aria-label="Search projects"
          className={`${field} w-[220px] pl-7 text-primary placeholder:text-muted`}
        />
      </div>

      {facets.unfiled > 0 ? (
        <Pill
          icon={FolderOpen}
          active={filters.scope === "unfiled"}
          count={facets.unfiled}
          onClick={() => scope("unfiled")}
        >
          Unfiled
        </Pill>
      ) : null}

      {facets.published > 0 ? (
        <Pill
          icon={Send}
          active={filters.published === "yes"}
          count={facets.published}
          onClick={() => published("yes")}
        >
          Posted
        </Pill>
      ) : null}

      {/* Only offered once a choice exists to be made. */}
      {facets.frameworks.length > 1 ? (
        <select
          aria-label="Framework"
          value={filters.framework ?? ""}
          onChange={(e) => set({ framework: e.target.value || null })}
          className={field}
        >
          <option value="">Any framework</option>
          {facets.frameworks.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} ({f.count})
            </option>
          ))}
        </select>
      ) : null}

      {facets.styles.length > 1 ? (
        <select
          aria-label="Style"
          value={filters.style ?? ""}
          onChange={(e) => set({ style: e.target.value || null })}
          className={field}
        >
          <option value="">Any style</option>
          {facets.styles.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} ({f.count})
            </option>
          ))}
        </select>
      ) : null}

      {facets.formats.length > 1 ? (
        <select
          aria-label="Format"
          value={filters.format ?? ""}
          onChange={(e) => set({ format: e.target.value || null })}
          className={field}
        >
          <option value="">Any size</option>
          {facets.formats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label} ({f.count})
            </option>
          ))}
        </select>
      ) : null}

      {facets.archived > 0 ? (
        <Pill
          icon={Archive}
          active={filters.scope === "archived"}
          count={facets.archived}
          onClick={() => scope("archived")}
        >
          Archived
        </Pill>
      ) : null}

      <div className="flex-1" />

      {isFiltering(filters) ? (
        <>
          <span className="text-caption text-muted">
            {showing} of {total}
          </span>
          <button
            type="button"
            onClick={() => onChange(NO_FILTERS)}
            className="flex h-8 items-center gap-1 rounded-xl px-2 text-caption text-tertiary hover:text-primary"
          >
            <X size={12} strokeWidth={2} />
            Clear
          </button>
        </>
      ) : null}
    </div>
  );
}
