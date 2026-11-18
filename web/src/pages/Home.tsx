import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { exampleMatch, loadBoard, loadLeagues, PHASES, type BoardRow } from "../lib/league";
import { money, tickPct, usd } from "../lib/format";
import { StockIcon } from "../components/Stock";
import { CAST, Manager, type Pose } from "../components/Cast";
import { Reveal } from "../components/Reveal";

const STEPS = [
  { t: "Start a league", d: "Set the entry fee, how many friends, and how long the season runs." },
  { t: "Draft on the clock", d: "Take turns. Each pick buys that stock on Aerodrome the moment you choose it." },
  { t: "Play one rival a week", d: "Your stocks against theirs, scored on each pool's 30-minute average price." },
  { t: "Collect, or pay up", d: "The loser sends 10% of every share they hold to the winner's wallet." },
];

const DAYS: { seat: number; pose: Pose; t: string; d: string }[] = [
  { seat: 0, pose: "ready", t: "Draft day", d: "Everyone joins with the same entry. The draft order is shuffled onchain, then the clock starts." },
  { seat: 1, pose: "up", t: "Matchday", d: "All week, your manager reacts to the live score. Your captain counts double." },
  { seat: 2, pose: "down", t: "Payday", d: "When the week ends, anyone can settle it. Shares move to the winner's wallet in that transaction." },
];

const JOIN = [
  { t: "Send the link", d: "Each league has its own page at /l/<address>." },
  { t: "Friends join with USDC", d: "Same entry for everyone, held by the league contract." },
  { t: "The draft opens", d: "Order is shuffled onchain, then every pick buys real shares." },
];

const ENTRY = 10; // the example entry used in the cards below, in USDC
const PICKS = 3;

export function Home() {
  const board = useQuery({ queryKey: ["board"], queryFn: loadBoard, refetchInterval: 30_000 });
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: loadLeagues, refetchInterval: 20_000 });
  const rows = board.data?.rows ?? [];
  const nvda = rows.find((r) => r.meta.symbol === "NVDA");
  const perPick = (ENTRY * 0.98) / PICKS;
  const match = rows.length ? exampleMatch(rows) : undefined;

  return (
    <>
      {/* ───── hero ───── */}
      <section className="hero wrap">
        <span className="kicker">Fantasy stock league on Base</span>
        <h1 className="display hero-title">
          Draft real stocks.
          <br />
          <span className="hero-take">Take their shares.</span>
        </h1>
        <p className="lede">
          Pick a team of real stocks with your friends. Face one of them each week. The loser hands 10% of their shares to the
          winner.
        </p>
        <div className="hero-cta">
          <Link className="btn btn-primary btn-lg" to="/new">Start a league →</Link>
          <a className="btn btn-ghost btn-lg" href="#leagues">See leagues</a>
        </div>
      </section>

      <div className="hero-art wrap">
        <img src="/cast/hero.webp" alt="Four rival managers squaring up over a share" />
      </div>

      <section className="band band-stats">
        <div className="wrap stats">
          <div className="stat"><b>{board.data?.stockCount ?? "…"}</b><span>stocks you can draft</span></div>
          <div className="stat"><b>{board.data?.leagueCount ?? "…"}</b><span>leagues on Base</span></div>
          <div className="stat"><b>10%</b><span>of the loser's shares, each week</span></div>
          <div className="stat"><b>0</b><span>admins who can touch your shares</span></div>
        </div>
      </section>

      {/* ───── draft ───── */}
      <section className="sec sec-white">
        <Reveal className="wrap split">
          <div className="split-copy">
            <span className="kicker">The draft · real buys</span>
            <h2 className="display-md">Every pick is a real share.</h2>
            <p className="lede">
              When it's your turn, you pick a stock and the league contract buys it on Aerodrome with your entry. It's held for
              you all season, and it goes to your wallet at the end.
            </p>
            <ol className="steps">
              {STEPS.map((s, i) => (
                <li key={s.t}>
                  <span className="step-n">0{i + 1}</span>
                  <div><h3>{s.t}</h3><p>{s.d}</p></div>
                </li>
              ))}
            </ol>
            <Link className="btn btn-primary" to="/new">Start a league →</Link>
          </div>

          <div className="pcard">
            <div className="pcard-head">
              <span className="pcard-icon"><StockIcon meta={nvda?.meta ?? { symbol: "N", name: "" }} size={40} /></span>
              <div>
                <span className="pcard-sub">NVIDIA</span>
                <b className="pcard-title">NVDA</b>
              </div>
              <span className="live"><i />Live</span>
            </div>
            <div className="pcard-row">
              <div>
                <span className="pcard-label">Price on Aerodrome now</span>
                <span className="pcard-note">Read from the pool, not a quote</span>
              </div>
              <b className="pcard-big">{money(nvda?.price)}</b>
            </div>
            <span className="pcard-label">Example pick in a ${ENTRY}, {PICKS}-stock league</span>
            <div className="quote">
              <div className="quote-line">
                <span>{money(perPick)} USDC</span>
                <span className="quote-arrow">→</span>
                <b>{nvda?.price ? (perPick / nvda.price).toFixed(5) : "…"} NVDA</b>
              </div>
              <div className="quote-meta"><span>Least you'll accept</span><span>{nvda?.price ? ((perPick / nvda.price) * 0.97).toFixed(5) : "…"} NVDA</span></div>
              <div className="quote-meta"><span>Refused if</span><span>price is 1.5% off its 30-min average</span></div>
              <div className="quote-ok">✓ Bought in the same transaction as your pick</div>
            </div>
            <div className="pcard-foot"><span>Shares held by your league contract</span><span>2% of entries buys the prize</span></div>
          </div>
        </Reveal>
      </section>

      {/* ───── three days ───── */}
      <section className="sec sec-soft">
        <Reveal className="wrap">
          <div className="sec-head">
            <span className="kicker">A season · three kinds of day</span>
            <h2 className="display-md">Draft. Play the week.<br />Settle up.</h2>
            <p className="lede">Each friend gets one of four rival managers, and their mood follows your real score.</p>
          </div>
          <div className="days">
            {DAYS.map((d) => (
              <div className="day" key={d.t}>
                <div className="day-stage"><Manager seat={d.seat} pose={d.pose} height={200} /></div>
                <span className="role-name">{CAST[d.seat]}</span>
                <h3>{d.t}</h3>
                <p>{d.d}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ───── matchup ───── */}
      <section className="sec sec-white">
        <Reveal className="wrap split split-rev">
          <MatchCard rows={rows} match={match} />
          <div className="split-copy">
            <span className="kicker">The week · head to head</span>
            <h2 className="display-md">Win the week.<br />Take 10%.</h2>
            <p className="lede">
              Scores are each stock's move from the start of the week, read from the pool's own price history. Nobody can push a
              price at the last second to steal a week.
            </p>
            <ul className="ticks">
              <li>Captain counts double, and a new captain only counts from next week</li>
              <li>A lost week sends 10% of every share you hold, not just one stock</li>
              <li>The champion also takes the treasury the 2% rake bought</li>
            </ul>
          </div>
        </Reveal>
      </section>

      {/* ───── leagues ───── */}
      <section id="leagues" className="band band-leagues">
        <Reveal className="wrap split">
          <div className="split-copy on-blue">
            <h2 className="display-md">One link.<br />Your friends.<br />Real shares.</h2>
            <p>
              A league is its own contract on Base. Send the link, everyone joins with USDC, and the commissioner starts the draft.
              Nobody, including us, can move anyone's shares.
            </p>
            <Link className="btn btn-white" to="/new">Start a league →</Link>
            <span className="on-blue-small">Not available to US persons.</span>
          </div>
          <div className="stack">
            {leagues.isLoading && <div className="stack-card"><span className="muted">Loading leagues from the factory…</span></div>}
            {leagues.data?.length === 0 && (
              <div className="stack-card">
                <Manager seat={3} pose="ready" height={64} />
                <div className="stack-body"><b>No leagues yet</b><span>Start the first one and send the link to three friends.</span></div>
                <span className="stack-tag">Open</span>
              </div>
            )}
            {leagues.data?.slice(0, 5).map((l, i) => (
              <Link key={l.address} to={`/l/${l.address}`} className="stack-card">
                <Manager seat={i} pose="ready" height={64} />
                <div className="stack-body">
                  <b>{l.name}</b>
                  <span>{l.managers}/{l.maxManagers} players · {usd(l.entryFee)} entry · {l.weeks} week{l.weeks === 1 ? "" : "s"}</span>
                </div>
                <span className={`phase phase-${l.phase}`}>{PHASES[l.phase]}</span>
              </Link>
            ))}
            {(leagues.data?.length ?? 0) < 3 &&
              JOIN.map((j, i) => (
                <div key={j.t} className="stack-card stack-step" style={{ marginLeft: `${(i + 1) * 22}px` }}>
                  <span className="stack-n">{i + 1}</span>
                  <div className="stack-body"><b>{j.t}</b><span>{j.d}</span></div>
                </div>
              ))}
          </div>
        </Reveal>
      </section>

      {/* ───── close ───── */}
      <section className="sec sec-white closer">
        <Reveal className="wrap closer-in">
          <div className="closer-cast">
            {[0, 1, 2, 3].map((i) => <Manager key={i} seat={i} pose={i === 3 ? "champ" : "ready"} height={140} />)}
          </div>
          <h2 className="display-md">Pick a fight.</h2>
          <p className="lede">Up to 12 friends, any entry fee. A "week" can be as short as an hour, so a whole season fits in one evening.</p>
          <Link className="btn btn-primary btn-lg" to="/new">Start a league →</Link>
        </Reveal>
      </section>
    </>
  );
}

function MatchCard({ rows, match }: { rows: BoardRow[]; match?: ReturnType<typeof exampleMatch> }) {
  const side = (name: string, seat: number, team: BoardRow[], score: number, other: number) => (
    <div className={`mc-side ${score > other ? "lead" : ""}`}>
      <Manager seat={seat} pose={score === other ? "ready" : score > other ? "up" : "down"} height={110} />
      <span className="mc-name">{name}</span>
      <b className={`mc-score ${score >= 0 ? "up" : "down"}`}>{tickPct(score)}</b>
      <div className="mc-stocks">
        {team.map((r, i) => (
          <div key={r.token} className="mc-stock">
            <span className="stock-tag"><StockIcon meta={r.meta} size={18} /><b>{r.meta.symbol}</b>{i === 0 && <span className="captain-mark">C</span>}</span>
            <span className={(r.move30 ?? 0) >= 0 ? "up" : "down"}>{tickPct(r.move30 ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <div className="pcard">
      <div className="pcard-head">
        <div>
          <span className="pcard-sub">Example matchup</span>
          <b className="pcard-title">Diamond Hands vs Bag Holders</b>
        </div>
        <span className="pill-soft">Example teams</span>
      </div>
      {!match && <p className="muted">{rows.length ? "" : "Reading prices from Base…"}</p>}
      {match && (
        <div className="mc">
          {side("Diamond Hands", 0, match.a, match.scoreA, match.scoreB)}
          <span className="mc-vs">vs</span>
          {side("Bag Holders", 3, match.b, match.scoreB, match.scoreA)}
        </div>
      )}
      <div className="pcard-foot"><span>Real price moves over the last 30 minutes</span><span>Scored like the contract: captain ×2</span></div>
    </div>
  );
}
