// Keeper: keeps Hostile leagues moving when nobody presses the button.
//
// It only calls the two functions that anyone is allowed to call (League.sol):
//   autopick()   when a manager's pick clock has run out
//   settleWeek() when a matchup week has ended
// It has no special rights and never holds anyone's money: the wallet only pays gas.
//
//   node tools/keeper.mjs            watch every league from the factory, forever
//   node tools/keeper.mjs --once     one pass, then exit
//
// Env:
//   KEEPER_KEY     private key of a wallet with a little ETH on Base. Without it the keeper
//                  runs in watch-only mode: it reports what is due and sends nothing.
//   BASE_RPC       RPC URL (default https://mainnet.base.org)
//   FACTORY        LeagueFactory address (default: the mainnet deployment)
//   INTERVAL       seconds between passes (default 60)
//   GRACE          extra seconds a manager gets after their pick clock before the keeper
//                  autopicks for them (default 60)
//   BUILDER_CODE   optional Base Builder Code to tag the keeper's transactions with

import { createPublicClient, createWalletClient, http, parseAbi, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { Attribution } from "ox/erc8021";

const RPC = process.env.BASE_RPC || "https://mainnet.base.org";
const FACTORY = process.env.FACTORY || "0xde8bEbCeeAC160DeC0C09C2286a1d29a564ee997";
const INTERVAL = Number(process.env.INTERVAL || 60);
const GRACE = BigInt(process.env.GRACE || 60);
const ONCE = process.argv.includes("--once");
const MAX_ACTIONS_PER_PASS = 12; // a league with many expired picks catches up over several passes

const factoryAbi = parseAbi(["function leagues() view returns (address[])"]);
const leagueAbi = parseAbi([
  "function name() view returns (string)",
  "function phase() view returns (uint8)",
  "function pickDeadline() view returns (uint256)",
  "function pickNumber() view returns (uint256)",
  "function seasonStart() view returns (uint256)",
  "function weeksSettled() view returns (uint256)",
  "function config() view returns (uint256 entryFee, uint8 maxManagers, uint8 rosterSize, uint8 seasonWeeks, uint32 weekLength, uint32 pickWindow, uint8 treasuryStock)",
  "function autopick()",
  "function settleWeek()",
]);
const DRAFTING = 1, SEASON = 2, FINISHED = 3;

const pub = createPublicClient({ chain: base, transport: http(RPC) });
const account = process.env.KEEPER_KEY ? privateKeyToAccount(process.env.KEEPER_KEY) : undefined;
const wallet = account
  ? createWalletClient({
      account, chain: base, transport: http(RPC),
      dataSuffix: process.env.BUILDER_CODE ? Attribution.toDataSuffix({ codes: [process.env.BUILDER_CODE] }) : undefined,
    })
  : undefined;

const log = (...a) => console.log(new Date().toISOString().slice(0, 19) + "Z", ...a);
/** The first two lines of a viem error: what failed, and the contract's reason if it gave one. */
const why = (e) => (e.shortMessage || e.message || String(e)).split("\n").slice(0, 2).join(" ").trim();
const finished = new Set(); // leagues that are over never need another look

/** What a league needs right now, from its own state and the chain's clock. */
export function dueAction({ phase, pickDeadline, seasonStart, weeksSettled, weekLength }, now, grace = GRACE) {
  if (phase === DRAFTING && now > pickDeadline + grace) return "autopick";
  if (phase === SEASON && now >= seasonStart + (weeksSettled + 1n) * weekLength) return "settleWeek";
  return null;
}

async function readLeague(address) {
  const c = { address, abi: leagueAbi };
  const [name, phase, pickDeadline, pickNumber, seasonStart, weeksSettled, config] = await pub.multicall({
    allowFailure: false,
    contracts: [
      { ...c, functionName: "name" }, { ...c, functionName: "phase" }, { ...c, functionName: "pickDeadline" },
      { ...c, functionName: "pickNumber" }, { ...c, functionName: "seasonStart" }, { ...c, functionName: "weeksSettled" },
      { ...c, functionName: "config" },
    ],
  });
  return { address, name, phase, pickDeadline, pickNumber, seasonStart, weeksSettled, weekLength: BigInt(config[4]) };
}

async function act(league, fn) {
  const label = `${league.name} (${league.address.slice(0, 8)}…) ${fn}`;
  // Ask the node first. A revert here is normal (someone else got there first, or the price
  // guard refuses the buy right now), so we skip and look again on the next pass.
  try {
    await pub.simulateContract({ address: league.address, abi: leagueAbi, functionName: fn, account: account?.address });
  } catch (e) {
    log(`skip  ${label}: ${why(e)}`);
    return false;
  }
  if (!wallet) {
    log(`due   ${label} (watch-only: set KEEPER_KEY to send it)`);
    return false;
  }
  const hash = await wallet.writeContract({ address: league.address, abi: leagueAbi, functionName: fn });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  log(`${receipt.status === "success" ? "sent " : "FAIL "} ${label} https://basescan.org/tx/${hash}`);
  return receipt.status === "success";
}

async function pass() {
  const [block, leagues] = await Promise.all([
    pub.getBlock({ blockTag: "latest" }),
    pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "leagues" }),
  ]);
  const now = block.timestamp;
  let actions = 0, open = 0;
  for (const address of leagues) {
    if (finished.has(address)) continue;
    let league = await readLeague(address);
    if (league.phase === FINISHED) { finished.add(address); continue; }
    open++;
    // One league can owe several actions in a row (a run of expired picks, or weeks nobody settled).
    for (let fn = dueAction(league, now); fn && actions < MAX_ACTIONS_PER_PASS; fn = dueAction(league, now)) {
      actions++;
      if (!(await act(league, fn))) break;
      league = await readLeague(address);
      if (league.phase === FINISHED) { finished.add(address); break; }
    }
  }
  return { leagues: leagues.length, open, actions };
}

async function main() {
  log(`keeper on ${RPC}, factory ${FACTORY}`);
  if (account) {
    const bal = await pub.getBalance({ address: account.address });
    log(`sending from ${account.address} (${formatEther(bal)} ETH for gas)`);
    if (bal === 0n) log("warning: that wallet has no ETH on Base, so nothing can be sent");
  } else log("watch-only: no KEEPER_KEY set, nothing will be sent");

  for (;;) {
    try {
      const r = await pass();
      log(`pass: ${r.leagues} leagues, ${r.open} open, ${r.actions} due`);
    } catch (e) {
      log(`pass failed: ${why(e)}`);
    }
    if (ONCE) return;
    await new Promise((r) => setTimeout(r, INTERVAL * 1000));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
