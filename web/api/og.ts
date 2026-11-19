/** GET /api/og : the share card for a league, as a 1200×630 PNG.
 *
 *    /api/og                                    the site's own card
 *    /api/og?league=0x…                         the league, whatever stage it is in
 *    /api/og?league=0x…&card=team&seat=2        one manager's squad
 *    /api/og?league=0x…&card=match&seat=2       that manager's match this week (live scores)
 *    /api/og?league=0x…&card=match&seat=2&week=0   a settled week's final result
 *
 *  Every number is read from Base when the picture is drawn, with the same code the app uses
 *  (src/lib/leagueRead.ts). Only leagues made by the Hostile factory get a league card; anything
 *  else, or a failed read, falls back to the site card. Nothing in the query string is drawn
 *  except as an address, a seat number or a week number to look up. */
import { createPublicClient, fallback, getAddress, http, isAddress } from "viem";
import { base } from "viem/chains";
import { LeagueAbi } from "../src/abi/League";
import { LeagueFactoryAbi } from "../src/abi/LeagueFactory";
import { FACTORY } from "../src/lib/addresses";
import { type LeagueState, type Reader, applyQueuedCaptains, readLeague } from "../src/lib/leagueRead";
import { type Node, leagueCard, matchCard, siteCard, teamCard } from "../src/share/cards";
import { renderCard } from "../src/share/render";

export const config = { runtime: "edge" };

declare const process: { env?: Record<string, string | undefined> } | undefined;

/** VITE_RPC points the local dev server at a fork, the same variable the app uses. */
const forkRpc = typeof process !== "undefined" ? process?.env?.VITE_RPC : undefined;
const transport = forkRpc ? http(forkRpc) : fallback([http("https://base-rpc.publicnode.com"), http("https://mainnet.base.org")]);

const intParam = (v: string | null) => (v !== null && /^\d{1,3}$/.test(v) ? Number(v) : undefined);

async function pick(q: URLSearchParams, origin: string): Promise<{ card: Node; maxAge: number }> {
  const raw = q.get("league");
  if (!raw || !isAddress(raw)) return { card: siteCard(origin), maxAge: 86_400 };
  const address = getAddress(raw);
  const client = createPublicClient({ chain: base, transport, batch: { multicall: true } }) as Reader;
  const ours = await client.readContract({ address: FACTORY, abi: LeagueFactoryAbi, functionName: "isLeague", args: [address] });
  if (!ours) return { card: siteCard(origin), maxAge: 300 };

  const L: LeagueState = await applyQueuedCaptains(client, await readLeague(client, address));
  const seat = intParam(q.get("seat"));
  const m = seat !== undefined ? L.managers[seat] : undefined;
  const kind = q.get("card");

  if (kind === "team" && m && m.roster.length) return { card: teamCard(L, m, origin), maxAge: 60 };

  if (kind === "match" && m && L.phase >= 2) {
    const week = intParam(q.get("week")) ?? Math.min(L.weeksSettled, L.config.seasonWeeks - 1);
    if (week < L.weeksSettled) {
      // A settled week: the pairing and both scores are final on chain.
      const [has, opp] = await client.readContract({ address, abi: LeagueAbi, functionName: "opponentOf", args: [BigInt(m.seat), BigInt(week)] });
      const b = has ? L.managers[Number(opp)] : undefined;
      if (b) return { card: matchCard(L, { week, a: m, b, scoreA: m.weekScores[week], scoreB: b.weekScores[week], final: true }, origin), maxAge: 86_400 };
    } else if (week === L.weeksSettled && L.phase === 2 && m.opponent !== undefined) {
      const b = L.managers[m.opponent];
      return { card: matchCard(L, { week, a: m, b, scoreA: m.liveScore, scoreB: b.liveScore, final: false }, origin), maxAge: 60 };
    }
  }
  return { card: leagueCard(L, origin), maxAge: 60 };
}

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let chosen: { card: Node; maxAge: number };
  try {
    chosen = await pick(url.searchParams, url.origin);
  } catch (e) {
    console.error("og: league read failed", e);
    chosen = { card: siteCard(url.origin), maxAge: 30 };
  }
  try {
    return await renderCard(chosen.card, chosen.maxAge);
  } catch (e) {
    // Never hand a link preview an empty picture: fall back to the site's ready-made card.
    console.error("og: drawing failed", e);
    return Response.redirect(`${url.origin}/og.png`, 302);
  }
}
