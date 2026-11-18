import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useReadContract } from "wagmi";
import { parseEventLogs, parseUnits } from "viem";
import { LeagueFactoryAbi } from "../abi/LeagueFactory";
import { FACTORY } from "../lib/chain";
import { metaOf } from "../lib/league";
import { TxButton } from "../components/Tx";
import { StockIcon } from "../components/Stock";
import { Manager } from "../components/Cast";

const WEEK_OPTIONS = [
  { label: "1 hour (quick test)", s: 3600 },
  { label: "1 day", s: 86400 },
  { label: "1 week", s: 604800 },
];
const CLOCK_OPTIONS = [
  { label: "1 minute", s: 60 },
  { label: "5 minutes", s: 300 },
  { label: "1 hour", s: 3600 },
  { label: "12 hours", s: 43200 },
];

export function CreateLeague() {
  const nav = useNavigate();
  const stocks = useReadContract({ address: FACTORY, abi: LeagueFactoryAbi, functionName: "stocks" });
  const tokens = stocks.data?.[0] ?? [];
  const [name, setName] = useState("");
  const [entry, setEntry] = useState("10");
  const [players, setPlayers] = useState(4);
  const [roster, setRoster] = useState(3);
  const [weeks, setWeeks] = useState(3);
  const [weekLength, setWeekLength] = useState(86400);
  const [clock, setClock] = useState(300);
  const [treasury, setTreasury] = useState<number>();

  const nvda = tokens.findIndex((t) => metaOf(t).symbol === "NVDA");
  const treasuryIdx = treasury ?? (nvda >= 0 ? nvda : 0);
  const entryNum = Number(entry);
  const tooMany = players * roster > tokens.length && tokens.length > 0;
  const entryOk = Number.isFinite(entryNum) && entryNum >= roster * 0.1;
  const valid = name.trim().length > 0 && name.length <= 48 && !tooMany && entryOk;
  const perPick = entryOk ? (entryNum * 0.98) / roster : 0;

  return (
    <section className="block narrow">
      <span className="kicker">New league</span>
      <h1 className="display-md">Start a league</h1>
      <p className="muted">You become the commissioner: you share the link and start the draft. You can't touch anyone's money.</p>

      <div className="form">
        <label>League name
          <input value={name} maxLength={48} onChange={(e) => setName(e.target.value)} placeholder="Friday Night Stocks" />
        </label>

        <label>Entry fee (USDC each)
          <div className="seg">
            {["5", "10", "25", "50"].map((v) => (
              <button key={v} className={entry === v ? "on" : ""} onClick={() => setEntry(v)}>${v}</button>
            ))}
            <input className="seg-input" value={entry} onChange={(e) => setEntry(e.target.value)} inputMode="decimal" />
          </div>
          <small>Each pick spends {perPick ? `$${perPick.toFixed(2)}` : "—"} on one stock. 2% buys the champion's prize.</small>
        </label>

        <div className="row2">
          <label>Players
            <select value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
              {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>Stocks each
            <select value={roster} onChange={(e) => setRoster(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <div className="lineup-preview" title="Each seat plays as one of the four managers">
          {[...Array(players).keys()].map((i) => <Manager key={i} seat={i} height={players > 6 ? 70 : 88} />)}
        </div>
        {tooMany && <p className="tx-error">{players} players × {roster} stocks is more than the {tokens.length} stocks you can draft.</p>}

        <div className="row2">
          <label>Weeks in the season
            <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
              {[1, 2, 3, 4, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>A "week" lasts
            <select value={weekLength} onChange={(e) => setWeekLength(Number(e.target.value))}>
              {WEEK_OPTIONS.map((o) => <option key={o.s} value={o.s}>{o.label}</option>)}
            </select>
          </label>
        </div>

        <label>Time per pick
          <select value={clock} onChange={(e) => setClock(Number(e.target.value))}>
            {CLOCK_OPTIONS.map((o) => <option key={o.s} value={o.s}>{o.label}</option>)}
          </select>
          <small>If someone runs out of time, anyone can pick the top available stock for them.</small>
        </label>

        <label>Champion's prize stock
          <div className="treasury-pick">
            {tokens.slice(0, 12).map((t, i) => (
              <button key={t} className={treasuryIdx === i ? "on" : ""} onClick={() => setTreasury(i)} title={metaOf(t).name}>
                <StockIcon meta={metaOf(t)} size={18} /> {metaOf(t).symbol}
              </button>
            ))}
          </div>
          <small>The 2% rake, and any league coin fees, buy this stock for the champion.</small>
        </label>

        <TxButton
          label="Create league on Base"
          disabled={!valid}
          request={() => ({
            address: FACTORY, abi: LeagueFactoryAbi, functionName: "createLeague",
            args: [name.trim(), {
              entryFee: parseUnits(entry, 6), maxManagers: players, rosterSize: roster, seasonWeeks: weeks,
              weekLength, pickWindow: clock, treasuryStock: treasuryIdx,
            }],
          })}
          onDone={(r) => {
            const ev = parseEventLogs({ abi: LeagueFactoryAbi, logs: r.logs, eventName: "LeagueCreated" })[0];
            if (ev) nav(`/l/${ev.args.league}`);
          }}
        />
      </div>
    </section>
  );
}
