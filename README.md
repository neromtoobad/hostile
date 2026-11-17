# Hostile — a fantasy stock league where every pick is a real share, and the loser hands 10% to the winner

**Live:** not deployed yet · **Video:** not recorded yet · **Built at:** Base Stocks Maxxing Season, Nov 5 – Dec 5 2026 (Track 1: Meme & Community Economies)

**Proof so far:** a whole season played against real Base mainnet state at block 58669020, with no money spent ([evidence/dry-run-58669020.json](evidence/dry-run-58669020.json)). In it, 8 draft picks bought real Coinbase stock tokens on Aerodrome, and 4 weekly slices moved real shares to winners' wallets.

## How a season works

1. **Join.** Friends open a league and each pays the entry fee in USDC, for example $25.
2. **Draft.** The draft runs snake order, 1-2-3-4 then 4-3-2-1. **Each pick buys that stock right then** on its Aerodrome pool. The league contract holds the shares, and no two managers can own the same stock.
3. **Rake.** 2% of the entries buys a stock into the league treasury.
4. **Weekly matchups.** Every week, managers play head to head.
   - **Score:** how much each stock's price moved, read from Aerodrome's onchain price history (30-minute TWAP). +100 ≈ +1%.
   - **Captain:** your captain stock counts twice.
5. **The loser pays.** The loser sends **10% of every share they hold to the winner's wallet**. It's a real transfer of stock tokens.
6. **Season end.** The champion takes the treasury, and every manager's remaining shares go to their own wallet. You keep your stocks.

## For judges: verify in 2 minutes

| Do this | You see |
|---|---|
| `cd contracts && forge test` | 19 passing tests: draft buys, TWAP guards, slices, captain lock, byes, blocked wallets |
| `cd contracts && forge build && cd .. && node tools/live-dry-run.mjs` | A full season on today's Base mainnet state: real buys, real price reads, real B20 transfers, saved to `evidence/` |
| Open [evidence/dry-run-58669020.json](evidence/dry-run-58669020.json) | Picks with the price paid per share, week results, slices, the champion, and the final wallets (raw and dividend-adjusted balances) |

## Claims (each one checkable today)

| Claim | Where in code | Check |
|---|---|---|
| A draft pick buys the stock on Aerodrome with USDC, at once | `contracts/src/League.sol:211` `pick` → `:262` `_buy` | test `test_draft_is_snake_order_and_each_pick_is_a_real_buy`, dry run "Draft" |
| A buy is refused while the price is off its 30-min TWAP (anti-manipulation) | `contracts/src/League.sol:266` | test `test_buy_refused_while_price_is_off_its_twap` |
| A buy is refused if it would move the price more than ~3% | `contracts/src/League.sol:282` | test `test_buy_refused_when_it_moves_price_too_far` |
| Only the pool being traded can collect USDC | `contracts/src/League.sol:288` | test `test_swap_callback_only_from_the_active_pool` |
| A pool must really trade that stock against USDC, checked onchain | `contracts/src/League.sol:140` | test `test_league_rejects_a_pool_that_is_not_stock_usdc` |
| Absent managers get autopicked after their clock runs out | `contracts/src/League.sol:219` | test `test_autopick_only_after_the_clock_runs_out` |
| 2% rake buys the treasury stock when the draft ends | `contracts/src/League.sol:241` | test `test_draft_close_buys_treasury_and_marks_prices` |
| Scores come from each pool's TWAP at the exact week end, not when someone settles | `contracts/src/League.sol:320`, `contracts/src/lib/PoolPrice.sol:24` | test `test_late_settle_uses_price_at_week_end_not_now` |
| Loser sends 10% of each holding to the winner's wallet | `contracts/src/League.sol:376` | test `test_week_winner_gets_ten_percent_of_loser_shares_in_wallet`, dry run "Slices" |
| Captain counts double; a change only starts next week | `contracts/src/League.sol:300`, `:311` | test `test_captain_change_waits_for_next_week` |
| A wallet on the stock's blocklist can't stall the league: shares are held for it, claimable to any wallet | `contracts/src/League.sol:419`, `:427` | test `test_blocked_winner_is_owed_and_claims_to_another_wallet` |
| Season end: champion gets the treasury, everyone's bag goes home | `contracts/src/League.sol:394` | test `test_full_season_sends_bags_home_and_champion_takes_treasury` |
| B20 stock tokens have no bytecode, so a call only counts if it returns `true` | `contracts/src/lib/TokenTransfer.sol:9` | the dry run against real B20 tokens |

## What's real

| Part | Status | Proof |
|---|---|---|
| League + factory contracts | written and tested, **not deployed yet** | `contracts/src/` · `forge test` |
| Buying stocks, reading TWAPs, moving shares | run against **real Base mainnet state** in a simulation (no money moved) | `tools/live-dry-run.mjs`, `evidence/` |
| Test mocks | **simulated**: `contracts/test/mocks/` replace the stock tokens and pools in unit tests, because Coinbase's B20 tokens are precompiles that a local fork can't run | the dry run covers the real tokens instead |
| `SimWhale` | **dry-run only**, never deployed: an outside buyer that moves one price inside the simulation so a week has a winner | `contracts/script/SimWhale.sol` |
| Web app | not built yet | — |

## Trust model

- **No admin over funds.** No one can set prices, move shares or pause a league, including the commissioner and the deployer.
- **The commissioner** can only start the draft early. A full league starts on its own.
- **The factory owner** can only change the stock list for *future* leagues. Each league copies the list when it is created.
- **Draft order** is shuffled with Base's `prevrandao`. On an L2 the sequencer could influence that.
- **Coinbase controls each stock's transfer policy.** Today all 28 liquid stocks use policy 5, a blocklist, and contracts are allowed. If Coinbase blocks a wallet, that wallet's shares wait in the league and can be claimed to another wallet. If Coinbase blocks the league contract itself, its shares are stuck until Coinbase unblocks it. We can't prevent that.
- **US users** are not allowed to trade under the event rules. The app will block US visitors.

## Not built yet

- Mainnet deployment and verified source.
- The web app: league lobby, live draft room, matchup screen, share cards.
- Keeper that settles weeks and autopicks.
- Trades between managers, Weekend Cup, an AI rival manager, yield on held stocks (Aave V4).

## Why these choices

- **The draft list is the 25 most liquid stocks.**
  - Of 377 Coinbase stock tokens on Base, only 28 have an Aerodrome USDC pool over $100K. We left out 3 that barely trade (`contracts/script/stocks.base.json`, measured Nov 17 2026).
  - A $5K buy moves NVDA about 0.03%.
- **We score on the DEX, not Coinbase's reference price.** Aerodrome prices ran about 1.2% above Coinbase's NAV on Nov 17. Buying on the DEX and scoring on NAV would start every manager at a loss.
- **We score in ticks, not dollars.** A tick difference is a log return, so no price math or oracle trust is needed onchain.

## Run it

```bash
git clone --recursive <repo> && cd hostile
cd contracts && forge test                     # unit tests
forge build && cd ../tools && npm ci && cd ..
node tools/live-dry-run.mjs                    # full season on real Base state, free
```

Deploy (needs a little ETH on Base in the `.env` wallet):

```bash
cd contracts && source ../.env && forge script script/Deploy.s.sol --rpc-url base --broadcast --private-key $PRIVATE_KEY
```
