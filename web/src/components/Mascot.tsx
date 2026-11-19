/** Every stock you can draft is a player with its own 3D mascot (Higgsfield renders, see
 *  public/mascots/CREDITS.md). The mood always comes from real prices: a mascot hops when its
 *  side is ahead, sulks when it's behind, and wears the crown when its team wins the season. */
import { hasMascot } from "../lib/mascots";

export type Mood = "ready" | "up" | "down" | "champ";

export { MASCOTS, seatFace, teamFace } from "../lib/mascots";

/** Mood for one side of a matchup, from the live score estimate. */
export const moodFor = (mine: number, theirs?: number): Mood =>
  theirs === undefined || mine === theirs ? "ready" : mine > theirs ? "up" : "down";

/** Mood for a single stock, from its own price move. */
export const moodOf = (move?: number): Mood => (move === undefined || move === 0 ? "ready" : move > 0 ? "up" : "down");

export function Mascot({ symbol, mood = "ready", height = 120, className = "" }: { symbol: string; mood?: Mood; height?: number; className?: string }) {
  if (!hasMascot(symbol)) {
    return (
      <span className={`mascot mascot-missing ${className}`} style={{ width: height, height }}>
        <span style={{ fontSize: height * 0.3 }}>{symbol.slice(0, 4)}</span>
      </span>
    );
  }
  return (
    <span className={`mascot mood-${mood} ${className}`} style={{ width: height, height }}>
      {mood === "champ" && <Crown />}
      <img src={`/mascots/${symbol}.webp`} alt={symbol} draggable={false} />
    </span>
  );
}

function Crown() {
  return (
    <svg className="mascot-crown" viewBox="0 0 64 44" aria-hidden="true">
      <path d="M4 16 L18 28 L32 4 L46 28 L60 16 L54 40 H10 Z" fill="#FFC53D" stroke="#B7791F" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="32" cy="27" r="4.5" fill="#2F55FF" />
      <circle cx="17" cy="33" r="3" fill="#FF5A5F" />
      <circle cx="47" cy="33" r="3" fill="#FF5A5F" />
    </svg>
  );
}
