/** Reads one league straight from Base. Pure: it takes the RPC client as an argument and imports no
 *  wallet code, so the web app and the share-card function (api/og.ts) read a league the same way. */
import { type Address, type PublicClient, encodeAbiParameters, keccak256, zeroAddress } from "viem";
import { LeagueAbi } from "../abi/League";
import { LeagueCoinsAbi } from "../abi/LeagueCoins";
import { COINS } from "./addresses";
import stockMeta from "../data/stocks.json";

/** The three client calls a league read needs. */
export type Reader = Pick<PublicClient, "multicall" | "readContract" | "getStorageAt">;

export const PHASES = ["Joining", "Drafting", "Season", "Finished"] as const;
export type Phase = 0 | 1 | 2 | 3;

export const poolAbi = [
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

export function priceFromSqrt(sqrt: bigint, usdcIsToken0: boolean) {
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

export async function readLeague(client: Reader, address: Address): Promise<LeagueState> {
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

/** This week's live score for a roster: each stock's tick move since the week mark, captain twice. */
export const liveScoreOf = (stocks: Stock[], roster: number[], captain: number) =>
  roster.reduce((sum, id) => {
    const st = stocks[id];
    const move = st.liveTick === undefined ? 0 : st.liveTick - st.markTick;
    return sum + (id === captain ? move * 2 : move);
  }, 0);

/** Where League.sol keeps its captain mappings (`forge inspect League storage-layout`): the public
 *  `captain` at slot 19, then the private `_nextCaptain`, `_nextCaptainFrom`, `_hasNextCaptain`. */
const SLOT = { captain: 19n, next: 20n, nextFrom: 21n, hasNext: 22n } as const;
export const mappingSlot = (key: number, slot: bigint) =>
  keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(key), slot]));

/** A captain changed during the season is queued in private storage and swapped in when its week
 *  is settled. The app learns the queue from CaptainSet events (league.ts withQueuedCaptains); a
 *  share card can't wait for an event scan, so this reads the same three values from storage.
 *  It first checks that slot 19 agrees with the public captain() getter, and changes nothing if
 *  it doesn't (a contract with a different layout). */
export async function applyQueuedCaptains(client: Reader, L: LeagueState): Promise<LeagueState> {
  if (L.phase !== 2) return L;
  const word = async (seat: number, slot: bigint) => BigInt((await client.getStorageAt({ address: L.address, slot: mappingSlot(seat, slot) })) ?? "0x0");
  const managers = await Promise.all(
    L.managers.map(async (m) => {
      const [stored, has, next, from] = await Promise.all([word(m.seat, SLOT.captain), word(m.seat, SLOT.hasNext), word(m.seat, SLOT.next), word(m.seat, SLOT.nextFrom)]);
      const queued = Number(next);
      if (Number(stored) !== m.captain || has === 0n || queued === m.captain) return m;
      if (from <= BigInt(L.weeksSettled)) return { ...m, captain: queued, liveScore: liveScoreOf(L.stocks, m.roster, queued) };
      return { ...m, nextCaptain: queued };
    }),
  );
  return { ...L, managers };
}
