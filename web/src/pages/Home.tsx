import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { loadLeagues, PHASES } from "../lib/league";
import { usd } from "../lib/format";

const STEPS = [
  { n: "1", t: "Start a league", d: "Pick the entry fee, how many friends, and how long the season runs. Share the link." },
  { n: "2", t: "Draft real stocks", d: "Take turns picking. Every pick buys that stock on Base right away. Nobody else can own it." },
  { n: "3", t: "Play every week", d: "You face one friend a week. Whoever's stocks rose more wins. Your captain counts double." },
  { n: "4", t: "Loser pays in shares", d: "The loser sends 10% of every share they hold to the winner's wallet. At the end you keep your stocks." },
];

export function Home() {
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: loadLeagues, refetchInterval: 20_000 });
  return (
    <>
      <section className="hero">
        <h1 className="display">Draft real stocks with friends.<br />Win their shares.</h1>
        <p className="lede">
          A fantasy league where every pick is a real share you own. Each week you play one friend, and the loser hands
          10% of their shares to the winner.
        </p>
        <div className="hero-cta">
          <Link className="btn btn-primary btn-lg" to="/new">Start a league</Link>
          <a className="btn btn-ghost btn-lg" href="#leagues">See open leagues</a>
        </div>
      </section>

      <section className="steps">
        {STEPS.map((s) => (
          <div className="step" key={s.n}>
            <span className="step-n">{s.n}</span>
            <h3>{s.t}</h3>
            <p>{s.d}</p>
          </div>
        ))}
      </section>

      <section id="leagues" className="block">
        <div className="block-head">
          <h2 className="display-sm">Leagues on Base</h2>
          <span className="muted">Read live from the league factory</span>
        </div>
        {leagues.isLoading && <p className="muted">Loading leagues…</p>}
        {leagues.error && <p className="tx-error">Could not reach Base: {(leagues.error as Error).message}</p>}
        {leagues.data && leagues.data.length === 0 && (
          <div className="empty">
            <p>No leagues yet. Be the first:</p>
            <Link className="btn btn-primary" to="/new">Start a league</Link>
          </div>
        )}
        <div className="league-list">
          {leagues.data?.map((l) => (
            <Link key={l.address} to={`/l/${l.address}`} className="league-row">
              <span className="league-row-name">{l.name}</span>
              <span className={`phase phase-${l.phase}`}>{PHASES[l.phase]}</span>
              <span className="muted">{l.managers}/{l.maxManagers} players</span>
              <span className="muted">{usd(l.entryFee)} entry</span>
              <span className="muted">{l.weeks} week{l.weeks === 1 ? "" : "s"}</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
