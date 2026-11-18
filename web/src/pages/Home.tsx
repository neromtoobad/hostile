import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { loadBoard, loadLeagues, PHASES } from "../lib/league";
import { money, usd } from "../lib/format";
import { StockIcon } from "../components/Stock";
import { CAST, Manager, type Pose } from "../components/Cast";

const STEPS = [
  { t: "Start a league", d: "Set the entry fee, the number of friends and how long the season runs. Share the link." },
  { t: "Draft real stocks", d: "Take turns picking. Each pick buys that stock on Base right away, and nobody else in the league can own it." },
  { t: "Play one friend a week", d: "Whoever's stocks rose more wins the week. Your captain counts double." },
  { t: "Loser pays in shares", d: "The loser sends 10% of every share they hold to the winner's wallet. At the end you keep what's left." },
];

const ROLES: { pose: Pose; t: string; d: string }[] = [
  { pose: "ready", t: "Draft day", d: "Before a week is scored, your manager waits on the clock." },
  { pose: "up", t: "Leading the week", d: "Your stocks are up more than your rival's on the 30-minute average price." },
  { pose: "down", t: "Paying up", d: "You're behind. If it ends like this, 10% of your shares change hands." },
  { pose: "champ", t: "Champion", d: "Most wins at the end. You take the treasury the 2% rake bought." },
];

export function Home() {
  const board = useQuery({ queryKey: ["board"], queryFn: loadBoard, refetchInterval: 30_000 });
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: loadLeagues, refetchInterval: 20_000 });

  return (
    <>
      <section className="hero wrap">
        <span className="kicker">Fantasy stock league · on Base</span>
        <h1 className="display hero-title">
          Draft real stocks.
          <br />
          <span className="hero-take">Take their shares.</span>
        </h1>
        <p className="lede">
          Play a season with friends where every pick is a real stock you own. Each week you face one of them, and the loser
          hands 10% of their shares to the winner.
        </p>
        <div className="hero-cta">
          <Link className="btn btn-primary btn-lg" to="/new">Start a league</Link>
          <a className="btn btn-ghost btn-lg" href="#leagues">Join one</a>
        </div>
      </section>

      <div className="hero-art wrap">
        <img src="/cast/hero.webp" alt="Four rival managers squaring up over a share" />
      </div>

      <section className="band band-stats">
        <div className="wrap stats">
          <div className="stat">
            <b>{board.data?.stockCount ?? "…"}</b>
            <span>stocks you can draft</span>
          </div>
          <div className="stat">
            <b>{board.data?.leagueCount ?? "…"}</b>
            <span>leagues on Base</span>
          </div>
          <div className="stat">
            <b>10%</b>
            <span>of the loser's shares, every week</span>
          </div>
          <div className="stat">
            <b>2%</b>
            <span>of entries buys the champion's prize</span>
          </div>
        </div>
      </section>

      <section className="wrap split">
        <div className="split-copy">
          <span className="kicker">How a season works</span>
          <h2 className="display-md">Your picks are real. So are their losses.</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <span className="step-n">0{i + 1}</span>
                <div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
          <Link className="btn btn-primary" to="/new">Start a league →</Link>
        </div>

        <div className="board-card">
          <div className="board-card-head">
            <div>
              <span className="kicker">Draft board</span>
              <h3>What you can pick right now</h3>
            </div>
            <span className="live"><i />Live from Aerodrome</span>
          </div>
          {board.isLoading && <p className="muted">Reading prices from Base…</p>}
          {board.error && <p className="tx-error">Could not reach Base right now.</p>}
          <div className="board-rows">
            {board.data?.rows.slice(0, 8).map((r) => (
              <div className="board-row" key={r.token}>
                <StockIcon meta={r.meta} size={30} />
                <div className="board-row-name">
                  <b>{r.meta.symbol}</b>
                  <span>{r.meta.name}</span>
                </div>
                <span className="board-row-price">{money(r.price)}</span>
              </div>
            ))}
          </div>
          {board.data && <p className="board-foot">+{board.data.rows.length - 8} more · prices are each pool's current price on Base</p>}
        </div>
      </section>

      <section className="soft">
        <div className="wrap">
          <span className="kicker">The rivals</span>
          <h2 className="display-md">Your manager feels every tick.</h2>
          <p className="lede">
            Everyone in a league gets one of four managers. Their pose isn't decoration: it follows your real score against
            this week's rival.
          </p>
          <div className="roles">
            {ROLES.map((r, i) => (
              <div className="role" key={r.pose}>
                <div className="role-stage">
                  <Manager seat={i} pose={r.pose} height={190} />
                </div>
                <span className="role-name">{CAST[i]}</span>
                <h3>{r.t}</h3>
                <p>{r.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="leagues" className="band band-leagues">
        <div className="wrap">
          <div className="band-head">
            <div>
              <span className="kicker kicker-on-blue">Leagues on Base</span>
              <h2 className="display-md">Pick a fight.</h2>
            </div>
            <Link className="btn btn-white" to="/new">Start your own</Link>
          </div>
          {leagues.isLoading && <p className="on-blue-muted">Loading leagues from the factory…</p>}
          {leagues.error && <p className="on-blue-muted">Could not reach Base: {(leagues.error as Error).message}</p>}
          {leagues.data && leagues.data.length === 0 && (
            <div className="empty-blue">
              <Manager seat={3} pose="ready" height={120} />
              <div>
                <h3>No leagues yet.</h3>
                <p>Start the first one and send the link to three friends.</p>
              </div>
            </div>
          )}
          <div className="league-list">
            {leagues.data?.map((l, i) => (
              <Link key={l.address} to={`/l/${l.address}`} className="league-row">
                <Manager seat={i} pose="ready" height={56} />
                <span className="league-row-name">{l.name}</span>
                <span className={`phase phase-${l.phase}`}>{PHASES[l.phase]}</span>
                <span className="league-row-meta">{l.managers}/{l.maxManagers} players</span>
                <span className="league-row-meta">{usd(l.entryFee)} entry</span>
                <span className="league-row-go">Open →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
