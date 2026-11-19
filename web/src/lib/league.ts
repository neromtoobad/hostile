import { type Address, type Log, getAddress, parseEventLogs } from "viem";
import { LeagueAbi } from "../abi/League";
import { LeagueFactoryAbi } from "../abi/LeagueFactory";
import { FACTORY, FACTORY_BLOCK, client, logsClient } from "./chain";
import { type LeagueState, type Meta, type Phase, type Reader, liveScoreOf, metaOf, poolAbi, priceFromSqrt, readLeague } from "./leagueRead";

export * from "./leagueRead";

/** Reads one league with the app's own RPC client (the reading itself is in leagueRead.ts). */
export const loadLeague = (address: Address) => readLeague(client as Reader, address);

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
