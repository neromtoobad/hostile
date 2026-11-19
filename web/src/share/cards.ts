/** Share cards: the 1200×630 pictures X shows when a Hostile link is posted. Each card is a tree of
 *  boxes (the shape @vercel/og draws), built only from a league's on-chain state. Nothing here
 *  fetches or invents numbers: the caller passes the LeagueState it just read from Base. */
import type { LeagueState, Manager, Stock } from "../lib/leagueRead";
import { hasMascot, seatFace, teamFace } from "../lib/mascots";
import { money, shares, tickPct, usd, weekLengthLabel } from "../lib/format";

export const CARD = { width: 1200, height: 630 } as const;

export type Node = { type: string; props: Record<string, unknown> };
type Kid = Node | string | number | false | null | undefined;
type Style = Record<string, string | number>;

const C = {
  bg: "#FFFFFF", soft: "#F4F5F8", ink: "#0B0F1A", slate: "#6B7385", line: "#E8EAF0",
  cobalt: "#1D3BFF", lit: "#3D59FF", sky: "#B9C7FF", win: "#0A9A66", loss: "#E5484D", volt: "#D8FF3D",
} as const;
const DISPLAY = "Funnel Display";
const SANS = "Funnel Sans";
const PITCH_LINE = "3px solid rgba(255,255,255,0.2)";

const el = (type: string, props: Record<string, unknown>, ...kids: (Kid | Kid[])[]): Node => {
  const children = kids.flat().filter((k): k is Node | string | number => k !== false && k !== null && k !== undefined);
  return { type, props: children.length ? { ...props, children: children.length === 1 ? children[0] : children } : props };
};
/** A flex box. Every box is flex because the renderer requires it for more than one child. */
const box = (style: Style, ...kids: (Kid | Kid[])[]) => el("div", { style: { display: "flex", ...style } }, ...kids);
const col = (style: Style, ...kids: (Kid | Kid[])[]) => box({ flexDirection: "column", ...style }, ...kids);
const text = (s: string | number, style: Style = {}) => box(style, String(s));

/** Team and league names are typed by players: keep them to one line's worth. */
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const record = (m: Manager) => `${m.wins}-${m.losses}${m.ties ? `-${m.ties}` : ""}`;
const worth = (s: Stock) => (Number(s.shares) / 1e8) * (s.price ?? 0);
const bag = (L: LeagueState, m: Manager) => m.roster.reduce((sum, id) => sum + worth(L.stocks[id]), 0);

// ───────────── shared pieces ─────────────

function brand(light = false) {
  return box(
    { alignItems: "center", gap: 12 },
    el(
      "svg", { viewBox: "0 0 32 32", width: 40, height: 40 },
      el("rect", { width: 32, height: 32, rx: 9, fill: light ? "#FFFFFF" : C.cobalt }),
      el("path", { d: "M7 9l8 7-8 7z", fill: light ? C.cobalt : "#FFFFFF" }),
      el("path", { d: "M25 9l-8 7 8 7z", fill: light ? C.ink : C.volt }),
    ),
    text("hostile", { fontFamily: DISPLAY, fontWeight: 500, fontSize: 34, letterSpacing: "-0.04em", color: light ? "#FFFFFF" : C.ink }),
  );
}

const chip = (label: string, tone: "soft" | "volt" | "cobalt" | "glass" = "soft") =>
  text(label, {
    alignSelf: "flex-start", padding: "8px 18px", borderRadius: 999, fontFamily: SANS, fontWeight: 600, fontSize: 22,
    background: tone === "volt" ? C.volt : tone === "cobalt" ? C.cobalt : tone === "glass" ? "rgba(255,255,255,0.16)" : C.soft,
    color: tone === "cobalt" || tone === "glass" ? "#FFFFFF" : C.ink,
  });

function mascot(base: string, symbol: string, size: number, opts: { ghost?: boolean; captain?: boolean; crown?: boolean } = {}) {
  const face = hasMascot(symbol)
    ? el("img", { src: `${base}/og/mascots/${symbol}.png`, width: size, height: size, style: { opacity: opts.ghost ? 0.28 : 1 } })
    : box(
        { width: size * 0.8, height: size * 0.8, margin: size * 0.1, borderRadius: 999, background: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", color: "#FFFFFF", fontFamily: DISPLAY, fontWeight: 700, fontSize: size * 0.22 },
        symbol.slice(0, 4),
      );
  return box(
    { position: "relative", width: size, height: size },
    face,
    opts.captain &&
      box(
        { position: "absolute", top: size * 0.04, right: size * 0.02, width: size * 0.3, height: size * 0.3, borderRadius: 999, background: C.volt, border: `3px solid ${C.ink}`, alignItems: "center", justifyContent: "center", color: C.ink, fontFamily: DISPLAY, fontWeight: 700, fontSize: size * 0.17 },
        "C",
      ),
    opts.crown &&
      el(
        "svg", { viewBox: "0 0 64 44", width: size * 0.42, height: size * 0.29, style: { position: "absolute", top: -size * 0.13, left: size * 0.29 } },
        el("path", { d: "M4 16 L18 28 L32 4 L46 28 L60 16 L54 40 H10 Z", fill: "#FFC53D", stroke: "#B7791F", strokeWidth: 3, strokeLinejoin: "round" }),
        el("circle", { cx: 32, cy: 27, r: 4.5, fill: "#2F55FF" }),
      ),
  );
}

const plate = (name: string, sub?: string, tone?: "up" | "down") =>
  col(
    { alignItems: "center", padding: "5px 14px 6px", borderRadius: 14, background: "#FFFFFF", marginTop: -6 },
    text(name, { fontFamily: SANS, fontWeight: 600, fontSize: 19, color: C.ink, whiteSpace: "nowrap" }),
    sub !== undefined && text(sub, { fontFamily: SANS, fontWeight: 400, fontSize: 16, color: tone === "up" ? C.win : tone === "down" ? C.loss : C.slate, whiteSpace: "nowrap" }),
  );

type Player = { symbol: string; name: string; sub?: string; tone?: "up" | "down"; captain?: boolean; ghost?: boolean };

/** Rows for n players on a card's pitch. Like the app's formation (fewer up front), but the card's
 *  panel is taller than it is wide, so it goes to two rows sooner and the mascots stay big. */
export function cardRows(n: number): number[] {
  const across = n <= 4 ? 2 : n <= 6 ? 3 : 4;
  const rows = Math.ceil(n / across);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return [...Array(rows).keys()].map((r) => base + (r >= rows - extra ? 1 : 0));
}

/** Players in rows on the pitch. Names are cut to fit their plate. */
function lineup(base: string, players: Player[], width: number, height: number, note?: string) {
  const shape = cardRows(players.length);
  const perRow = Math.max(...shape, 2);
  const size = Math.floor(Math.min((width - 56) / perRow - 10, (height - 64 - (note ? 34 : 0)) / shape.length - 56, 176));
  const fit = Math.max(4, Math.floor((size - 14) / 10));
  const rows: Player[][] = [];
  let i = 0;
  for (const k of shape) {
    rows.push(players.slice(i, i + k));
    i += k;
  }
  return col(
    { width, height, alignItems: "center", justifyContent: "center", gap: 10 },
    rows.map((row) =>
      box(
        { justifyContent: "center", gap: 10 },
        row.map((p) =>
          col({ alignItems: "center", width: size }, mascot(base, p.symbol, size, { captain: p.captain, ghost: p.ghost }), plate(clip(p.name, fit), p.sub === undefined ? undefined : clip(p.sub, fit + 2), p.tone)),
        ),
      ),
    ),
    note && text(note, { fontFamily: SANS, fontWeight: 600, fontSize: 20, color: C.sky, marginTop: 4 }),
  );
}

/** The cobalt pitch panel on the right of a card: one goal at the bottom, like the app's half pitch. */
function pitchPanel(width: number, height: number, ...kids: (Kid | Kid[])[]) {
  return box(
    { position: "relative", width, height, borderRadius: 36, background: `linear-gradient(180deg, ${C.lit} 0%, ${C.cobalt} 38%)`, overflow: "hidden" },
    box({ position: "absolute", left: 22, top: 22, width: width - 44, height: height - 44, borderRadius: 16, border: PITCH_LINE }),
    box({ position: "absolute", left: width / 2 - 70, top: -70 + 22, width: 140, height: 140, borderRadius: 999, border: PITCH_LINE }),
    box({ position: "absolute", left: width * 0.24, top: height - 22 - 96, width: width * 0.52, height: 96, border: PITCH_LINE }),
    box({ position: "absolute", left: 0, top: 0, width, height }, ...kids),
  );
}

const stat = (value: string, label: string) =>
  col(
    { gap: 2 },
    text(value, { fontFamily: DISPLAY, fontWeight: 500, fontSize: 40, letterSpacing: "-0.03em", color: C.ink }),
    text(label, { fontFamily: SANS, fontSize: 20, color: C.slate }),
  );

const title = (s: string) => {
  const t = clip(s, 44);
  const size = t.length <= 12 ? 92 : t.length <= 20 ? 76 : t.length <= 30 ? 62 : 52;
  return text(t, { fontFamily: DISPLAY, fontWeight: 500, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.045em", color: C.ink });
};

const SITE = "hostile.nerom.site";
const foot = (note?: string) =>
  box(
    { alignItems: "center", gap: 12, fontFamily: SANS, fontSize: 21, color: C.slate },
    text(SITE, { color: C.ink, fontWeight: 600 }),
    note && text("·"),
    note && text(note),
  );

/** White card, words on the left, the pitch on the right. */
function split(left: (Kid | Kid[])[], right: Node) {
  return box(
    { width: CARD.width, height: CARD.height, background: C.bg, padding: 44, gap: 40, fontFamily: SANS },
    col({ flex: 1, justifyContent: "space-between" }, ...left),
    right,
  );
}
const PANEL = { width: 500, height: 542 };

// ───────────── the cards ─────────────

/** The site's own card: no league, no numbers. */
export function siteCard(base: string): Node {
  const faces = ["NVDA", "TSLA", "AAPL", "MSTR", "PLTR"];
  return split(
    [
      brand(),
      col(
        { gap: 22 },
        text("Fantasy stock league with real shares.", { fontFamily: DISPLAY, fontWeight: 500, fontSize: 74, lineHeight: 1.02, letterSpacing: "-0.045em", color: C.ink }),
        text("Draft real stocks with friends on Base. Each week the loser hands 10% of their shares to the winner.", { fontSize: 27, lineHeight: 1.35, color: C.slate }),
      ),
      foot(),
    ],
    pitchPanel(
      PANEL.width, PANEL.height,
      col(
        { width: PANEL.width, height: PANEL.height, alignItems: "center", justifyContent: "center", gap: 6 },
        box({ gap: 4 }, faces.slice(0, 2).map((s) => mascot(base, s, 190))),
        box({ gap: 0 }, faces.slice(2).map((s) => mascot(base, s, 160))),
      ),
    ),
  );
}

/** A league, whatever stage it is in: open seats, the draft, the season table, or the champion. */
export function leagueCard(L: LeagueState, base: string): Node {
  const c = L.config;
  const stats = box(
    { gap: 44 },
    stat(usd(c.entryFee), "entry"),
    stat(`${L.managers.length}/${c.maxManagers}`, "players"),
    stat(String(c.rosterSize), "stocks each"),
    stat(String(c.seasonWeeks), c.weekLength === 604800 ? "weeks" : `weeks of ${weekLengthLabel(c.weekLength)}`),
  );
  const rule = "Each week the loser hands 10% of their shares to the winner.";

  if (L.phase === 0) {
    const shown = Math.min(c.maxManagers, 8);
    const seats: Player[] = [...Array(shown).keys()].map((s) => {
      const m = L.managers[s];
      return m ? { symbol: seatFace(s), name: m.team } : { symbol: seatFace(s), name: "Open seat", ghost: true };
    });
    const open = c.maxManagers - L.managers.length;
    return split(
      [
        box({ justifyContent: "space-between", alignItems: "center" }, brand(), chip(open > 0 ? `${open} ${open === 1 ? "seat" : "seats"} open` : "Full", "volt")),
        col({ gap: 20 }, title(L.name), text(`Draft real stocks with friends. ${rule}`, { fontSize: 26, lineHeight: 1.35, color: C.slate })),
        col({ gap: 26 }, stats, foot("on Base")),
      ],
      pitchPanel(PANEL.width, PANEL.height, lineup(base, seats, PANEL.width, PANEL.height, c.maxManagers > shown ? `+${c.maxManagers - shown} more seats` : undefined)),
    );
  }

  if (L.phase === 1) {
    const total = c.rosterSize * L.managers.length;
    const picked = L.stocks.filter((s) => s.owner !== undefined);
    const drafted: Player[] = picked.slice(0, 8).map((s) => ({ symbol: s.meta.symbol, name: s.meta.symbol, sub: L.managers[s.owner!]?.team ?? "" }));
    const clock = L.onTheClock !== undefined ? L.managers[L.onTheClock] : undefined;
    return split(
      [
        box({ justifyContent: "space-between", alignItems: "center" }, brand(), chip(`Draft · pick ${Math.min(L.pickNumber + 1, total)} of ${total}`, "volt")),
        col(
          { gap: 20 },
          title(L.name),
          text(`${clock ? `${clip(clock.team, 22)} is on the clock. ` : ""}Every pick buys a real share on Base.`, { fontSize: 26, lineHeight: 1.35, color: C.slate }),
        ),
        col({ gap: 26 }, stats, foot("on Base")),
      ],
      pitchPanel(
        PANEL.width, PANEL.height,
        drafted.length
          ? lineup(base, drafted, PANEL.width, PANEL.height, picked.length > drafted.length ? `+${picked.length - drafted.length} more picked` : undefined)
          : col({ width: PANEL.width, height: PANEL.height, alignItems: "center", justifyContent: "center" }, text("No picks yet", { fontFamily: DISPLAY, fontWeight: 500, fontSize: 44, color: "#FFFFFF" })),
      ),
    );
  }

  if (L.phase === 3 && L.champion) {
    const champ = L.managers[L.champion.seat];
    const prize = L.stocks[c.treasuryStock];
    return split(
      [
        box({ justifyContent: "space-between", alignItems: "center" }, brand(), chip("Season over", "volt")),
        col(
          { gap: 20 },
          title(`${clip(champ.team, 20)} won.`),
          text(`Champion of ${clip(L.name, 28)} after ${c.seasonWeeks} weeks, ${record(champ)}. The prize: ${shares(L.treasuryShares)} ${prize.meta.symbol}.`, { fontSize: 26, lineHeight: 1.35, color: C.slate }),
        ),
        col({ gap: 26 }, stats, foot("on Base")),
      ],
      pitchPanel(
        PANEL.width, PANEL.height,
        col(
          { width: PANEL.width, height: PANEL.height, alignItems: "center", justifyContent: "center", paddingTop: 30 },
          mascot(base, teamFace(L, champ), 320, { crown: true }),
          plate(clip(champ.team, 20), "Champion"),
        ),
      ),
    );
  }

  // Season (and a finished league that somehow has no champion recorded).
  const table = [...L.managers].sort((x, y) => y.wins - x.wins || y.total - x.total).slice(0, 5);
  const week = Math.min(L.weeksSettled + 1, c.seasonWeeks);
  return split(
    [
      box({ justifyContent: "space-between", alignItems: "center" }, brand(), chip(L.phase === 3 ? "Season over" : `Week ${week} of ${c.seasonWeeks}`, "volt")),
      col({ gap: 20 }, title(L.name), text(rule, { fontSize: 26, lineHeight: 1.35, color: C.slate })),
      col({ gap: 26 }, stats, foot("on Base")),
    ],
    pitchPanel(
      PANEL.width, PANEL.height,
      col(
        { width: PANEL.width, height: PANEL.height, padding: 40, justifyContent: "center", gap: 10 },
        text("Standings", { fontFamily: SANS, fontWeight: 600, fontSize: 22, color: C.sky, marginBottom: 2 }),
        table.map((m, i) =>
          box(
            { alignItems: "center", gap: 12, padding: "6px 18px 6px 10px", borderRadius: 20, background: "#FFFFFF" },
            text(i + 1, { width: 26, justifyContent: "center", fontFamily: DISPLAY, fontWeight: 700, fontSize: 24, color: C.slate }),
            mascot(base, teamFace(L, m), 64),
            col({ flex: 1 }, text(clip(m.team, 13), { fontWeight: 600, fontSize: 24, color: C.ink, whiteSpace: "nowrap" }), text(record(m), { fontSize: 18, color: C.slate })),
            text(tickPct(m.total), { fontFamily: DISPLAY, fontWeight: 500, fontSize: 28, color: m.total >= 0 ? C.win : C.loss }),
          ),
        ),
      ),
    ),
  );
}

/** One manager's squad on the pitch, with what the bag is worth right now. */
export function teamCard(L: LeagueState, m: Manager, base: string): Node {
  const season = L.phase >= 2;
  const players: Player[] = m.roster.map((id) => {
    const s = L.stocks[id];
    return { symbol: s.meta.symbol, name: s.meta.symbol, sub: money(worth(s)), captain: id === m.captain };
  });
  return split(
    [
      box({ justifyContent: "space-between", alignItems: "center" }, brand(), chip(clip(L.name, 24))),
      col(
        { gap: 18 },
        title(m.team),
        text(
          season ? `${record(m)} this season, ${tickPct(m.total)} overall. Captain ${L.stocks[m.captain]?.meta.symbol ?? ""} scores double.` : "Still drafting. Every pick is a real share on Base.",
          { fontSize: 26, lineHeight: 1.35, color: C.slate },
        ),
      ),
      col(
        { gap: 26 },
        box({ gap: 44 }, stat(money(bag(L, m)), "in real shares now"), stat(String(m.roster.length), m.roster.length === 1 ? "stock" : "stocks")),
        foot("on Base"),
      ),
    ],
    pitchPanel(PANEL.width, PANEL.height, lineup(base, players, PANEL.width, PANEL.height)),
  );
}

export type MatchView = {
  /** Week index, 0-based. */
  week: number;
  a: Manager;
  b: Manager;
  scoreA: number;
  scoreB: number;
  /** True once the week is settled on chain; false while the scores are live estimates. */
  final: boolean;
};

/** One match: two squads either side of the halfway line, and who pays whom. */
export function matchCard(L: LeagueState, v: MatchView, base: string): Node {
  const W = CARD.width - 88;
  const H = 372;
  const lead = v.scoreA === v.scoreB ? undefined : v.scoreA > v.scoreB ? v.a : v.b;
  const trail = lead === undefined ? undefined : lead === v.a ? v.b : v.a;
  const side = (m: Manager, score: number, end: "left" | "right") => {
    const shown = m.roster.slice(0, 5);
    const size = shown.length > 4 ? 88 : shown.length > 3 ? 104 : 120;
    return col(
      { width: W / 2, height: H, padding: "30px 36px", justifyContent: "space-between", alignItems: end === "left" ? "flex-start" : "flex-end" },
      col(
        { alignItems: end === "left" ? "flex-start" : "flex-end", gap: 2 },
        box(
          { alignItems: "center", gap: 12, flexDirection: end === "left" ? "row" : "row-reverse" },
          text(clip(m.team, 16), { fontFamily: DISPLAY, fontWeight: 500, fontSize: 40, letterSpacing: "-0.03em", color: "#FFFFFF" }),
          v.final && lead === m && text("Winner", { padding: "4px 12px", borderRadius: 999, background: C.volt, color: C.ink, fontWeight: 600, fontSize: 18 }),
        ),
        text(tickPct(score), { fontFamily: DISPLAY, fontWeight: 500, fontSize: 84, lineHeight: 1, letterSpacing: "-0.04em", color: lead === m ? C.volt : "#FFFFFF" }),
      ),
      box(
        { alignItems: "flex-end", gap: 2, flexDirection: end === "left" ? "row" : "row-reverse" },
        shown.map((id) => mascot(base, L.stocks[id].meta.symbol, size, { captain: !v.final && id === m.captain })),
        m.roster.length > shown.length && text(`+${m.roster.length - shown.length}`, { color: C.sky, fontWeight: 600, fontSize: 24, padding: "0 8px 12px" }),
      ),
    );
  };
  const line = !v.final
    ? "Live scores, not final. When the week settles, the loser hands 10% of every share to the winner."
    : lead && trail
      ? `${clip(trail.team, 20)} hands 10% of every share to ${clip(lead.team, 20)}.`
      : "A tie. No shares move.";
  return col(
    { width: CARD.width, height: CARD.height, background: C.bg, padding: 44, justifyContent: "space-between", fontFamily: SANS },
    box(
      { justifyContent: "space-between", alignItems: "center" },
      brand(),
      box(
        { alignItems: "center", gap: 14 },
        text(`${clip(L.name, 26)} · Week ${v.week + 1} of ${L.config.seasonWeeks}`, { fontSize: 23, color: C.slate }),
        chip(v.final ? "Final" : "Live", v.final ? "cobalt" : "volt"),
      ),
    ),
    box(
      { position: "relative", width: W, height: H, borderRadius: 36, background: `linear-gradient(180deg, ${C.lit} 0%, ${C.cobalt} 40%)`, overflow: "hidden" },
      box({ position: "absolute", left: 22, top: 22, width: W - 44, height: H - 44, borderRadius: 16, border: PITCH_LINE }),
      box({ position: "absolute", left: W / 2 - 1, top: 22, width: 0, height: H - 44, borderLeft: PITCH_LINE }),
      box({ position: "absolute", left: W / 2 - 74, top: H / 2 - 74, width: 148, height: 148, borderRadius: 999, border: PITCH_LINE, alignItems: "center", justifyContent: "center", color: "#FFFFFF", fontFamily: DISPLAY, fontWeight: 500, fontSize: 34 }, "vs"),
      box({ position: "absolute", left: 0, top: 0, width: W, height: H }, side(v.a, v.scoreA, "left"), side(v.b, v.scoreB, "right")),
    ),
    box(
      { justifyContent: "space-between", alignItems: "center", gap: 24 },
      text(line, { flex: 1, fontFamily: DISPLAY, fontWeight: 500, fontSize: v.final ? 34 : 25, lineHeight: 1.2, letterSpacing: "-0.02em", color: C.ink }),
      text(SITE, { fontWeight: 600, fontSize: 21, color: C.ink }),
    ),
  );
}
