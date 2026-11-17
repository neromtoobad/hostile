// Live dry run: plays a whole Hostile season against real Base mainnet state, without spending
// anything. It uses eth_simulateV1 on a Base node: our contracts are deployed inside the
// simulation, four test managers get USDC through a state override, and the simulation moves
// time forward between blocks. Every buy, TWAP read and share transfer runs against the real
// Coinbase stock tokens (B20 precompiles) and the real Aerodrome pools at a pinned block.
//
//   node tools/live-dry-run.mjs            (after `forge build` in contracts/)
//
// Output: a readable log and evidence/dry-run-<block>.json.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeAbiParameters, encodeDeployData, encodeFunctionData, decodeFunctionResult, decodeEventLog,
  getContractAddress, keccak256, toHex, formatUnits, parseAbi,
} from "viem";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const RPC = process.env.BASE_RPC || "https://mainnet.base.org";
const art = (file, name) => JSON.parse(readFileSync(join(root, "contracts/out", file, `${name}.json`), "utf8"));
const Factory = art("LeagueFactory.sol", "LeagueFactory");
const League = art("League.sol", "League");
const Whale = art("SimWhale.sol", "SimWhale");
const list = JSON.parse(readFileSync(join(root, "contracts/script/stocks.base.json"), "utf8"));
const SKIP = new Set(["LITE", "AAOI", "BRK.B"]); // pools that barely trade
const stocks = list.stocks.filter((s) => !SKIP.has(s.symbol));
const USDC = list.usdc;
const erc20 = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function balanceOfUI(address) view returns (uint256)",
]);

// Test addresses (no keys needed: the simulation runs with validation off).
const DEPLOYER = "0x7e57000000000000000000000000000000000001";
const MANAGERS = [
  "0x7e57000000000000000000000000000000000a11",
  "0x7e57000000000000000000000000000000000b0b",
  "0x7e57000000000000000000000000000000000ca7",
  "0x7e57000000000000000000000000000000000da7",
];
const TEAMS = ["Ape Capital", "Diamond Hands", "Bagholders FC", "Theta Gang"];
const PICK_LIST = ["NVDA", "TSLA", "AMZN", "HOOD", "PLTR", "AAPL", "META", "MSTR"];
const WHALE_BUYS = "HOOD"; // an outside buyer pumps this stock in week 1
const WHALE_USDC = 25_000n * 10n ** 6n;
const WEEK = 3600; // shortest week the factory allows
const CONFIG = {
  entryFee: 25n * 10n ** 6n, maxManagers: 4, rosterSize: 2, seasonWeeks: 2,
  weekLength: WEEK, pickWindow: 60, treasuryStock: stocks.findIndex((s) => s.symbol === "NVDA"),
};

const factoryAddr = getContractAddress({ from: DEPLOYER, nonce: 0n });
const whaleAddr = getContractAddress({ from: DEPLOYER, nonce: 1n });
const leagueAddr = getContractAddress({ from: factoryAddr, nonce: 1n });
const sym = (id) => stocks[Number(id)].symbol;

async function rpc(method, params) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(RPC, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }).then((r) => r.json()).catch((e) => ({ error: { message: String(e) } }));
    if (!res.error) return res.result;
    if (attempt === 2) throw new Error(`${method}: ${res.error.message}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

const usdcSlot = (who) => keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [who, 9n]));
const call = (from, to, abi, functionName, args = [], label) =>
  ({ from, to, data: encodeFunctionData({ abi, functionName, args }), gas: toHex(15_000_000), label, abi, functionName });
const leagueCall = (from, fn, args, label) => call(from, leagueAddr, League.abi, fn, args, label);

function setupBlock(base) {
  const overrides = {
    [DEPLOYER]: { balance: toHex(10n ** 18n) },
    [whaleAddr]: { balance: toHex(10n ** 18n) },
    [USDC]: { stateDiff: Object.fromEntries([
      ...MANAGERS.map((m) => [usdcSlot(m), toHex(1_000n * 10n ** 6n, { size: 32 })]),
      [usdcSlot(whaleAddr), toHex(WHALE_USDC, { size: 32 })],
    ]) },
  };
  for (const m of MANAGERS) overrides[m] = { balance: toHex(10n ** 18n) };
  const calls = [
    { from: DEPLOYER, data: encodeDeployData({ abi: Factory.abi, bytecode: Factory.bytecode.object,
      args: [USDC, stocks.map((s) => s.token), stocks.map((s) => s.pool)] }), gas: toHex(25_000_000), label: "deploy LeagueFactory" },
    { from: DEPLOYER, data: Whale.bytecode.object, gas: toHex(2_000_000), label: "deploy SimWhale (dry-run only)" },
    call(MANAGERS[0], factoryAddr, Factory.abi, "createLeague", ["Dry Run League", CONFIG], "createLeague"),
  ];
  MANAGERS.forEach((m, i) => {
    calls.push(call(m, USDC, erc20, "approve", [leagueAddr, CONFIG.entryFee], `approve ${TEAMS[i]}`));
    calls.push(leagueCall(m, "join", [TEAMS[i]], `join ${TEAMS[i]}`));
  });
  calls.push(leagueCall(MANAGERS[0], "startDraft", [], "startDraft"));
  calls.push(leagueCall(DEPLOYER, "draftOrder", [], "view draftOrder"));
  return { blockOverrides: { time: toHex(base.time + 2), prevRandao: keccak256(toHex("hostile-dry-run")) }, stateOverrides: overrides, calls };
}

function snakeSeats(order, rounds) {
  const seats = [];
  for (let r = 0; r < rounds; r++) seats.push(...(r % 2 === 0 ? order : [...order].reverse()));
  return seats;
}

async function simulate(blockNumber, blocks) {
  const strip = (b) => ({ ...b, calls: b.calls.map(({ label, abi, functionName, ...c }) => c) });
  return rpc("eth_simulateV1", [{ blockStateCalls: blocks.map(strip), validation: false, traceTransfers: false }, blockNumber]);
}

function check(blocks, results) {
  results.forEach((r, bi) => r.calls.forEach((c, ci) => {
    if (c.status !== "0x1") {
      const label = blocks[bi].calls[ci].label;
      throw new Error(`${label} failed: ${c.error?.message || c.returnData}`);
    }
  }));
}

function decodeView(blocks, results, label) {
  for (let bi = 0; bi < blocks.length; bi++) {
    const ci = blocks[bi].calls.findIndex((c) => c.label === label);
    if (ci >= 0) {
      const c = blocks[bi].calls[ci];
      return decodeFunctionResult({ abi: c.abi, functionName: c.functionName, data: results[bi].calls[ci].returnData });
    }
  }
}

function leagueEvents(results) {
  const out = [];
  for (const b of results) for (const c of b.calls) for (const log of c.logs || []) {
    if (log.address.toLowerCase() !== leagueAddr.toLowerCase()) continue;
    try { out.push(decodeEventLog({ abi: League.abi, data: log.data, topics: log.topics })); } catch {}
  }
  return out;
}

const fmtShares = (x) => formatUnits(x, 8);
const fmtUsd = (x) => formatUnits(x, 6);

async function main() {
  const latest = await rpc("eth_getBlockByNumber", ["latest", false]);
  const base = { number: latest.number, time: Number(latest.timestamp) };
  console.log(`Base mainnet block ${Number(base.number)} (${new Date(base.time * 1000).toISOString()}), ${stocks.length} stocks in the list`);

  // Pass 1: set up and start the draft to learn the shuffled order.
  const b1 = setupBlock(base);
  const r1 = await simulate(base.number, [b1]);
  check([b1], r1);
  const order = decodeView([b1], r1, "view draftOrder").map(Number);
  console.log(`Draft order (round 1): ${order.map((s) => TEAMS[s]).join(" → ")}`);

  // Pass 2: the full season.
  const t0 = base.time + 2;
  const seats = snakeSeats(order, CONFIG.rosterSize);
  const b2 = { blockOverrides: { time: toHex(t0 + 2) }, calls: seats.map((seat, p) =>
    leagueCall(MANAGERS[seat], "pick", [BigInt(stocks.findIndex((s) => s.symbol === PICK_LIST[p])), 0n], `pick ${p + 1}: ${TEAMS[seat]} takes ${PICK_LIST[p]}`)) };
  const whaleStock = stocks.find((s) => s.symbol === WHALE_BUYS);
  const b3 = { blockOverrides: { time: toHex(t0 + 2 + 20 * 60) }, calls: [
    call(whaleAddr, whaleAddr, Whale.abi, "buy", [whaleStock.pool, USDC, WHALE_USDC], `outside buyer spends $${fmtUsd(WHALE_USDC)} on ${WHALE_BUYS}`),
  ] };
  const b4 = { blockOverrides: { time: toHex(t0 + 2 + WEEK + 300) }, calls: [leagueCall(DEPLOYER, "settleWeek", [], "settle week 1")] };
  const b5 = { blockOverrides: { time: toHex(t0 + 2 + 2 * WEEK + 300) }, calls: [leagueCall(DEPLOYER, "settleWeek", [], "settle week 2 (season ends)")] };
  // Read back what each wallet holds, with the dividend-adjusted balance too.
  for (const [i, m] of MANAGERS.entries()) {
    for (const s of PICK_LIST.concat(["NVDA"]).filter((v, k, a) => a.indexOf(v) === k)) {
      const tok = stocks.find((x) => x.symbol === s).token;
      b5.calls.push(call(m, tok, erc20, "balanceOf", [m], `bal ${i} ${s}`));
      b5.calls.push(call(m, tok, erc20, "balanceOfUI", [m], `ui ${i} ${s}`));
    }
  }
  b5.calls.push(leagueCall(DEPLOYER, "champion", [], "view champion"));

  const blocks = [b1, b2, b3, b4, b5];
  const res = await simulate(base.number, blocks);
  check(blocks, res);

  const gas = {};
  blocks.forEach((b, bi) => b.calls.forEach((c, ci) => { if (!c.label.startsWith("bal") && !c.label.startsWith("ui") && !c.label.startsWith("view")) gas[c.label] = Number(res[bi].calls[ci].gasUsed); }));
  const events = leagueEvents(res);
  const record = { network: "base-mainnet (simulated with eth_simulateV1)", pinnedBlock: Number(base.number), pinnedTime: new Date(base.time * 1000).toISOString(), rpc: RPC.replace(/\/\/.*@/, "//"), config: { ...CONFIG, entryFee: fmtUsd(CONFIG.entryFee) }, picks: [], treasury: null, weeks: [], slices: [], released: [], champion: null, holdings: [], gas };

  for (const e of events) {
    const a = e.args;
    if (e.eventName === "Picked") record.picks.push({ pick: Number(a.pick) + 1, team: TEAMS[Number(a.seat)], stock: sym(a.stockId), usdcIn: fmtUsd(a.usdcIn), shares: fmtShares(a.sharesOut), pricePerShare: (Number(a.usdcIn) / 1e6 / (Number(a.sharesOut) / 1e8)).toFixed(2) });
    if (e.eventName === "TreasuryBought") record.treasury = { stock: sym(a.stockId), usdcIn: fmtUsd(a.usdcIn), shares: fmtShares(a.sharesOut) };
    if (e.eventName === "MatchSettled") record.weeks.push({ week: Number(a.week) + 1, home: TEAMS[Number(a.seatA)], away: TEAMS[Number(a.seatB)], homeScoreTicks: Number(a.scoreA), awayScoreTicks: Number(a.scoreB), winner: a.winner < 0n ? "tie" : TEAMS[Number(a.winner)] });
    if (e.eventName === "SliceSent") record.slices.push({ week: Number(a.week) + 1, stock: sym(a.stockId), from: TEAMS[Number(a.fromSeat)], toWallet: a.to, toTeam: TEAMS[MANAGERS.findIndex((m) => m.toLowerCase() === a.to.toLowerCase())], shares: fmtShares(a.amount), delivered: a.delivered });
    if (e.eventName === "BagReleased") record.released.push({ team: TEAMS[Number(a.seat)], stock: sym(a.stockId), shares: fmtShares(a.amount), delivered: a.delivered });
    if (e.eventName === "SeasonFinished") record.champion = { team: TEAMS[Number(a.championSeat)], wallet: a.champion, treasuryShares: fmtShares(a.treasuryShares) };
  }
  for (const [i] of MANAGERS.entries()) {
    for (const s of PICK_LIST.concat(["NVDA"]).filter((v, k, a) => a.indexOf(v) === k)) {
      const raw = decodeView(blocks, res, `bal ${i} ${s}`);
      const ui = decodeView(blocks, res, `ui ${i} ${s}`);
      if (raw > 0n) record.holdings.push({ team: TEAMS[i], stock: s, shares: fmtShares(raw), dividendAdjusted: fmtShares(ui) });
    }
  }

  console.log("\nDraft (each pick is a real Aerodrome buy):");
  for (const p of record.picks) console.log(`  #${p.pick} ${p.team.padEnd(14)} ${p.stock.padEnd(5)} $${p.usdcIn} → ${p.shares} shares (~$${p.pricePerShare}/share)`);
  console.log(`  Treasury: $${record.treasury.usdcIn} → ${record.treasury.shares} ${record.treasury.stock}`);
  console.log(`\nOutside buyer pushes ${WHALE_BUYS} during week 1.`);
  for (const w of record.weeks) console.log(`Week ${w.week}: ${w.home} ${w.homeScoreTicks} vs ${w.awayScoreTicks} ${w.away} → ${w.winner}`);
  console.log("\nSlices (loser → winner's wallet, real B20 transfers):");
  for (const s of record.slices) console.log(`  week ${s.week}: ${s.shares} ${s.stock} from ${s.from} to ${s.toTeam} (${s.delivered ? "delivered" : "owed"})`);
  console.log(`\nChampion: ${record.champion.team}, takes ${record.champion.treasuryShares} ${record.treasury.stock} treasury`);
  console.log("Wallets after the season (raw / dividend-adjusted):");
  for (const h of record.holdings) console.log(`  ${h.team.padEnd(14)} ${h.stock.padEnd(5)} ${h.shares} / ${h.dividendAdjusted}`);
  console.log("\nGas used:", Object.entries(gas).filter(([k]) => /deploy|create|pick 1:|settle|join Ape/.test(k)).map(([k, v]) => `${k}=${v}`).join(", "));

  mkdirSync(join(root, "evidence"), { recursive: true });
  const file = join(root, "evidence", `dry-run-${Number(base.number)}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2));
  console.log(`\nSaved ${file.replace(root + "/", "")}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
