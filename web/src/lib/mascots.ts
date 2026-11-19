/** Which stocks have a mascot, and which face a team plays as. No React here, so the share-card
 *  function can use the same rules as the app. */
import type { LeagueState, Manager } from "./leagueRead";

export const MASCOTS = [
  "AAOI", "AAPL", "AMD", "AMZN", "AVGO", "BE", "BRK.B", "CRCL", "GOOGL", "HIMS", "HOOD", "INTC", "LITE", "LLY",
  "META", "MRNA", "MRVL", "MSFT", "MSTR", "MU", "NFLX", "NVDA", "ORCL", "PLTR", "SNDK", "SPCX", "TSLA", "TTWO",
] as const;
const HAS = new Set<string>(MASCOTS);
export const hasMascot = (symbol: string) => HAS.has(symbol);

/** Faces for seats that haven't drafted yet, so an empty lobby still has a lineup. */
const SEAT_FACES = ["NVDA", "TSLA", "AAPL", "MSTR", "PLTR", "AMZN", "META", "NFLX", "SPCX", "GOOGL", "HOOD", "MSFT"];
export const seatFace = (seat: number) => SEAT_FACES[seat % SEAT_FACES.length];

/** A team plays as its captain. Before the draft, it uses its seat's face. */
export const teamFace = (L: LeagueState, m: Manager) => (m.roster.length ? L.stocks[m.captain]?.meta.symbol : undefined) ?? seatFace(m.seat);

/** Rows of players for a squad of n, at most four across. Fewer up front, like a real line-up. */
export function formation(n: number): number[] {
  if (n <= 4) return [n];
  const rows = Math.ceil(n / 4);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return [...Array(rows).keys()].map((r) => base + (r >= rows - extra ? 1 : 0));
}
