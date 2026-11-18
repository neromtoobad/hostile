import { type MouseEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, type MotionValue, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { exampleMatch, loadBoard, loadLeagues, PHASES, type BoardRow } from "../lib/league";
import { FACTORY, basescan } from "../lib/chain";
import { money, tickPct, usd } from "../lib/format";
import { StockIcon } from "../components/Stock";
import { MASCOTS, Mascot, moodOf, seatFace } from "../components/Mascot";
import { Reveal, at } from "../components/Reveal";
import { Arrow, CountUp, EASE, Marquee, STILL, Word, useShown } from "../components/Motion";

const STEPS = [
  { t: "Start a league", d: "Set the entry fee, how many friends, and how long the season runs. Then send the link." },
  { t: "Draft on the clock", d: "Take turns. Each pick buys that stock on Aerodrome the moment you choose it." },
  { t: "Play one rival a week", d: "Your stocks against theirs, scored on each pool's 30-minute average price. Your captain counts double." },
  { t: "Collect, or pay up", d: "The loser sends 10% of every share they hold to the winner's wallet." },
];

// The hero lineup: the biggest names on the board, each moving with its real 30-minute price change.
const LINEUP = ["META", "AAPL", "TSLA", "NVDA", "MSTR", "PLTR", "NFLX"];
const LINEUP_H = [112, 142, 172, 214, 172, 142, 112];
const CROWD = ["AMZN", "GOOGL", "HOOD", "MSTR", "NVDA", "SPCX", "BRK.B", "TTWO", "AMD"];

const JOIN = [
  { t: "Send the link", d: "Each league has its own page at /l/<address>." },
  { t: "Friends join with USDC", d: "Same entry for everyone, held by the league contract." },
  { t: "The draft opens", d: "Order is shuffled onchain, then every pick buys real shares." },
];

const ENTRY = 10; // the example entry used in the cards below, in USDC
const PICKS = 3;

type Match = ReturnType<typeof exampleMatch>;

export function Home() {
  const board = useQuery({ queryKey: ["board"], queryFn: loadBoard, refetchInterval: 30_000 });
  const leagues = useQuery({ queryKey: ["leagues"], queryFn: loadLeagues, refetchInterval: 20_000 });
  const rows = board.data?.rows ?? [];
  const match = rows.length ? exampleMatch(rows) : undefined;

  return (
    <>
      <Hero rows={rows} stockCount={board.data?.stockCount} leagueCount={board.data?.leagueCount} />
      <Showcase rows={rows} match={match} />
      <Roster rows={rows} />
      <Rules />

      {/* ───── leagues ───── */}
      <section id="leagues" className="sec">
        <div className="wrap">
          <Reveal className="panel-blue split stagger">
            <div className="split-copy on-blue">
              <span className="chip chip-on-blue rise">Leagues on Base</span>
              <h2 className="display-md rise" style={at(1)}>One link.<br />Your friends.<br />Real shares.</h2>
              <p className="rise" style={at(2)}>
                A league is its own contract on Base. Send the link, everyone joins with USDC, and the commissioner starts the draft.
                Nobody, including us, can move anyone's shares.
              </p>
              <Link className="btn btn-white btn-lg rise" style={at(3)} to="/new">Start a league <Arrow /></Link>
              <span className="on-blue-small rise" style={at(4)}>Not available to US persons.</span>
            </div>
            <div className="stack">
              {leagues.isLoading && <div className="stack-card rise" style={at(2)}><span className="muted">Loading leagues from the factory…</span></div>}
              {leagues.data?.length === 0 && (
                <div className="stack-card rise" style={at(2)}>
                  <Mascot symbol="HOOD" height={64} />
                  <div className="stack-body"><b>No leagues yet</b><span>Start the first one and send the link to three friends.</span></div>
                  <span className="stack-tag">Open</span>
                </div>
              )}
              {leagues.data?.slice(0, 5).map((l, i) => (
                <Link key={l.address} to={`/l/${l.address}`} className="stack-card rise" style={at(2 + i)}>
                  <Mascot symbol={seatFace(i)} height={64} />
                  <div className="stack-body">
                    <b>{l.name}</b>
                    <span>{l.managers}/{l.maxManagers} players · {usd(l.entryFee)} entry · {l.weeks} week{l.weeks === 1 ? "" : "s"}</span>
                  </div>
                  <span className={`phase phase-${l.phase}`}>{PHASES[l.phase]}</span>
                </Link>
              ))}
              {(leagues.data?.length ?? 0) < 3 &&
                JOIN.map((j, i) => (
                  <div key={j.t} className="stack-card stack-step rise" style={{ ...at(3 + i), marginLeft: `${(i + 1) * 22}px` }}>
                    <span className="stack-n">{i + 1}</span>
                    <div className="stack-body"><b>{j.t}</b><span>{j.d}</span></div>
                  </div>
                ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───── close ───── */}
      <section className="sec closer">
        <Reveal className="wrap closer-in stagger">
          <div className="closer-cast rise">
            {CROWD.map((sym, i) => (
              <span key={sym} className="wave" style={at(i)}>
                <Mascot symbol={sym} mood={i === 4 ? "champ" : "ready"} height={i === 4 ? 156 : 104} />
              </span>
            ))}
          </div>
          <h2 className="display rise" style={at(1)}>Pick a fight.</h2>
          <p className="lede rise" style={at(2)}>Up to 12 friends, any entry fee. A "week" can be as short as an hour, so a whole season fits in one evening.</p>
          <Link className="btn btn-primary btn-lg rise" style={at(3)} to="/new">Start a league <Arrow /></Link>
        </Reveal>
      </section>
    </>
  );
}

// ───────────── hero ─────────────

function Hero({ rows, stockCount, leagueCount }: { rows: BoardRow[]; stockCount?: number; leagueCount?: number }) {
  const still = useReducedMotion() || STILL;
  // The lineup leans a little toward the pointer; bigger (nearer) mascots move more.
  const pointer = useMotionValue(0);
  const lean = useSpring(pointer, { stiffness: 70, damping: 18 });
  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    pointer.set((e.clientX - box.left) / box.width - 0.5);
  };
  const fade = (delay: number) => ({
    initial: still ? (false as const) : { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: EASE, delay },
  });

  return (
    <section className="hero">
      <div className="wrap hero-copy">
        <motion.span className="chip chip-live" {...fade(0)}>
          <i />Live on Base · {stockCount ?? "…"} stocks to draft
        </motion.span>
        <h1 className="display hero-title">
          <span className="hero-line">
            <Word i={0}>Draft</Word> <Word i={1}>real</Word> <HeadChip sym="NVDA" i={2} /> <Word i={3}>stocks.</Word>
          </span>{" "}
          <span className="hero-line hero-take">
            <Word i={4}>Take</Word> <Word i={5}>their</Word> <HeadChip sym="AAPL" i={6} volt /> <Word i={7}>shares.</Word>
          </span>
        </h1>
        <motion.p className="lede" {...fade(0.55)}>
          Pick a team of real stocks with your friends. Face one of them each week. The loser hands 10% of their shares to the
          winner.
        </motion.p>
        <motion.div className="hero-cta" {...fade(0.65)}>
          <Link className="btn btn-primary btn-lg" to="/new">Start a league <Arrow /></Link>
          <a className="btn btn-ghost btn-lg" href="#how">See how it works</a>
        </motion.div>
      </div>

      <div className="wrap">
        <motion.div
          className="stage"
          onMouseMove={onMove}
          onMouseLeave={() => pointer.set(0)}
          initial={still ? false : { opacity: 0, y: 48, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, ease: EASE, delay: 0.35 }}
        >
          <div className="stage-cast" aria-label="Stock mascots, each moving with its live price">
            <span className="pitch" aria-hidden="true" />
            {LINEUP.map((sym, i) => (
              <Player key={sym} sym={sym} i={i} row={rows.find((x) => x.meta.symbol === sym)} lean={lean} still={!!still} />
            ))}
          </div>
          <div className="stage-stats">
            <div className="stat"><b>{stockCount === undefined ? "…" : <CountUp value={stockCount} />}</b><span>stocks you can draft</span></div>
            <div className="stat"><b>{leagueCount === undefined ? "…" : <CountUp value={leagueCount} />}</b><span>leagues on Base</span></div>
            <div className="stat"><b><CountUp value={10} />%</b><span>of the loser's shares, each week</span></div>
            <div className="stat"><b>0</b><span>admins who can touch your shares</span></div>
          </div>
        </motion.div>
      </div>

      {rows.length > 0 && (
        <Marquee seconds={60} className="ticker">
          {rows.map((r) => (
            <span className="tk" key={r.token}>
              <StockIcon meta={r.meta} size={20} />
              <b>{r.meta.symbol}</b>
              <span>{money(r.price)}</span>
              {r.move30 !== undefined && <em className={r.move30 >= 0 ? "up" : "down"}>{tickPct(r.move30)}</em>}
            </span>
          ))}
        </Marquee>
      )}
    </section>
  );
}

/** A mascot set inside the headline, like a word. */
function HeadChip({ sym, i, volt }: { sym: string; i: number; volt?: boolean }) {
  const still = useReducedMotion() || STILL;
  return (
    <motion.span
      className={`head-chip ${volt ? "volt" : ""}`}
      initial={still ? false : { scale: 0, rotate: -14 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 280, damping: 15, delay: 0.3 + i * 0.075 }}
    >
      <img src={`/mascots/${sym}.webp`} alt="" draggable={false} />
    </motion.span>
  );
}

function Player({ sym, i, row, lean, still }: { sym: string; i: number; row?: BoardRow; lean: MotionValue<number>; still: boolean }) {
  const h = LINEUP_H[i];
  const x = useTransform(lean, (v) => v * (h / 5));
  const fromCentre = Math.abs(i - 3);
  return (
    <motion.figure
      className={`player hp-${i}`}
      style={{ x }}
      initial={still ? false : { y: 80, opacity: 0, scale: 0.55 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 230, damping: 16, delay: 0.7 + fromCentre * 0.09 }}
    >
      <Mascot symbol={sym} mood={moodOf(row?.move30)} height={h} />
      <figcaption>
        <b>{sym}</b>
        {row?.move30 !== undefined && <span className={row.move30 >= 0 ? "up" : "down"}>{tickPct(row.move30)}</span>}
      </figcaption>
    </motion.figure>
  );
}

// ───────────── how a season plays ─────────────

function Showcase({ rows, match }: { rows: BoardRow[]; match?: Match }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ref, shown] = useShown<HTMLDivElement>("0px 0px -25% 0px");
  const nvda = rows.find((r) => r.meta.symbol === "NVDA");

  return (
    <section id="how" className="sec">
      <div ref={ref} className={`wrap how reveal stagger ${shown ? "in" : ""}`} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
        <div className="how-copy">
          <span className="chip rise">How a season plays</span>
          <h2 className="display-md rise" style={at(1)}>Every pick is<br />a real share.</h2>
          <ol className="steps rise" style={at(2)}>
            {STEPS.map((s, i) => (
              <li key={s.t} className={i === active ? "on" : ""}>
                <button type="button" onClick={() => setActive(i)} aria-expanded={i === active}>
                  <span className="step-n">{i + 1}</span>
                  <span className="step-body">
                    <b>{s.t}</b>
                    <span className="step-d"><span>{s.d}</span></span>
                  </span>
                </button>
                {i === active && (
                  <span
                    className="step-bar"
                    style={{ animationPlayState: paused || !shown ? "paused" : "running" }}
                    onAnimationEnd={() => setActive((i + 1) % STEPS.length)}
                  />
                )}
              </li>
            ))}
          </ol>
          <Link className="btn btn-primary rise" style={at(3)} to="/new">Start a league <Arrow /></Link>
        </div>

        <div className="how-stage rise" style={at(2)}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.98 }}
              transition={{ duration: 0.38, ease: EASE }}
            >
              {active === 0 && <SetupCard />}
              {active === 1 && <PickCard nvda={nvda} />}
              {active === 2 && <MatchCard rows={rows} match={match} />}
              {active === 3 && <SliceCard rows={rows} match={match} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

function SetupCard() {
  return (
    <div className="pcard">
      <div className="pcard-head">
        <div>
          <span className="pcard-sub">Example league</span>
          <b className="pcard-title">Friday Night Stocks</b>
        </div>
        <span className="pill-soft">Example</span>
      </div>
      <div className="setup-row">
        <span className="pcard-label">Entry, each</span>
        <div className="seg-demo">
          {["$5", "$10", "$25", "$50"].map((v) => <span key={v} className={v === `$${ENTRY}` ? "on" : ""}>{v}</span>)}
        </div>
      </div>
      <div className="setup-row">
        <span className="pcard-label">Friends</span>
        <div className="setup-seats">
          {[0, 1, 2, 3].map((i) => (
            <motion.span key={i} initial={{ scale: 0, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.15 + i * 0.08 }}>
              <Mascot symbol={seatFace(i)} height={60} />
            </motion.span>
          ))}
        </div>
      </div>
      <div className="setup-row">
        <span className="pcard-label">Season</span>
        <span className="setup-val">{PICKS} stocks each · 4 weeks</span>
      </div>
      <div className="pcard-foot"><span>You become the commissioner</span><Link to="/new">Set up yours →</Link></div>
    </div>
  );
}

function PickCard({ nvda }: { nvda?: BoardRow }) {
  const perPick = (ENTRY * 0.98) / PICKS;
  return (
    <div className="pcard">
      <div className="pcard-head">
        <span className="pcard-icon"><Mascot symbol="NVDA" mood={moodOf(nvda?.move30)} height={56} /></span>
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
          <span className="quote-arrow" aria-hidden="true"><i /></span>
          <b>{nvda?.price ? (perPick / nvda.price).toFixed(5) : "…"} NVDA</b>
        </div>
        <div className="quote-meta"><span>Least you'll accept</span><span>{nvda?.price ? ((perPick / nvda.price) * 0.97).toFixed(5) : "…"} NVDA</span></div>
        <div className="quote-meta"><span>Refused if</span><span>price is 1.5% off its 30-min average</span></div>
        <div className="quote-ok">✓ Bought in the same transaction as your pick</div>
      </div>
      <div className="pcard-foot"><span>Shares held by your league contract</span><span>2% of entries buys the prize</span></div>
    </div>
  );
}

function MatchCard({ rows, match }: { rows: BoardRow[]; match?: Match }) {
  const side = (name: string, team: BoardRow[], score: number, other: number) => (
    <div className={`mc-side ${score > other ? "lead" : ""}`}>
      <Mascot symbol={team[0].meta.symbol} mood={score === other ? "ready" : score > other ? "up" : "down"} height={104} />
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
          {side("Diamond Hands", match.a, match.scoreA, match.scoreB)}
          <span className="mc-vs">vs</span>
          {side("Bag Holders", match.b, match.scoreB, match.scoreA)}
        </div>
      )}
      <div className="pcard-foot"><span>Real price moves over the last 30 minutes</span><span>Scored like the contract: captain ×2</span></div>
    </div>
  );
}

/** Payday for the example matchup: the losing team's stocks fly across to the winner. */
function SliceCard({ rows, match }: { rows: BoardRow[]; match?: Match }) {
  if (!match) return <div className="pcard"><p className="muted">{rows.length ? "" : "Reading prices from Base…"}</p></div>;
  const aWins = match.scoreA >= match.scoreB;
  const win = aWins ? { name: "Diamond Hands", team: match.a } : { name: "Bag Holders", team: match.b };
  const lose = aWins ? { name: "Bag Holders", team: match.b } : { name: "Diamond Hands", team: match.a };
  return (
    <div className="pcard">
      <div className="pcard-head">
        <div>
          <span className="pcard-sub">Example payday</span>
          <b className="pcard-title">{lose.name} pay up</b>
        </div>
        <span className="pill-soft">Example teams</span>
      </div>
      <div className="slice">
        <div className="slice-side">
          <Mascot symbol={lose.team[0].meta.symbol} mood="down" height={104} />
          <span className="mc-name">{lose.name}</span>
        </div>
        <div className="slice-lane" aria-hidden="true">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M3 38 Q50 -8 97 38" /></svg>
          {lose.team.map((r, i) => (
            <span key={r.token} className="slice-coin" style={{ animationDelay: `${i * 0.8}s` }}>
              <span style={{ animationDelay: `${i * 0.8}s` }}><StockIcon meta={r.meta} size={28} /></span>
            </span>
          ))}
        </div>
        <div className="slice-side lead">
          <Mascot symbol={win.team[0].meta.symbol} mood="up" height={104} />
          <span className="mc-name">{win.name}</span>
        </div>
      </div>
      <div className="mc-stocks">
        {lose.team.map((r) => (
          <div key={r.token} className="mc-stock">
            <span className="stock-tag"><StockIcon meta={r.meta} size={18} /><b>{r.meta.symbol}</b></span>
            <span className="muted">10% of their shares</span>
            <span className="up">→ {win.name}</span>
          </div>
        ))}
      </div>
      <div className="pcard-foot"><span>One transaction, settled by anyone</span><span>Lands in the winner's wallet</span></div>
    </div>
  );
}

// ───────────── the players ─────────────

function Roster({ rows }: { rows: BoardRow[] }) {
  // Before prices arrive, show the mascots without numbers.
  const list: { key: string; symbol: string; name: string; row?: BoardRow }[] = rows.length
    ? rows.map((r) => ({ key: r.token, symbol: r.meta.symbol, name: r.meta.name, row: r }))
    : MASCOTS.map((s) => ({ key: s, symbol: s, name: "" }));
  const half = Math.ceil(list.length / 2);
  const card = (p: (typeof list)[number]) => (
    <div className="pc" key={p.key}>
      <div className="pc-stage"><Mascot symbol={p.symbol} mood={moodOf(p.row?.move30)} height={124} /></div>
      <div className="pc-row">
        <b>{p.symbol}</b>
        {p.row?.move30 !== undefined && <em className={p.row.move30 >= 0 ? "up" : "down"}>{tickPct(p.row.move30)}</em>}
      </div>
      <span className="pc-name">{p.name || " "}</span>
      <span className="pc-price">{p.row ? money(p.row.price) : "…"}</span>
    </div>
  );
  return (
    <section className="sec">
      <div className="wrap">
        <Reveal className="panel-soft roster stagger">
          <div className="sec-head center rise">
            <span className="chip chip-white">The players</span>
            <h2 className="display-md">Every stock is a player.</h2>
            <p className="lede">
              {rows.length ? `${rows.length} stocks` : "Stocks"} to draft, each with its own mascot and its live price from Aerodrome. Your
              team plays as your captain, and it cheers or sulks with your score.
            </p>
          </div>
          <Marquee seconds={80} className="roster-row rise">{list.slice(0, half).map(card)}</Marquee>
          <Marquee seconds={80} reverse className="roster-row rise">{list.slice(half).map(card)}</Marquee>
        </Reveal>
      </div>
    </section>
  );
}

// ───────────── the rules ─────────────

function Rules() {
  return (
    <section className="sec">
      <Reveal className="wrap stagger">
        <div className="sec-head rise">
          <span className="chip">The rules</span>
          <h2 className="display-md">No way to cheat.<br />No one to trust.</h2>
        </div>
        <div className="bento">
          <article className="b b-wide rise" style={at(1)}>
            <div className="b-copy">
              <h3>Scores come from the pool's own price history</h3>
              <p>Each stock is scored on its 30-minute average price at the exact end of the week. Nobody can push a price at the last second to steal a week.</p>
            </div>
            <Spark />
          </article>
          <article className="b b-blue rise" style={at(2)}>
            <span className="b-num">×2</span>
            <div className="b-copy">
              <h3>Your captain counts double</h3>
              <p>A new captain only counts from next week, so nobody can switch after seeing the prices.</p>
            </div>
            <span className="b-fig"><Mascot symbol="NVDA" mood="up" height={132} /><span className="captain-mark">C</span></span>
          </article>
          <article className="b rise" style={at(2)}>
            <span className="b-num"><CountUp value={10} />%</span>
            <div className="b-copy">
              <h3>A lost week costs 10% of everything</h3>
              <p>Of every share you hold, not just one stock. It goes straight to the winner's wallet.</p>
            </div>
          </article>
          <article className="b rise" style={at(3)}>
            <span className="b-fig b-fig-top"><Mascot symbol="MSTR" mood="champ" height={104} /></span>
            <div className="b-copy">
              <h3>The champion takes the pot</h3>
              <p>2% of every entry buys a stock that goes to the season's winner.</p>
            </div>
          </article>
          <article className="b b-ink rise" style={at(4)}>
            <span className="b-num">0</span>
            <div className="b-copy">
              <h3>Admins who can touch your shares</h3>
              <p>A league is its own contract. Nobody, including us, can move, pause or price anything.</p>
              <a href={basescan("address", FACTORY)} target="_blank" rel="noreferrer">Read the contract ↗</a>
            </div>
          </article>
        </div>
      </Reveal>
    </section>
  );
}

/** A drawing of why the average matters: the spike at the end doesn't move the score. */
function Spark() {
  return (
    <figure className="spark">
      <svg viewBox="0 0 600 190" preserveAspectRatio="none" aria-hidden="true">
        <rect className="spark-window" x="452" y="0" width="148" height="190" rx="14" />
        <line className="spark-avg" x1="452" y1="100" x2="600" y2="100" />
      </svg>
      <svg className="spark-draw" viewBox="0 0 600 190" preserveAspectRatio="none" aria-hidden="true">
        <path className="spark-line" d="M0 150 C40 142 62 118 92 124 S150 160 190 140 S262 88 300 100 S372 132 410 112 S444 96 462 100 L490 97 512 104 538 98 560 102 578 99 590 40 599 34" />
      </svg>
      <span className="spark-tag spark-tag-avg">30-minute average: what counts</span>
      <span className="spark-tag spark-tag-push">last-second push</span>
      <figcaption>Illustration, not live data</figcaption>
    </figure>
  );
}
