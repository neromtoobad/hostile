import { useState } from "react";
import type { Meta } from "../lib/league";

export function StockIcon({ meta, size = 28 }: { meta: Meta; size?: number }) {
  // The icons are hosted by Coinbase; if that host is down, show the letter badge instead.
  const [broken, setBroken] = useState(false);
  return meta.icon && !broken ? (
    <img className="stock-icon" src={meta.icon} alt="" width={size} height={size} loading="lazy" onError={() => setBroken(true)} />
  ) : (
    <span className="stock-icon stock-icon-fallback" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>{meta.symbol[0]}</span>
  );
}

export function StockTag({ meta, captain }: { meta: Meta; captain?: boolean }) {
  return (
    <span className="stock-tag">
      <StockIcon meta={meta} size={20} />
      <b>{meta.symbol}</b>
      {captain && <span className="captain-mark" title="Captain: counts double">C</span>}
    </span>
  );
}

export function Countdown({ to, now }: { to: number; now: number }) {
  const left = to - now;
  if (left <= 0) return <span className="countdown done">time's up</span>;
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  const parts = d ? `${d}d ${h}h ${m}m` : h ? `${h}h ${m}m ${s}s` : `${m}:${String(s).padStart(2, "0")}`;
  return <span className="countdown">{parts}</span>;
}
