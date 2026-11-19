/** Share on X. Posting a league link makes X show a picture of the league (the share card), which
 *  /api/og draws from the league's on-chain state. This button opens a small sheet that shows that
 *  same picture first, then hands the words and the link to X. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type ShareTarget = {
  league: string;
  /** Which card: the league itself (default), one manager's squad, or one match. */
  card?: "team" | "match";
  seat?: number;
  /** A settled week (0-based) for a final result; leave out for this week's live match. */
  week?: number;
  /** Changes whenever the league's state does, so X fetches a fresh picture instead of an old one. */
  v: string;
  /** The words of the post. The link is added after them. */
  text: string;
};

export function shareUrls(t: ShareTarget) {
  const q = new URLSearchParams();
  if (t.card) q.set("card", t.card);
  if (t.seat !== undefined) q.set("seat", String(t.seat));
  if (t.week !== undefined) q.set("week", String(t.week));
  q.set("v", t.v);
  const page = `${window.location.origin}/l/${t.league}?${q}`;
  return {
    page,
    image: `/api/og?league=${t.league}&${q}`,
    post: `https://x.com/intent/post?text=${encodeURIComponent(t.text)}&url=${encodeURIComponent(page)}`,
  };
}

export function ShareButton({ target, label = "Share on X", className = "btn btn-ghost btn-sm" }: { target: ShareTarget; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>{label}</button>
      {open && <ShareSheet target={target} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareSheet({ target, onClose }: { target: ShareTarget; onClose: () => void }) {
  const u = shareUrls(target);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="share-veil" onClick={onClose}>
      <div className="share-sheet" role="dialog" aria-modal="true" aria-label="Share on X" onClick={(e) => e.stopPropagation()}>
        <div className="share-top">
          <b>Share on X</b>
          <button type="button" className="pp-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={`share-card ${state}`}>
          {state !== "missing" && <img src={u.image} alt="The picture X will show with your post" onLoad={() => setState("ready")} onError={() => setState("missing")} />}
          {state === "loading" && <span className="muted">Drawing the card from the league's state on Base…</span>}
          {state === "missing" && <span className="muted">The picture could not be drawn right now. The link still works.</span>}
        </div>
        <p className="share-text">{target.text}</p>
        <p className="muted small">X shows this picture under your post. It is drawn from the league's contract when X asks for it, so it can be a few minutes behind.</p>
        <div className="share-actions">
          <a className="btn btn-primary" href={u.post} target="_blank" rel="noreferrer">Post on X</a>
          <button
            type="button" className="btn btn-ghost"
            onClick={() => navigator.clipboard.writeText(u.page).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })}
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
