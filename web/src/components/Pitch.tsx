/** The football pitch the league page plays on. Stocks stand on it as players, fantasy-football
 *  style: a name plate under each one, an armband on the captain, empty shirts for picks still to
 *  come. Everything on a plate comes from the chain; the pitch itself is only layout. */
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Mascot, type Mood } from "./Mascot";
import { STILL } from "./Motion";

export type Slot = {
  key: string | number;
  /** Stock symbol; leave out for an empty shirt. */
  symbol?: string;
  mood?: Mood;
  captain?: boolean;
  /** Captain from next week (a season change waits for the week to end). */
  nextCaptain?: boolean;
  name: ReactNode;
  sub?: ReactNode;
  tone?: "up" | "down";
  selected?: boolean;
  onClick?: () => void;
  title?: string;
};

/** Rows of players for a squad of n, at most four across. Fewer up front, like a real line-up. */
export function formation(n: number): number[] {
  if (n <= 4) return [n];
  const rows = Math.ceil(n / 4);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return [...Array(rows).keys()].map((r) => base + (r >= rows - extra ? 1 : 0));
}

/** One team's players in rows. `facing="down"` puts the front row at the bottom (the top half). */
export function Lineup({ slots, facing = "up" }: { slots: Slot[]; facing?: "up" | "down" }) {
  const rows: Slot[][] = [];
  let i = 0;
  for (const k of formation(slots.length)) {
    rows.push(slots.slice(i, i + k));
    i += k;
  }
  if (facing === "down") rows.reverse();
  return (
    <div className={`lineup lineup-${facing}`}>
      {rows.map((row, r) => (
        <div key={r} className="pp-row" style={{ ["--k" as string]: Math.max(row.length, 3) }}>
          {row.map((s, j) => <PitchPlayer key={s.key} s={s} i={r * 4 + j} />)}
        </div>
      ))}
    </div>
  );
}

function PitchPlayer({ s, i }: { s: Slot; i: number }) {
  const Tag = s.onClick ? motion.button : motion.div;
  return (
    <Tag
      type={s.onClick ? "button" : undefined}
      className={`pp ${s.symbol ? "" : "pp-empty"} ${s.selected ? "on" : ""} ${s.onClick ? "pp-tap" : ""}`}
      onClick={s.onClick}
      title={s.title}
      aria-pressed={s.onClick ? !!s.selected : undefined}
      initial={STILL ? false : { opacity: 0, y: -34, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 360, damping: 22, delay: 0.05 + i * 0.06 }}
    >
      <span className="pp-fig">
        {s.symbol ? <Mascot symbol={s.symbol} mood={s.mood} height={120} /> : <Shirt />}
        {s.captain && <span className="armband" title="Captain: counts double">C</span>}
        {s.nextCaptain && <span className="armband armband-next" title="Captain from next week">C</span>}
      </span>
      <span className="pp-plate">
        <b>{s.name}</b>
        {s.sub !== undefined && <span className={s.tone ?? ""}>{s.sub}</span>}
      </span>
    </Tag>
  );
}

/** An empty shirt for a pick still to come. */
function Shirt() {
  return (
    <svg className="shirt" viewBox="0 0 100 100" aria-hidden="true">
      <path
        d="M36 14 L22 20 L8 38 L22 50 L28 44 L28 88 L72 88 L72 44 L78 50 L92 38 L78 20 L64 14 C61 22 56 26 50 26 C44 26 39 22 36 14 Z"
        fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="5 5"
      />
    </svg>
  );
}

/** Pitch markings. "full" has both goals and a halfway line; "half" has one goal at the bottom. */
export function Lines({ variant }: { variant: "full" | "half" }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 0.5 } as const;
  return variant === "full" ? (
    <svg className="lines" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
      <rect x="3" y="3" width="94" height="134" rx="1.5" {...s} />
      <line x1="3" y1="70" x2="97" y2="70" {...s} />
      <ellipse cx="50" cy="70" rx="13" ry="9.5" {...s} />
      <rect x="24" y="3" width="52" height="20" {...s} />
      <rect x="37" y="3" width="26" height="8" {...s} />
      <rect x="24" y="117" width="52" height="20" {...s} />
      <rect x="37" y="129" width="26" height="8" {...s} />
    </svg>
  ) : (
    <svg className="lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path d="M3 3 V97 H97 V3" {...s} />
      <line x1="3" y1="3" x2="97" y2="3" {...s} />
      <path d="M37 3 A13 11 0 0 0 63 3" {...s} />
      <rect x="22" y="72" width="56" height="25" {...s} />
      <rect x="36" y="87" width="28" height="10" {...s} />
      <path d="M41 72 A10 7 0 0 1 59 72" {...s} />
    </svg>
  );
}
