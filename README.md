# Hostile — a fantasy stock league where every pick is a real share, and the loser hands 10% to the winner

**Live:** [hostile.nerom.site](https://hostile.nerom.site) (blocked for US visitors) · **Video:** not recorded yet · **Built at:** Base Stocks Maxxing Season, Nov 5 – Dec 5 2026 (Track 1: Meme & Community Economies, Stonks Exchange partner prize)

**Contracts (Base mainnet, source verified):** [LeagueFactory `0xde8b…e997`](https://basescan.org/address/0xde8bEbCeeAC160DeC0C09C2286a1d29a564ee997) · [LeagueCoins `0xf84A…70D6`](https://basescan.org/address/0xf84A05F17545f52914c82eB89b8aDb52e02770D6) ([Sourcify](https://repo.sourcify.dev/8453/0xde8bEbCeeAC160DeC0C09C2286a1d29a564ee997), [deploy record](evidence/deployments.base.json))

**Proof so far:** a whole season played against real Base mainnet state at block 58992480, with no money spent ([evidence/dry-run-58992480.json](evidence/dry-run-58992480.json)). In it:
- 8 draft picks bought real Coinbase stock tokens on Aerodrome.
- A league coin launched on the real Stonks Exchange launcher, and its trading fees added 0.0876 NVDA to the champion's prize.
- 4 weekly slices moved real shares to winners' wallets.

No league has been played on mainnet yet (see [Not built yet](#not-built-yet)).

## For judges: verify in 2 minutes

| Do this | You see |
|---|---|
| Open [hostile.nerom.site](https://hostile.nerom.site) (no wallet needed) | The 25 draftable stocks with prices read live from their Aerodrome pools; each stock's mascot hops or sulks with its real 30-minute move |
| `cd contracts && forge test` | 25 passing tests: draft buys, TWAP guards, slices, captain lock, byes, blocked wallets, league coin fees |
| `cd contracts && forge build && cd .. && node tools/live-dry-run.mjs` | A full season on today's Base mainnet state: real buys, real price reads, a real Stonks Exchange coin launch and fee harvest, real B20 transfers, saved to `evidence/` |
| Open [evidence/dry-run-58992480.json](evidence/dry-run-58992480.json) | Picks with the price paid per share, the league coin and its harvest, week results, slices, the champion, and the final wallets (raw and dividend-adjusted balances) |

## Claims (each one checkable today)

| Claim | Where in code | Check |
|---|---|---|
| A draft pick buys the stock on Aerodrome with USDC, at once | `contracts/src/League.sol:212` `pick` → `:263` `_buy` | test `test_draft_is_snake_order_and_each_pick_is_a_real_buy`, dry run "Draft" |
| A buy is refused while the price is off its 30-min TWAP (anti-manipulation) | `contracts/src/League.sol:267` | test `test_buy_refused_while_price_is_off_its_twap` |
| A buy is refused if it would move the price more than ~3% | `contracts/src/League.sol:283` | test `test_buy_refused_when_it_moves_price_too_far` |
| Only the pool being traded can collect USDC | `contracts/src/League.sol:290` | test `test_swap_callback_only_from_the_active_pool` |
| A pool must really trade that stock against USDC, checked onchain | `contracts/src/League.sol:138` | test `test_league_rejects_a_pool_that_is_not_stock_usdc` |
| Absent managers get autopicked after their clock runs out | `contracts/src/League.sol:220` | test `test_autopick_only_after_the_clock_runs_out` |
| 2% rake buys the treasury stock when the draft ends | `contracts/src/League.sol:242`, `:245` | test `test_draft_close_buys_treasury_and_marks_prices` |
| Scores come from each pool's TWAP at the exact week end, not when someone settles | `contracts/src/League.sol:377`, `contracts/src/lib/PoolPrice.sol:24` | test `test_late_settle_uses_price_at_week_end_not_now` |
| Loser sends 10% of each holding to the winner's wallet | `contracts/src/League.sol:387` | test `test_week_winner_gets_ten_percent_of_loser_shares_in_wallet`, dry run "Slices" |
| Captain counts double; a change only starts next week | `contracts/src/League.sol:348`, `:311` | test `test_captain_change_waits_for_next_week` |
| A wallet on the stock's blocklist can't stall the league: shares are held for it, claimable to any wallet | `contracts/src/League.sol:430`, `:438` | test `test_blocked_winner_is_owed_and_claims_to_another_wallet` |
| Season end: champion gets the treasury, everyone's bag goes home | `contracts/src/League.sol:405` | test `test_full_season_sends_bags_home_and_champion_takes_treasury` |
| B20 stock tokens have no bytecode, so a call only counts if it returns `true` | `contracts/src/lib/TokenTransfer.sol:9` | the dry run against real B20 tokens |
| A commissioner launches the league coin on Stonks Exchange, priced in the treasury stock, with `LeagueCoins` as fee owner | `contracts/src/LeagueCoins.sol:54`, `:79` | test `test_commissioner_launches_coin_priced_in_treasury_stock`, dry run "League coin" |
| Coin fees: the stock side goes into the league treasury, the coin side is burned | `contracts/src/LeagueCoins.sol:89`, `:104`, `:111` → `contracts/src/League.sol:299` | test `test_harvest_adds_stock_fees_to_treasury_and_burns_coin_fees`, dry run treasury 0.0125 → 0.1000 NVDA |
| After the season, coin fees go straight to the champion | `contracts/src/LeagueCoins.sol:114` | test `test_champion_takes_the_whole_treasury_and_later_fees_go_straight_to_them` |
| The app reads every league, price and score from Base; nothing is stored off-chain | `web/src/lib/league.ts:99` `loadLeague` | open any page; the RPC calls are in the network tab |
| Live scores in the app use the same 30-minute pool TWAP as the contract, labelled as estimates until settled | `web/src/lib/league.ts:180`, `web/src/pages/League.tsx:281` | compare with `weekScore` after `settleWeek` |
| Each button sends one real transaction and links it on BaseScan | `web/src/components/Tx.tsx:17`, `:61` | any join, pick or settle |
| US visitors get a notice instead of the app | `web/middleware.js:5` | open the site from a US IP: HTTP 451 |

## Judging criteria

The [official rules](https://www.base.org/stocksmaxxing/rules) say judges score "against the criteria included on the Quest Page", weighted equally unless the Quest Page sets weights. The [Quest Page](https://www.base.org/stocksmaxxing) gives the track briefs and entry rules below and no separate weights, so we answer each one.

| From the event | Where we meet it |
|---|---|
| Track 1: "Build new ways to organize memes and communities around tokenized equities." | A friend group becomes a league that owns real stock tokens together. Each league can launch its own coin on Stonks Exchange, priced in a stock, and fans who trade it grow the league's prize in real shares (`contracts/src/LeagueCoins.sol`). |
| "Ship a demonstrable stock-linked product or feature during the season" | Factory and LeagueCoins live on Base mainnet (Nov 18), app live at hostile.nerom.site, first commit Nov 17. Every action is a stock-token buy or transfer. |
| Stonks Exchange (launchpad partner) | League coins launch through Stonks' real launcher with `LeagueCoins` as fee owner; tested on real mainnet state in the dry run. |
| "A public post on X that includes a video demo" | Not done yet: the video and post come after the first real league. |
| Build-in-public award | Not done yet: no progress posts on X so far. |
| Eligibility: apps that let US users trade are ineligible | Edge middleware blocks US visitors (`web/middleware.js:5`). |

## What's real

| Part | Status | Proof |
|---|---|---|
| LeagueFactory (25 stocks) and LeagueCoins | **live on Base mainnet**, source verified (Sourcify exact match). No league created yet | [factory deploy tx](https://basescan.org/tx/0xa60e7451335d386f5b2fa089c7af5a873fb7dcd9d4f24835794a200cf9532674) · [LeagueCoins deploy tx](https://basescan.org/tx/0xa6fdf361ac0b51bcc95731629159b87f1ee78f450ef5af652074ec71779d21cb) |
| Web app | **live** at [hostile.nerom.site](https://hostile.nerom.site) (Vercel), reads Base mainnet directly: no backend, no database. Home, lobby, join and draft room checked; the season and final screens have not run with a real league yet | `web/src/lib/league.ts` |
| Buying stocks, reading TWAPs, moving shares, launching and harvesting a league coin on Stonks Exchange | run against **real Base mainnet state and the real Stonks Exchange contracts** with `eth_simulateV1` (no money moved) | `tools/live-dry-run.mjs`, `evidence/` |
| Test mocks | **simulated**: `contracts/test/mocks/` replace the stock tokens, pools and Stonks Exchange in unit tests, because Coinbase's B20 tokens are precompiles that a local fork can't run | the dry run covers the real contracts instead |
| `SimWhale` | **dry-run only**, never deployed: an outside trader that moves one price and trades the league coin inside the simulation | `contracts/script/SimWhale.sol` |
| Stock mascots | **AI-generated art** (Higgsfield), one per stock; the mood comes from real price moves | `web/public/mascots/CREDITS.md`, `web/src/components/Mascot.tsx` |

## The problem

Fantasy stock games run on paper points, so losing costs nothing and winning pays nothing. Real-money stock bets between friends need someone to hold the money and trust them to pay out. Hostile makes the stakes real shares, held and paid by a contract nobody controls, scored by onchain prices nobody sets.

## How it works

1. **Join.** Friends open a league and each pays the entry fee in USDC, for example $25 (`League.sol:149` `join`).
2. **Draft.** The draft runs snake order, 1-2-3-4 then 4-3-2-1. **Each pick buys that stock right then** on its Aerodrome pool (`League.sol:212` → `:263`). The league contract holds the shares, and no two managers can own the same stock.
3. **Rake.** 2% of the entries buys a stock into the league treasury (`League.sol:242`).
4. **Weekly matchups.** Every week, managers play head to head (`League.sol:331` `settleWeek`, which anyone can call).
   - **Score:** how much each stock's price moved, read from Aerodrome's onchain price history (30-minute TWAP, `lib/PoolPrice.sol`). +100 ≈ +1%.
   - **Captain:** your captain stock counts twice.
5. **The loser pays.** The loser sends **10% of every share they hold to the winner's wallet** (`League.sol:387`). It's a real transfer of stock tokens.
6. **Season end.** The champion takes the treasury, and every manager's remaining shares go to their own wallet (`League.sol:405`). You keep your stocks.

### League coin (optional)

- **Launch.** A league's commissioner can launch the league's own coin on **Stonks Exchange**, a Stocks Maxxing launchpad partner. The coin is priced in the league's treasury stock, for example a coin that trades against NVDA.
  - The coin's whole supply is locked in an Aerodrome Slipstream pool forever. Only trading fees come out.
- **Fee owner.** Our `LeagueCoins` contract owns the coin's fees. No person does.
- **Harvest.** Anyone can trigger it:
  - The **stock side of the fees goes into the league treasury**. Fans who trade a league's coin grow that league's prize in real shares.
  - The coin side is burned.
  - After the season ends, fees go straight to the champion.

### Architecture

```
 browser (web/, Vite + React + wagmi/viem)
   │  reads: multicall to Base (leagues, pool TWAPs, balances)      no backend, no database
   │  writes: one wallet tx per button → BaseScan link
   ▼
 LeagueFactory ──creates──▶ League (one per friend group)
                              │ swap USDC → stock     ─▶ Aerodrome Slipstream stock/USDC pools
                              │ observe() TWAP ticks  ─▶ same pools (scores, buy guards)
                              │ transfer shares       ─▶ Coinbase B20 stock tokens (precompiles)
 LeagueCoins ──launch/harvest─▶ Stonks Exchange launcher + locker ─▶ fees → League.fundTreasury
```

## Sponsor integrations

| Sponsor | Core primitive we use | Where | Why it needs this |
|---|---|---|---|
| **Base / Coinbase tokenized stocks (B20)** | The stock tokens themselves: the league holds them, slices move them, the champion receives them | `contracts/src/lib/TokenTransfer.sol:9` (B20-safe transfer), `League.sol:387`, `:405`, `:430` | The prize *is* the shares. B20 tokens are precompiles with a transfer blocklist, so transfers check the return value and blocked wallets get an IOU (`claim`, `League.sol:438`) |
| **Aerodrome Slipstream** | Swaps for every pick and the rake; `observe()` TWAP for scoring and for the anti-manipulation guards | `League.sol:263`–`:290`, `lib/PoolPrice.sol:24`, `web/src/lib/league.ts:180` | It's where the liquid stock/USDC pools are (28 pools over $100K, `contracts/script/stocks.base.json`), and its onchain price history means nobody, including us, sets the score |
| **Stonks Exchange** (partner prize) | Launcher for each league's coin, priced in a stock; locker that pays trading fees to `LeagueCoins` | `contracts/src/LeagueCoins.sol:54`, `:79`, `:89` | Turns a league into a community token whose fees buy the league's prize in real shares |

## Trust model

- **No admin over funds.** No one can set prices, move shares or pause a league, including the commissioner and the deployer.
- **The commissioner** can only start the draft early. A full league starts on its own.
- **The factory owner** can only edit the stock list that new leagues copy when they are created. Existing leagues keep their own list.
- **Draft order** is shuffled with Base's `prevrandao`. On an L2 the sequencer could influence that.
- **Coinbase controls each stock's transfer policy.** Today all 28 liquid stocks use policy 5, a blocklist, and contracts are allowed. If Coinbase blocks a wallet, that wallet's shares wait in the league and can be claimed to another wallet. If Coinbase blocks the league contract itself, its shares are stuck until Coinbase unblocks it. We can't prevent that.
- **US users** are not allowed to trade under the event rules. The app's edge middleware blocks US visitors (`web/middleware.js`). The contracts themselves are open, like any contract on Base.
- **League coins rely on Stonks Exchange.**
  - The coin's liquidity is locked for good in Stonks' locker, which can't be upgraded.
  - Stonks keeps 25–30% of trading fees (set per tier when the coin launches).
  - Stonks' owner can reassign a coin's fee owner after an announced 24-hour wait. Stonks can also replace its launcher, which only affects coins launched after the change.
  - `LeagueCoins` itself has no owner.

## Not built yet

- The first real league on mainnet (the contracts are live; no league has been played yet).
- The demo video and the X post.
- Share cards for X.
- Keeper that settles weeks and autopicks (today anyone can call `settleWeek` and `autopick`).
- Builder Code attribution on the app's transactions.
- Trades between managers, Weekend Cup, an AI rival manager, yield on held stocks (Aave V4).

## Why these choices

- **The draft list is the 25 most liquid stocks.**
  - Of 377 Coinbase stock tokens on Base, only 28 have an Aerodrome USDC pool over $100K. We left out 3 that barely trade (`contracts/script/stocks.base.json`, measured Nov 17 2026).
  - A $5K buy moves NVDA about 0.03%.
- **We score on the DEX, not Coinbase's reference price.** Aerodrome prices ran about 1.2% above Coinbase's NAV on Nov 17. Buying on the DEX and scoring on NAV would start every manager at a loss.
- **We score in ticks, not dollars.** A tick difference is a log return, so no price math or oracle trust is needed onchain.

## Run it

```bash
git clone --recursive https://github.com/neromtoobad/hostile && cd hostile
cd contracts && forge test                     # unit tests
forge build && cd ../tools && npm ci && cd ..
node tools/live-dry-run.mjs                    # full season on real Base state, free
cd web && npm ci && npm run dev                # the app, against Base mainnet
```

To try the app with no real money, run `anvil --fork-url https://mainnet.base.org --port 8547` and start the app with `VITE_RPC=http://127.0.0.1:8547 npm run dev`. It shows a "local fork" banner. Draft picks can't run on a fork, because B20 stock tokens are precompiles.

Deploy (needs a little ETH on Base in the `.env` wallet; `.env.example` lists every variable):

```bash
cd contracts && source ../.env && forge script script/Deploy.s.sol --rpc-url base --broadcast --private-key $PRIVATE_KEY
```

## Built at the event

- **First commit:** Nov 17 2026 (`16e035e`), inside the Nov 5 – Dec 5 window. All contracts, tests, tools and the web app were written for this event.
- **Libraries:** [forge-std](https://github.com/foundry-rs/forge-std) (tests), React, Vite, wagmi, viem. No contract library is vendored; the token helpers are our own (`contracts/src/lib/`).
- **Prior work:** none of our earlier code is in this repo. The mascot art style was guided by the author's own mascots from an earlier project, used as a style reference only; every mascot here is a new render ([CREDITS.md](web/public/mascots/CREDITS.md)).

## AI usage

- **Code and docs:** built with Claude Code (contracts, tests, the dry-run tool, the web app and these docs), directed and reviewed by the author.
- **Art:** the 28 stock mascots were generated with Higgsfield (`nano_banana_pro`, 12 credits) and cut out by our own script, `web/tools/cut-mascots.py`.
- **In the product:** no AI runs in the app or the contracts. Scores, prices and payouts come only from onchain data.

## Team

Solo: [neromtoobad](https://github.com/neromtoobad).
