import { type Address, type Log, getAddress, parseEventLogs, zeroAddress } from "viem";
import { LeagueAbi } from "../abi/League";
import { LeagueFactoryAbi } from "../abi/LeagueFactory";
import { LeagueCoinsAbi } from "../abi/LeagueCoins";
import { COINS, FACTORY, FACTORY_BLOCK, client, logsClient } from "./chain";
import stockMeta from "../data/stocks.json";

export const PHASES = ["Joining", "Drafting", "Season", "Finished"] as const;
export type Phase = 0 | 1 | 2 | 3;

const poolAbi = [
  { type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [{ type: "uint160" }, { type: "int24" }] },
  {
    type: "function", name: "observe", stateMutability: "view", inputs: [{ type: "uint32[]" }],
    outputs: [{ type: "int56[]" }, { type: "uint160[]" }],
  },
] as const;

export type Meta = { symbol: string; name: string; icon?: string | null };
const META = stockMeta as Record<string, Meta>;
export const metaOf = (token: string): Meta => META[token.toLowerCase()] ?? { symbol: short4(token), name: token };
const short4 = (a: string) => a.slice(2, 6).toUpperCase();

export type Stock = {
  id: number;
  token: Address;
  pool: Address;
  usdcIsToken0: boolean;
  meta: Meta;
  price?: number; // USD per share, from the Aerodrome pool's current price
  owner?: number; // seat that drafted it
  shares: bigint; // held by the league for the owner
  markTick: number; // price tick at the last week boundary
  liveTick?: number; // 30-minute TWAP tick now (same method the contract uses)
};

export type Manager = {
  seat: number;
  wallet: Address;
  team: string;
  roster: number[];
  captain: number;
  wins: number;
  losses: number;
  ties: number;
  total: number;
  weekScores: number[];
  liveScore: number; // this week so far, estimated from the live TWAP; final only when settled
  opponent?: number; // this week's opponent seat (undefined = bye)
  nextCaptain?: number; // captain queued for next week (season only), from CaptainSet events
};

export type Config = {
  entryFee: bigint;
  maxManagers: number;
  rosterSize: number;
  seasonWeeks: number;
  weekLength: number;
  pickWindow: number;
  treasuryStock: number;
};

export type LeagueState = {
  address: Address;
  name: string;
  commissioner: Address;
  config: Config;
  phase: Phase;
  managers: Manager[];
  draftOrder: number[];
  pickNumber: number;
  pickDeadline: number;
  perPickUsdc: bigint;
  onTheClock?: number;
  stocks: Stock[];
  treasuryShares: bigint;
  seasonStart: number;
  weeksSettled: number;
  champion?: { seat: number; wallet: Address };
  coin?: Address;
  loadedAt: number;
};

const TWAP = 1800;

function priceFromSqrt(sqrt: bigint, usdcIsToken0: boolean) {
  const p = (Number(sqrt) / 2 ** 96) ** 2; // token1 per token0, raw units
  // USDC has 6 decimals, stock tokens 8.
  return usdcIsToken0 ? 100 / p : p * 100;
}

function twapTick(cums: readonly bigint[]) {
  const d = cums[1] - cums[0];
  let t = d / BigInt(TWAP);
  if (d < 0n && d % BigInt(TWAP) !== 0n) t -= 1n;
  return Number(t);
}

export async function loadLeague(address: Address): Promise<LeagueState> {
  const L = { address, abi: LeagueAbi } as const;
  const [name, commissioner, cfg, phase, managers, draftOrder, pickNumber, pickDeadline, perPickUsdc, stockCount, treasuryShares, seasonStart, weeksSettled, champion, coin] =
    await client.multicall({
      allowFailure: false,
      contracts: [
        { ...L, functionName: "name" },
        { ...L, functionName: "commissioner" },
        { ...L, functionName: "config" },
        { ...L, functionName: "phase" },
        { ...L, functionName: "managers" },
        { ...L, functionName: "draftOrder" },
        { ...L, functionName: "pickNumber" },
        { ...L, functionName: "pickDeadline" },
        { ...L, functionName: "perPickUsdc" },
        { ...L, functionName: "stockCount" },
        { ...L, functionName: "treasuryShares" },
        { ...L, functionName: "seasonStart" },
        { ...L, functionName: "weeksSettled" },
        { ...L, functionName: "champion" },
        { address: COINS, abi: LeagueCoinsAbi, functionName: "coinOf", args: [address] },
      ],
    });

  const config: Config = {
    entryFee: cfg[0], maxManagers: cfg[1], rosterSize: cfg[2], seasonWeeks: cfg[3],
    weekLength: Number(cfg[4]), pickWindow: Number(cfg[5]), treasuryStock: cfg[6],
  };
  const n = managers.length;
  const count = Number(stockCount);
  const settled = Number(weeksSettled);
  const ph = Number(phase) as Phase;
  const ids = [...Array(count).keys()];
  const seats = [...Array(n).keys()];

  const perStock = await client.multicall({
    allowFailure: false,
    contracts: ids.flatMap((i) => [
      { ...L, functionName: "stockAt", args: [BigInt(i)] },
      { ...L, functionName: "ownerOf", args: [BigInt(i)] },
      { ...L, functionName: "shares", args: [BigInt(i)] },
      { ...L, functionName: "markTick", args: [BigInt(i)] },
    ] as const),
  });
  const perSeat = await client.multicall({
    allowFailure: false,
    contracts: seats.flatMap((s) => [
      { ...L, functionName: "teamName", args: [BigInt(s)] },
      { ...L, functionName: "rosterOf", args: [BigInt(s)] },
      { ...L, functionName: "captain", args: [BigInt(s)] },
      { ...L, functionName: "wins", args: [BigInt(s)] },
      { ...L, functionName: "losses", args: [BigInt(s)] },
      { ...L, functionName: "ties", args: [BigInt(s)] },
      { ...L, functionName: "totalScore", args: [BigInt(s)] },
      { ...L, functionName: "opponentOf", args: [BigInt(s), BigInt(Math.min(settled, Math.max(config.seasonWeeks - 1, 0)))] },
    ] as const),
  });
  const weekScores = settled
    ? await client.multicall({
        allowFailure: false,
        contracts: seats.flatMap((s) => [...Array(settled).keys()].map((w) => ({ ...L, functionName: "weekScore", args: [BigInt(w), BigInt(s)] }) as const)),
      })
    : [];
  const clock = ph === 1 ? await client.readContract({ ...L, functionName: "onTheClock" }) : undefined;

  const stocks: Stock[] = ids.map((i) => {
    const s = perStock[i * 4] as { token: Address; pool: Address; usdcIsToken0: boolean };
    const own = perStock[i * 4 + 1] as readonly [boolean, bigint];
    return {
      id: i, token: s.token, pool: s.pool, usdcIsToken0: s.usdcIsToken0, meta: metaOf(s.token),
      owner: own[0] ? Number(own[1]) : undefined,
      shares: perStock[i * 4 + 2] as bigint,
      markTick: Number(perStock[i * 4 + 3]),
    };
  });

  // Live prices and live TWAP ticks straight from each Aerodrome pool.
  const poolReads = await client.multicall({
    allowFailure: true,
    contracts: stocks.flatMap((s) => [
      { address: s.pool, abi: poolAbi, functionName: "slot0" },
      { address: s.pool, abi: poolAbi, functionName: "observe", args: [[TWAP, 0]] },
    ] as const),
  });
  stocks.forEach((s, i) => {
    const slot = poolReads[i * 2];
    const obs = poolReads[i * 2 + 1];
    if (slot.status === "success") s.price = priceFromSqrt((slot.result as readonly [bigint, number])[0], s.usdcIsToken0);
    if (obs.status === "success") {
      const t = twapTick((obs.result as readonly [readonly bigint[], readonly bigint[]])[0]);
      s.liveTick = s.usdcIsToken0 ? -t : t;
    }
  });

  const mgrs: Manager[] = seats.map((s) => {
    const k = s * 8;
    const roster = (perSeat[k + 1] as readonly number[]).map(Number);
    const captain = Number(perSeat[k + 2]);
    const opp = perSeat[k + 7] as readonly [boolean, bigint];
    const liveScore = ph === 2 ? liveScoreOf(stocks, roster, captain) : 0;
    return {
      seat: s, wallet: managers[s], team: perSeat[k] as string, roster, captain,
      wins: Number(perSeat[k + 3]), losses: Number(perSeat[k + 4]), ties: Number(perSeat[k + 5]),
      total: Number(perSeat[k + 6]),
      weekScores: [...Array(settled).keys()].map((w) => Number(weekScores[s * settled + w])),
      liveScore, opponent: opp[0] ? Number(opp[1]) : undefined,
    };
  });

  return {
    address, name, commissioner, config, phase: ph, managers: mgrs,
    draftOrder: draftOrder.map(Number), pickNumber: Number(pickNumber), pickDeadline: Number(pickDeadline),
    perPickUsdc, onTheClock: clock === undefined ? undefined : Number(clock), stocks, treasuryShares,
    seasonStart: Number(seasonStart), weeksSettled: settled,
    champion: champion[0] ? { seat: Number(champion[1]), wallet: champion[2] } : undefined,
    coin: coin === zeroAddress ? undefined : coin,
    loadedAt: Math.floor(Date.now() / 1000),
  };
}

export type LeagueSummary = { address: Address; name: string; phase: Phase; managers: number; maxManagers: number; entryFee: bigint; weeks: number };

export async function loadLeagues(): Promise<LeagueSummary[]> {
  const list = await client.readContract({ address: FACTORY, abi: LeagueFactoryAbi, functionName: "leagues" });
  if (!list.length) return [];
  const r = await client.multicall({
    allowFailure: false,
    contracts: list.flatMap((a) => [
      { address: a, abi: LeagueAbi, functionName: "name" },
      { address: a, abi: LeagueAbi, functionName: "phase" },
      { address: a, abi: LeagueAbi, functionName: "managers" },
      { address: a, abi: LeagueAbi, functionName: "config" },
    ] as const),
  });
  return list
    .map((a, i) => {
      const cfg = r[i * 4 + 3] as readonly [bigint, number, number, number, number, number, number];
      return {
        address: a, name: r[i * 4] as string, phase: Number(r[i * 4 + 1]) as Phase,
        managers: (r[i * 4 + 2] as readonly Address[]).length, maxManagers: cfg[1], entryFee: cfg[0], weeks: cfg[3],
      };
    })
    .reverse();
}

// ───────────── activity (event logs) ─────────────

const CHUNK = 49_000n;

/** Finds the block a contract was created in with a binary search on eth_getCode. */
async function creationBlock(address: Address): Promise<bigint> {
  let lo = FACTORY_BLOCK;
  let hi = await logsClient.getBlockNumber();
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    const code = await logsClient.getCode({ address, blockNumber: mid });
    if (code && code !== "0x") hi = mid;
    else lo = mid + 1n;
  }
  return lo;
}

export type Activity = { kind: string; block: bigint; tx: `0x${string}`; args: Record<string, unknown> };

export async function loadActivity(address: Address): Promise<Activity[]> {
  const from = await creationBlock(address);
  const head = await logsClient.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let b = from; b <= head; b += CHUNK) ranges.push([b, b + CHUNK - 1n > head ? head : b + CHUNK - 1n]);
  const logs: Log[] = [];
  for (let i = 0; i < ranges.length; i += 4) {
    const batch = await Promise.all(ranges.slice(i, i + 4).map(([a, b]) => logsClient.getLogs({ address, fromBlock: a, toBlock: b })));
    batch.forEach((l) => logs.push(...l));
  }
  return parseEventLogs({ abi: LeagueAbi, logs }).map((e) => ({
    kind: e.eventName, block: e.blockNumber!, tx: e.transactionHash!, args: e.args as Record<string, unknown>,
  }));
}

/** This week's live score for a roster: each stock's tick move since the week mark, captain twice. */
export const liveScoreOf = (stocks: Stock[], roster: number[], captain: number) =>
  roster.reduce((sum, id) => {
    const st = stocks[id];
    const move = st.liveTick === undefined ? 0 : st.liveTick - st.markTick;
    return sum + (id === captain ? move * 2 : move);
  }, 0);

/** A captain changed during the season is stored privately and only swapped in when its week is
 *  settled (League.sol setCaptain / settleWeek). The CaptainSet events say what is queued: the
 *  latest one per seat wins. If its week has already started, it is the captain the contract will
 *  score this week, so the live score uses it; otherwise it is shown as next week's captain. */
export function withQueuedCaptains(L: LeagueState, acts?: Activity[]): LeagueState {
  if (L.phase !== 2 || !acts) return L;
  const latest = new Map<number, { stock: number; from: number }>();
  for (const a of acts) {
    if (a.kind !== "CaptainSet") continue;
    latest.set(Number(a.args.seat), { stock: Number(a.args.stockId), from: Number(a.args.fromWeek) });
  }
  const managers = L.managers.map((m) => {
    const q = latest.get(m.seat);
    if (!q || q.from === 0 || q.stock === m.captain) return m;
    if (q.from <= L.weeksSettled) return { ...m, captain: q.stock, liveScore: liveScoreOf(L.stocks, m.roster, q.stock) };
    return { ...m, nextCaptain: q.stock };
  });
  return { ...L, managers };
}

export const sameAddr = (a?: string, b?: string) => !!a && !!b && getAddress(a) === getAddress(b);

// ───────────── home page: live board straight from the factory's stock list ─────────────

const token0Abi = [{ type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }] as const;

export type BoardRow = {
  token: Address;
  meta: Meta;
  price?: number;
  /** Price move over the last 30 minutes, in ticks (+100 ≈ +1%), from the pool's own oracle. */
  move30?: number;
};
export type Board = { rows: BoardRow[]; stockCount: number; leagueCount: number };

/** Reads the factory's draftable stocks and each one's current price from its Aerodrome pool. */
export async function loadBoard(): Promise<Board> {
  const [[tokens, pools], leagueCount] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: FACTORY, abi: LeagueFactoryAbi, functionName: "stocks" },
      { address: FACTORY, abi: LeagueFactoryAbi, functionName: "leagueCount" },
    ],
  });
  const reads = await client.multicall({
    allowFailure: true,
    contracts: pools.flatMap((p) => [
      { address: p, abi: token0Abi, functionName: "token0" },
      { address: p, abi: poolAbi, functionName: "slot0" },
      { address: p, abi: poolAbi, functionName: "observe", args: [[1800, 1799, 1, 0]] },
    ] as const),
  });
  const rows = tokens.map((t, i) => {
    const t0 = reads[i * 3];
    const s0 = reads[i * 3 + 1];
    const ob = reads[i * 3 + 2];
    let price: number | undefined;
    let move30: number | undefined;
    if (t0.status === "success" && s0.status === "success") {
      const usdcIsToken0 = getAddress(t0.result as Address) !== getAddress(t);
      price = priceFromSqrt((s0.result as readonly [bigint, number])[0], usdcIsToken0);
      if (ob.status === "success") {
        const c = (ob.result as readonly [readonly bigint[], readonly bigint[]])[0];
        const then = Number(c[1] - c[0]); // pool tick 30 minutes ago
        const now = Number(c[3] - c[2]); // pool tick a second ago
        move30 = usdcIsToken0 ? then - now : now - then;
      }
    }
    return { token: t, meta: metaOf(t), price, move30 };
  });
  return { rows, stockCount: tokens.length, leagueCount: Number(leagueCount) };
}

/** An example matchup scored the way the contract scores a week (sum of tick moves, captain x2),
 *  over the last 30 minutes of real prices. The teams are examples; the numbers are live. */
export function exampleMatch(rows: BoardRow[]) {
  const pick = (syms: string[]) => syms.map((s) => rows.find((r) => r.meta.symbol === s)).filter((r): r is BoardRow => !!r);
  const a = pick(["NVDA", "TSLA", "AAPL"]);
  const b = pick(["MSFT", "META", "AMZN"]);
  const score = (team: BoardRow[]) => team.reduce((sum, r, i) => sum + (r.move30 ?? 0) * (i === 0 ? 2 : 1), 0);
  return { a, b, scoreA: score(a), scoreB: score(b) };
}
