import { formatUnits } from "viem";

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export const usd = (raw: bigint, decimals = 6) => {
  const n = Number(formatUnits(raw, decimals));
  return n >= 100 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;
};

export const money = (n?: number) =>
  n === undefined || !Number.isFinite(n) ? "—" : n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;

export const shares = (raw: bigint) => {
  const n = Number(formatUnits(raw, 8));
  return n >= 1 ? n.toFixed(3) : n.toFixed(5);
};

/** A score in ticks: +100 ticks is about +1%. Shown as a percent move. */
export const tickPct = (ticks: number) => {
  const pct = (Math.pow(1.0001, ticks) - 1) * 100;
  const s = Math.abs(pct) < 10 ? pct.toFixed(2) : pct.toFixed(1);
  return `${pct >= 0 ? "+" : ""}${s}%`;
};

export const duration = (seconds: number) => {
  if (seconds <= 0) return "0s";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
};

export const weekLengthLabel = (s: number) => (s % 604800 === 0 ? `${s / 604800} week` : s % 86400 === 0 ? `${s / 86400} day` : `${s / 3600} hour`) + (s === 604800 || s === 86400 || s === 3600 ? "" : "s");
