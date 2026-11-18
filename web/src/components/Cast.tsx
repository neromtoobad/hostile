/** The four rival managers (Higgsfield 3D renders, see public/cast/CREDITS.md).
 *  Seat n plays as manager n % 4, and the pose always follows real league state. */
export type Pose = "ready" | "up" | "down" | "champ";

export const CAST = ["The Suit", "The Hype", "The Analyst", "The Underdog"] as const;

export function Manager({ seat, pose = "ready", height = 120, className = "" }: { seat: number; pose?: Pose; height?: number; className?: string }) {
  return (
    <img
      className={`manager ${className}`}
      src={`/cast/${seat % 4}-${pose}.webp`}
      alt=""
      height={height}
      style={{ height }}
      draggable={false}
    />
  );
}

/** Pose for a manager in this week's matchup, from the live TWAP estimate. */
export const poseFor = (mine: number, theirs?: number): Pose =>
  theirs === undefined || mine === theirs ? "ready" : mine > theirs ? "up" : "down";
