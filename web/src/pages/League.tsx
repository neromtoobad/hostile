import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useReadContract } from "wagmi";
import { type Address, erc20Abi, getAddress, isAddress } from "viem";
import { LeagueAbi } from "../abi/League";
import { LeagueCoinsAbi } from "../abi/LeagueCoins";
import { COINS, STONKS_COIN_URL, USDC, basescan } from "../lib/chain";
import { type Activity, type LeagueState, type Manager, type Stock, PHASES, loadActivity, loadLeague, sameAddr, withQueuedCaptains } from "../lib/league";
import { money, shares, short, tickPct, usd, weekLengthLabel } from "../lib/format";
import { TxButton } from "../components/Tx";
import { Countdown, StockIcon } from "../components/Stock";
import { Mascot, moodOf, seatFace, teamFace } from "../components/Mascot";
import { Lines, Lineup, type Slot } from "../components/Pitch";
import { at } from "../components/Reveal";
import { ShareButton } from "../components/Share";

function useNow() {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function LeaguePage() {
  const { address: raw } = useParams();
  const address = raw && isAddress(raw) ? getAddress(raw) : undefined;
  const qc = useQueryClient();
  const league = useQuery({ queryKey: ["league", address], queryFn: () => loadLeague(address!), enabled: !!address, refetchInterval: 8000 });
  const activity = useQuery({ queryKey: ["activity", address], queryFn: () => loadActivity(address!), enabled: !!address && !!league.data, refetchInterval: 30_000 });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["league", address] });
    qc.invalidateQueries({ queryKey: ["activity", address] });
  };
  const now = useNow();
  const { address: me } = useAccount();

  if (!address) return <p className="tx-error">That isn't a league address.</p>;
  if (league.isLoading) return <p className="muted">Reading the league from Base…</p>;
  if (league.error || !league.data) return <p className="tx-error">Could not load this league: {(league.error as Error)?.message}</p>;

  // Season captain changes wait for their week; the events say which one the contract will score.
  const L = withQueuedCaptains(league.data, activity.data);
  const mySeat = L.managers.find((m) => sameAddr(m.wallet, me))?.seat;

  return (
    <div className="league">
      <LeagueHeader L={L} />
      {L.phase === 0 && <Lobby L={L} me={me} mySeat={mySeat} refresh={refresh} />}
      {L.phase === 1 && <DraftRoom L={L} mySeat={mySeat} now={now} refresh={refresh} />}
      {L.phase === 2 && <Season L={L} mySeat={mySeat} now={now} refresh={refresh} />}
      {L.phase === 3 && <Final L={L} />}
      <div className="cols">
        <CoinPanel L={L} me={me} refresh={refresh} />
        <Feed L={L} items={activity.data} loading={activity.isLoading} />
      </div>
    </div>
  );
}

/** Changes whenever the league's state does, so a new post gets a fresh card. */
const stamp = (L: LeagueState) => `${L.phase}.${L.managers.length}.${L.pickNumber}.${L.weeksSettled}`;

/** The words that go with a league link, by stage. */
function leagueShareText(L: LeagueState) {
  const champ = L.champion ? L.managers[L.champion.seat] : undefined;
  if (L.phase === 0) return `Join my league "${L.name}" on Hostile. We draft real stocks, and each week the loser hands 10% of their shares to the winner.`;
  if (L.phase === 1) return `The draft is on in "${L.name}" on Hostile. Every pick buys a real share.`;
  if (L.phase === 3 && champ) return `${champ.team} won "${L.name}" on Hostile.`;
  return `Week ${Math.min(L.weeksSettled + 1, L.config.seasonWeeks)} of "${L.name}" on Hostile. Each week the loser hands 10% of their shares to the winner.`;
}

function LeagueHeader({ L }: { L: LeagueState }) {
  const t = L.stocks[L.config.treasuryStock];
  return (
    <section className="league-head">
      <div>
        <span className={`phase phase-${L.phase}`}>{PHASES[L.phase]}</span>
        <h1 className="display">{L.name}</h1>
        <p className="muted">
          {usd(L.config.entryFee)} entry · {L.managers.length}/{L.config.maxManagers} players · {L.config.rosterSize} stocks each ·{" "}
          {L.config.seasonWeeks} × {weekLengthLabel(L.config.weekLength)} weeks ·{" "}
          <a href={basescan("address", L.address)} target="_blank" rel="noreferrer">contract ↗</a>
        </p>
        <div className="head-actions">
          <ShareButton label={L.phase === 0 ? "Invite on X" : "Share on X"} target={{ league: L.address, v: stamp(L), text: leagueShareText(L) }} />
        </div>
      </div>
      <div className="prize">
        <span className="prize-label">Champion's prize</span>
        {L.treasuryShares === 0n && L.phase < 2 ? (
          <>
            <span className="prize-value"><StockIcon meta={t.meta} size={22} /> {t.meta.symbol}</span>
            <span className="muted">2% of entries buys it when the draft ends</span>
          </>
        ) : (
          <>
            <span className="prize-value"><StockIcon meta={t.meta} size={22} /> {shares(L.treasuryShares)} {t.meta.symbol}</span>
            <span className="muted">worth {money((Number(L.treasuryShares) / 1e8) * (t.price ?? 0))} now</span>
          </>
        )}
      </div>
    </section>
  );
}

// ───────────── Joining ─────────────

function Lobby({ L, me, mySeat, refresh }: { L: LeagueState; me?: Address; mySeat?: number; refresh: () => void }) {
  const [team, setTeam] = useState("");
  const allowance = useReadContract({
    address: USDC, abi: erc20Abi, functionName: "allowance", args: me ? [me, L.address] : undefined, query: { enabled: !!me },
  });
  const balance = useReadContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: me ? [me] : undefined, query: { enabled: !!me } });
  const approved = (allowance.data ?? 0n) >= L.config.entryFee;
  const enough = (balance.data ?? 0n) >= L.config.entryFee;
  const full = L.managers.length >= L.config.maxManagers;
  const isComm = sameAddr(me, L.commissioner);
  const seats = [...Array(L.config.maxManagers).keys()];
  const link = typeof window !== "undefined" ? window.location.href : "";

  return (
    <section className="block">
      <div className="block-head">
        <h2 className="display-sm">Waiting for players</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(link)}>Copy invite link</button>
      </div>
      <div className="seats">
        {seats.map((s) => {
          const m = L.managers[s];
          return (
            <div key={s} className={`seat ${m ? "taken" : ""} ${m && sameAddr(m.wallet, me) ? "mine" : ""}`} style={at(s)}>
              <div className="seat-stage"><Mascot symbol={seatFace(s)} height={140} className={m ? "" : "ghost"} /></div>
              {m ? (<><b>{m.team}</b><span className="muted">{short(m.wallet)}{sameAddr(m.wallet, L.commissioner) ? " · commissioner" : ""}</span></>) : <><b className="muted">Open seat</b><span className="muted">{usd(L.config.entryFee)} to take it</span></>}
            </div>
          );
        })}
      </div>

      {mySeat === undefined && !full && (
        <div className="join">
          <label>Your team name
            <input value={team} maxLength={32} onChange={(e) => setTeam(e.target.value)} placeholder="Pick a name your friends will see" />
          </label>
          {me && !enough && <p className="tx-error">You need {usd(L.config.entryFee)} USDC on Base to join.</p>}
          {!approved ? (
            <TxButton
              label={`1. Allow ${usd(L.config.entryFee)} USDC`}
              disabled={!enough}
              request={() => ({ address: USDC, abi: erc20Abi, functionName: "approve", args: [L.address, L.config.entryFee] })}
              onDone={() => allowance.refetch()}
            />
          ) : (
            <TxButton
              label={`Join for ${usd(L.config.entryFee)}`}
              disabled={!team.trim() || !enough}
              request={() => ({ address: L.address, abi: LeagueAbi, functionName: "join", args: [team.trim()] })}
              onDone={refresh}
            />
          )}
        </div>
      )}

      <div className="actions">
        {mySeat !== undefined && (
          <TxButton label="Leave and get my entry back" kind="ghost" request={() => ({ address: L.address, abi: LeagueAbi, functionName: "leave" })} onDone={refresh} />
        )}
        {(isComm || full) && L.managers.length >= 2 && (
          <TxButton label="Start the draft" request={() => ({ address: L.address, abi: LeagueAbi, functionName: "startDraft" })} onDone={refresh} />
        )}
        {!isComm && !full && <p className="muted">The commissioner starts the draft, or it opens to anyone once every seat is taken.</p>}
      </div>
    </section>
  );
}

// ───────────── Draft ─────────────

function DraftRoom({ L, mySeat, now, refresh }: { L: LeagueState; mySeat?: number; now: number; refresh: () => void }) {
  const clock = L.onTheClock!;
  const onClock = L.managers[clock];
  const myTurn = mySeat === clock;
  const total = L.managers.length * L.config.rosterSize;
  const expired = now > L.pickDeadline;
  const [filter, setFilter] = useState("");
  const list = L.stocks.filter((s) => !filter || (s.meta.symbol + s.meta.name).toLowerCase().includes(filter.toLowerCase()));

  return (
    <section className="block">
      <div className={`clock-banner ${myTurn ? "mine" : ""}`}>
        <Mascot symbol={teamFace(L, onClock)} mood={myTurn ? "up" : "ready"} height={128} className="clock-fig" />
        <div className="clock-copy">
          <span className="muted">Pick {L.pickNumber + 1} of {total}</span>
          <h2 className="display-sm">{myTurn ? "You're on the clock" : `${onClock.team} is picking`}</h2>
        </div>
        <div className="clock-right">
          <Countdown to={L.pickDeadline} now={now} />
          {expired && (
            <TxButton label="Autopick for them" kind="ghost" request={() => ({ address: L.address, abi: LeagueAbi, functionName: "autopick" })} onDone={refresh} />
          )}
        </div>
      </div>
      <p className="muted">
        Each pick spends {usd(L.perPickUsdc)} buying that stock on Aerodrome, right now. The league contract holds it for you.
      </p>

      <div className="draft-order">
        {snake(L).map((seat, i) => (
          <span key={i} className={`do ${i < L.pickNumber ? "done" : ""} ${i === L.pickNumber ? "now" : ""} ${seat === mySeat ? "me" : ""}`}>
            {L.managers[seat].team}
          </span>
        ))}
      </div>

      <div className={`draft-grid ${mySeat !== undefined ? "with-team" : ""}`}>
      {mySeat !== undefined && <aside className="draft-side"><MyTeam L={L} seat={mySeat} refresh={refresh} /></aside>}
      <div className="draft-main">
      <input className="search" placeholder="Find a stock" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="board">
        {list.map((s) => {
          const taken = s.owner !== undefined;
          const min = s.price ? BigInt(Math.floor(((Number(L.perPickUsdc) / 1e6 / s.price) * 1e8) * 0.97)) : 0n;
          return (
            <div key={s.id} className={`card ${taken ? "taken" : ""}`} style={at(s.id)}>
              <div className="card-stage">
                <Mascot symbol={s.meta.symbol} height={104} />
              </div>
              <div className="card-top">
                <StockIcon meta={s.meta} size={30} />
                <div>
                  <b>{s.meta.symbol}</b>
                  <span className="muted card-name">{s.meta.name}</span>
                </div>
              </div>
              <div className="card-price">{money(s.price)}</div>
              {taken ? (
                <span className="card-owner">{L.managers[s.owner!].team}</span>
              ) : myTurn ? (
                <TxButton
                  label="Draft"
                  busyLabel="Buying…"
                  request={() => ({ address: L.address, abi: LeagueAbi, functionName: "pick", args: [BigInt(s.id), min] })}
                  onDone={refresh}
                />
              ) : (
                <span className="muted card-owner">available</span>
              )}
            </div>
          );
        })}
      </div>
      </div>
      </div>
    </section>
  );
}

function snake(L: LeagueState) {
  const out: number[] = [];
  for (let r = 0; r < L.config.rosterSize; r++) out.push(...(r % 2 === 0 ? L.draftOrder : [...L.draftOrder].reverse()));
  return out;
}

// ───────────── Season ─────────────

function Season({ L, mySeat, now, refresh }: { L: LeagueState; mySeat?: number; now: number; refresh: () => void }) {
  const week = L.weeksSettled;
  const weekEnd = L.seasonStart + (week + 1) * L.config.weekLength;
  const over = now >= weekEnd;
  const pairs = useMemo(() => {
    const seen = new Set<number>();
    const out: [Manager, Manager | undefined][] = [];
    for (const m of L.managers) {
      if (seen.has(m.seat)) continue;
      seen.add(m.seat);
      if (m.opponent !== undefined) seen.add(m.opponent);
      out.push([m, m.opponent !== undefined ? L.managers[m.opponent] : undefined]);
    }
    // Your own match comes first.
    return out.sort(([a, b], [c, d]) => Number(c.seat === mySeat || d?.seat === mySeat) - Number(a.seat === mySeat || b?.seat === mySeat));
  }, [L, mySeat]);

  return (
    <section className="block">
      <div className="block-head">
        <h2 className="display-sm">Week {week + 1} of {L.config.seasonWeeks}</h2>
        <div className="head-actions head-actions-end">
        <span className="muted">{over ? "Week is over" : <>ends in <Countdown to={weekEnd} now={now} /></>}</span>
        {mySeat !== undefined && week > 0 && (
          <ShareButton
            label="Share last week's result"
            target={{ league: L.address, card: "match", seat: mySeat, week: week - 1, v: stamp(L), text: `Week ${week} result in "${L.name}" on Hostile. The loser handed 10% of their shares to the winner.` }}
          />
        )}
        </div>
      </div>
      {over && (
        <div className="settle">
          <p>The week is over. Anyone can settle it: scores are read from each pool's price at the week's end, and the loser's 10% moves to the winner.</p>
          <TxButton label="Settle the week" request={() => ({ address: L.address, abi: LeagueAbi, functionName: "settleWeek" })} onDone={refresh} />
        </div>
      )}
      <p className="muted small">Live scores use the same 30-minute average price the contract uses. They become final when the week is settled.</p>

      <div className="matchups">
        {pairs.map(([a, b]) => <Matchup key={a.seat} L={L} a={a} b={b} mySeat={mySeat} />)}
      </div>

      <div className={`season-cols ${mySeat !== undefined ? "with-team" : ""}`}>
        {mySeat !== undefined && <MyTeam L={L} seat={mySeat} refresh={refresh} />}
        <Standings L={L} />
      </div>
    </section>
  );
}

/** This week's stock move since the week mark, in ticks (+100 ≈ +1%). */
const weekMove = (s: Stock) => (s.liveTick === undefined ? 0 : s.liveTick - s.markTick);

/** One match on one pitch: the rival's stocks in the top half, yours (or the first team) in the
 *  bottom half, each with its move this week. The captain wears the armband and counts twice. */
function Matchup({ L, a, b, mySeat }: { L: LeagueState; a: Manager; b?: Manager; mySeat?: number }) {
  const [bottom, top] = b && b.seat === mySeat ? [b, a] : [a, b];
  const slots = (m: Manager): Slot[] =>
    m.roster.map((id) => {
      const s = L.stocks[id];
      const mv = weekMove(s);
      return {
        key: id, symbol: s.meta.symbol, mood: moodOf(mv), captain: id === m.captain, name: s.meta.symbol,
        sub: id === m.captain ? `${tickPct(mv)} ×2` : tickPct(mv), tone: mv >= 0 ? "up" : "down", title: s.meta.name,
      };
    });
  const bar = (m: Manager, rival: Manager | undefined, end: "top" | "bottom") => (
    <div className={`team-bar ${end} ${rival && m.liveScore > rival.liveScore ? "lead" : ""}`}>
      <div>
        <b>{m.team}{m.seat === mySeat && <span className="you">You</span>}</b>
        <span className="muted">{m.wins}-{m.losses}{m.ties ? `-${m.ties}` : ""}{rival && m.liveScore > rival.liveScore ? " · winning" : ""}</span>
      </div>
      <span className={`tb-score ${m.liveScore >= 0 ? "up" : "down"}`}>{tickPct(m.liveScore)}</span>
    </div>
  );
  const mine = a.seat === mySeat || b?.seat === mySeat;
  return (
    <article className={`mpitch ${mine ? "me" : ""}`}>
      {top ? bar(top, bottom, "top") : <div className="team-bar top"><div><b>Bye week</b><span className="muted">An odd number of teams, so one sits out. No shares move.</span></div></div>}
      {top ? (
        <div className="pitch-box full">
          <Lines variant="full" />
          <Lineup slots={slots(top)} facing="down" />
          <div className="halfway"><span>vs</span></div>
          <Lineup slots={slots(bottom)} facing="up" />
        </div>
      ) : (
        <div className="pitch-box half">
          <Lines variant="half" />
          <Lineup slots={slots(bottom)} facing="up" />
        </div>
      )}
      {bar(bottom, top, "bottom")}
      {top && (
        <div className="mpitch-foot">
          <ShareButton
            label="Share this match" className="btn-text"
            target={{ league: L.address, card: "match", seat: bottom.seat, v: stamp(L), text: `${bottom.team} vs ${top.team}, week ${L.weeksSettled + 1} of "${L.name}" on Hostile. The loser hands 10% of their shares to the winner.` }}
          />
        </div>
      )}
    </article>
  );
}

function Standings({ L }: { L: LeagueState }) {
  const rows = [...L.managers].sort((x, y) => y.wins - x.wins || y.total - x.total);
  return (
    <div className="standings">
      <h3>Standings</h3>
      <table>
        <thead><tr><th>Team</th><th>W</th><th>L</th><th>T</th><th>Season move</th><th>Bag now</th></tr></thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.seat}>
              <td className="st-team"><Mascot symbol={teamFace(L, m)} mood={L.phase === 3 && L.champion?.seat === m.seat ? "champ" : "ready"} height={44} /><b>{m.team}</b></td>
              <td>{m.wins}</td><td>{m.losses}</td><td>{m.ties}</td>
              <td className={m.total >= 0 ? "up" : "down"}>{tickPct(m.total)}</td>
              <td>{money(bagValue(L, m))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const bagValue = (L: LeagueState, m: Manager) => m.roster.reduce((sum, id) => sum + (Number(L.stocks[id].shares) / 1e8) * (L.stocks[id].price ?? 0), 0);

/** Your squad on a half pitch. Tap a player to see its shares and make it captain (one real
 *  setCaptain transaction). During the draft, empty shirts stand where your next picks will go. */
function MyTeam({ L, seat, refresh }: { L: LeagueState; seat: number; refresh: () => void }) {
  const m = L.managers[seat];
  const [sel, setSel] = useState<number>();
  const season = L.phase === 2;
  const myPicks = snake(L).flatMap((s, i) => (s === seat ? [i] : []));
  const empty = L.phase === 1 ? Math.max(L.config.rosterSize - m.roster.length, 0) : 0;
  if (!m.roster.length && !empty) return null;

  const valueOf = (s: Stock) => (Number(s.shares) / 1e8) * (s.price ?? 0);
  const slots: Slot[] = m.roster.map((id) => {
    const s = L.stocks[id];
    const mv = weekMove(s);
    return {
      key: id, symbol: s.meta.symbol, mood: season ? moodOf(mv) : "ready",
      captain: id === m.captain, nextCaptain: id === m.nextCaptain, name: s.meta.symbol,
      sub: season ? tickPct(mv) : money(valueOf(s)), tone: season ? (mv >= 0 ? "up" : "down") : undefined,
      selected: sel === id, onClick: () => setSel(sel === id ? undefined : id), title: `${s.meta.name}: tap for details`,
    };
  });
  for (let k = 0; k < empty; k++) {
    const pick = myPicks[m.roster.length + k];
    slots.push({ key: `empty-${k}`, name: pick === undefined ? "Open" : `Pick ${pick + 1}`, sub: pick === L.pickNumber ? "on the clock" : "to come" });
  }

  const picked = sel !== undefined && m.roster.includes(sel) ? L.stocks[sel] : undefined;
  return (
    <div className="my-team">
      <div className="mt-head">
        <div><span className="muted">Your team</span><b>{m.team}</b></div>
        <div className="mt-bag"><span className="muted">Bag now</span><b>{money(bagValue(L, m))}</b></div>
      </div>
      {m.roster.length > 0 && (
        <ShareButton
          label="Share my team" className="btn-text"
          target={{ league: L.address, card: "team", seat, v: `${stamp(L)}.${m.roster.length}.${m.captain}`, text: `My squad in "${L.name}" on Hostile: ${m.roster.map((id) => L.stocks[id].meta.symbol).join(", ")}. Every one is a real share.` }}
        />
      )}
      <div className="pitch-box half">
        <Lines variant="half" />
        <Lineup slots={slots} facing="up" />
      </div>
      {picked ? (
        <div className="pp-detail">
          <div className="pp-detail-top">
            <StockIcon meta={picked.meta} size={34} />
            <div><b>{picked.meta.symbol}</b><span className="muted">{picked.meta.name}</span></div>
            <button className="pp-close" onClick={() => setSel(undefined)} aria-label="Close">×</button>
          </div>
          <div className="pp-facts">
            <span><span className="muted">Shares</span><b>{shares(picked.shares)}</b></span>
            <span><span className="muted">Worth</span><b>{money(valueOf(picked))}</b></span>
            {season && <span><span className="muted">This week</span><b className={weekMove(picked) >= 0 ? "up" : "down"}>{tickPct(weekMove(picked))}</b></span>}
          </div>
          {picked.id === m.captain && !m.nextCaptain ? (
            <p className="muted small">Your captain. It counts double.</p>
          ) : picked.id === m.nextCaptain ? (
            <p className="muted small">Captain from next week.</p>
          ) : (
            <TxButton
              label={season ? `Make ${picked.meta.symbol} captain from next week` : `Make ${picked.meta.symbol} captain`}
              request={() => ({ address: L.address, abi: LeagueAbi, functionName: "setCaptain", args: [BigInt(picked.id)] })}
              onDone={refresh}
            />
          )}
        </div>
      ) : (
        <p className="muted small mt-hint">
          {m.roster.length ? "Tap a player to see its shares or make it captain. " : ""}
          {season ? "A new captain starts counting next week, so nobody can pick one after seeing prices." : "Your captain counts double. Your first pick is captain until you change it."}
        </p>
      )}
    </div>
  );
}

// ───────────── Finished ─────────────

function Final({ L }: { L: LeagueState }) {
  const champ = L.champion ? L.managers[L.champion.seat] : undefined;
  return (
    <section className="block">
      {champ && (
        <div className="champion">
          <Mascot symbol={teamFace(L, champ)} mood="champ" height={210} className="champ-fig" />
          <span className="kicker kicker-on-blue">Champion</span>
          <h2 className="display">{champ.team}</h2>
          <p>{champ.wins} wins · took the treasury · {short(champ.wallet)}</p>
        </div>
      )}
      <p className="muted">The season is over. Every manager's remaining shares were sent to their wallet.</p>
      <Standings L={L} />
    </section>
  );
}

// ───────────── League coin ─────────────

function CoinPanel({ L, me, refresh }: { L: LeagueState; me?: Address; refresh: () => void }) {
  const t = L.stocks[L.config.treasuryStock];
  const isComm = sameAddr(me, L.commissioner);
  const [symbol, setSymbol] = useState("");
  const [image, setImage] = useState("");
  const sym = useReadContract({ address: L.coin, abi: erc20Abi, functionName: "symbol", query: { enabled: !!L.coin } });

  return (
    <section className="panel">
      <h3>League coin</h3>
      {L.coin ? (
        <>
          <p>
            <b>${sym.data ?? "…"}</b> trades against {t.meta.symbol} on Stonks Exchange. Its trading fees, paid in {t.meta.symbol}, go into this league's
            prize. The coin side of the fees is burned.
          </p>
          <div className="actions">
            <a className="btn btn-primary" href={`${STONKS_COIN_URL}${L.coin}`} target="_blank" rel="noreferrer">Trade on Stonks Exchange ↗</a>
            <TxButton label="Collect fees into the prize" kind="ghost" request={() => ({ address: COINS, abi: LeagueCoinsAbi, functionName: "harvest", args: [L.coin!] })} onDone={refresh} />
          </div>
          <p className="muted small"><a href={basescan("token", L.coin)} target="_blank" rel="noreferrer">{short(L.coin)} on BaseScan ↗</a></p>
        </>
      ) : isComm && L.phase !== 3 ? (
        <>
          <p className="muted">
            Launch a coin for this league on Stonks Exchange, priced in {t.meta.symbol}. Fans who trade it grow the champion's prize: the fees buy into it.
            Optional, one per league.
          </p>
          <div className="row2">
            <label>Ticker<input value={symbol} maxLength={10} onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} placeholder="FNS" /></label>
            <label>Image URL (optional)<input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" /></label>
          </div>
          <TxButton
            label="Launch league coin"
            disabled={symbol.length < 2}
            request={() => ({
              address: COINS, abi: LeagueCoinsAbi, functionName: "launch",
              args: [L.address, L.name, symbol, 80, 3000, {
                image, banner: "", description: `Fan coin of the Hostile league "${L.name}". Trading fees grow the champion's ${t.meta.symbol} prize.`,
                website: `https://hostile.nerom.site/l/${L.address}`, twitter: "", telegram: "",
              }],
            })}
            onDone={refresh}
          />
          <p className="muted small">1% trading fee. Stonks Exchange keeps 30% of fees; the rest goes to the league.</p>
        </>
      ) : (
        <p className="muted">No coin for this league{isComm ? "" : " yet. Only the commissioner can launch one"}.</p>
      )}
    </section>
  );
}

// ───────────── Activity feed ─────────────

function Feed({ L, items, loading }: { L: LeagueState; items?: Activity[]; loading: boolean }) {
  const team = (seat: unknown) => L.managers[Number(seat)]?.team ?? `Seat ${seat}`;
  const teamOf = (wallet: unknown) => L.managers.find((m) => sameAddr(m.wallet, wallet as string))?.team ?? short(wallet as string);
  const sym = (id: unknown) => L.stocks[Number(id)]?.meta.symbol ?? "?";
  const line = (a: Activity): string | null => {
    const g = a.args;
    switch (a.kind) {
      case "Joined": return `${g.team} joined`;
      case "DraftStarted": return "The draft started";
      case "Picked": return `Pick ${Number(g.pick) + 1}: ${team(g.seat)} bought ${shares(g.sharesOut as bigint)} ${sym(g.stockId)} for ${usd(g.usdcIn as bigint)}${g.auto_ ? " (autopick)" : ""}`;
      case "TreasuryBought": return `Rake bought ${shares(g.sharesOut as bigint)} ${sym(g.stockId)} for the champion`;
      case "TreasuryFunded": return `${shares(g.amount as bigint)} ${L.stocks[L.config.treasuryStock].meta.symbol} added to the prize`;
      case "MatchSettled": return `Week ${Number(g.week) + 1}: ${team(g.seatA)} ${tickPct(Number(g.scoreA))} vs ${tickPct(Number(g.scoreB))} ${team(g.seatB)} → ${Number(g.winner) < 0 ? "tie" : `${team(g.winner)} wins`}`;
      case "SliceSent": return `${team(g.fromSeat)} sent ${shares(g.amount as bigint)} ${sym(g.stockId)} to ${teamOf(g.to)}`;
      case "SeasonFinished": return `${team(g.championSeat)} is champion`;
      case "BagReleased": return null;
      case "CaptainSet": return null;
      default: return null;
    }
  };
  const rows = (items ?? []).map((a) => ({ a, text: line(a) })).filter((r) => r.text).reverse();
  return (
    <section className="panel">
      <h3>What happened</h3>
      {loading && <p className="muted">Reading events…</p>}
      {!loading && rows.length === 0 && <p className="muted">Nothing yet.</p>}
      <ul className="feed">
        {rows.slice(0, 40).map(({ a, text }, i) => (
          <li key={i} className={`feed-${a.kind}`}>
            <span>{text}</span>
            <a href={basescan("tx", a.tx)} target="_blank" rel="noreferrer" className="muted">tx ↗</a>
          </li>
        ))}
      </ul>
    </section>
  );
}
