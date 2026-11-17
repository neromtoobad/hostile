// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {League} from "../src/League.sol";
import {LeagueFactory} from "../src/LeagueFactory.sol";
import {MockToken} from "./mocks/MockToken.sol";
import {MockPool} from "./mocks/MockPool.sol";

/// Unit tests on local mocks. Coinbase B20 tokens are precompiles that a local fork can't run,
/// so the mainnet path is checked separately by script/live-dry-run (eth_call on real Base state).
contract LeagueTest is Test {
    uint256 constant N_STOCKS = 8;
    uint256 constant ENTRY = 25e6; // $25

    MockToken usdc;
    MockToken[] stockTokens;
    MockPool[] pools;
    LeagueFactory factory;
    League league;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address dave = makeAddr("dave");
    address[] people;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockToken("USDC", 6);
        address[] memory tokens = new address[](N_STOCKS);
        address[] memory poolAddrs = new address[](N_STOCKS);
        for (uint256 i; i < N_STOCKS; i++) {
            MockToken t = new MockToken(string.concat("STK", vm.toString(i)), 8);
            // Half the pools list USDC first, half list the stock first, like on Base.
            MockPool p = new MockPool(address(usdc), address(t), i % 2 == 0, int24(int256(50_000 + i * 100)), 1e18);
            t.mint(address(p), 1e18);
            stockTokens.push(t);
            pools.push(p);
            tokens[i] = address(t);
            poolAddrs[i] = address(p);
        }
        factory = new LeagueFactory(address(usdc), tokens, poolAddrs);
        people = [alice, bob, carol, dave];
        for (uint256 i; i < people.length; i++) {
            usdc.mint(people[i], 1_000e6);
        }
        vm.prank(alice);
        league = factory.createLeague("Friday Night Stocks", _config(4, 2, 3));
    }

    // ───────────── helpers ─────────────

    function _config(uint8 managers, uint8 roster, uint8 weeks_) internal pure returns (League.Config memory) {
        return League.Config({
            entryFee: ENTRY,
            maxManagers: managers,
            rosterSize: roster,
            seasonWeeks: weeks_,
            weekLength: 1 days,
            pickWindow: 2 minutes,
            treasuryStock: 0
        });
    }

    function _joinAll(League l, uint256 count) internal {
        for (uint256 i; i < count; i++) {
            vm.startPrank(people[i]);
            usdc.approve(address(l), type(uint256).max);
            l.join(string.concat("Team ", vm.toString(i)));
            vm.stopPrank();
        }
    }

    function _firstFree(League l) internal view returns (uint256 id) {
        while (true) {
            (bool taken,) = l.ownerOf(id);
            if (!taken) return id;
            id++;
        }
    }

    function _draftAll(League l) internal {
        while (l.phase() == League.Phase.Drafting) {
            address m = l.managers()[l.onTheClock()];
            uint256 id = _firstFree(l);
            vm.prank(m);
            l.pick(id, 0);
        }
    }

    function _seatOf(League l, address who) internal view returns (uint256 seat) {
        (, seat) = l.seatOf(who);
    }

    /// Moves a stock's price and lets the full 30-minute TWAP window pass so the new price counts.
    function _setPrice(uint256 stockId, int24 stockTick) internal {
        pools[stockId].setStockTick(stockTick);
    }

    function _endWeek(League l) internal {
        uint256 end = l.seasonStart() + (l.weeksSettled() + 1) * 1 days;
        vm.warp(end + 5 minutes);
    }

    // ───────────── joining ─────────────

    function test_join_takes_entry_and_leave_refunds() public {
        _joinAll(league, 2);
        assertEq(usdc.balanceOf(address(league)), 2 * ENTRY);
        vm.prank(alice);
        league.leave();
        assertEq(usdc.balanceOf(alice), 1_000e6);
        assertEq(league.managers().length, 1);
        assertEq(league.managers()[0], bob, "bob moved into the free seat");
        assertEq(league.teamName(0), "Team 1");
    }

    function test_only_commissioner_starts_unfull_league() public {
        _joinAll(league, 2);
        vm.prank(bob);
        vm.expectRevert("League: only commissioner");
        league.startDraft();
        vm.prank(alice);
        league.startDraft();
        assertEq(uint256(league.phase()), uint256(League.Phase.Drafting));
    }

    // ───────────── draft ─────────────

    function test_draft_is_snake_order_and_each_pick_is_a_real_buy() public {
        _joinAll(league, 4);
        league.startDraft(); // full league: anyone may start
        uint8[] memory order = league.draftOrder();
        uint256 perPick = league.perPickUsdc();
        assertEq(perPick, (ENTRY * 98) / 100 / 2);

        uint256[8] memory expected = [
            uint256(order[0]), order[1], order[2], order[3], order[3], order[2], order[1], order[0]
        ];
        for (uint256 p; p < 8; p++) {
            uint256 seat = league.onTheClock();
            assertEq(seat, expected[p], "snake order");
            uint256 id = _firstFree(league);
            uint256 poolUsdcBefore = usdc.balanceOf(address(pools[id]));
            uint256 heldBefore = stockTokens[id].balanceOf(address(league));
            vm.prank(league.managers()[seat]);
            league.pick(id, 0);
            assertEq(usdc.balanceOf(address(pools[id])) - poolUsdcBefore, perPick, "USDC paid to the pool");
            assertGt(stockTokens[id].balanceOf(address(league)), heldBefore, "league holds the stock");
            (bool taken, uint256 owner) = league.ownerOf(id);
            assertTrue(taken);
            assertEq(owner, seat);
        }
        assertEq(uint256(league.phase()), uint256(League.Phase.Season));
    }

    function test_pick_out_of_turn_or_taken_reverts() public {
        _joinAll(league, 4);
        league.startDraft();
        address onClock = league.managers()[league.onTheClock()];
        address other = onClock == alice ? bob : alice;
        vm.prank(other);
        vm.expectRevert("League: not your pick");
        league.pick(0, 0);

        vm.prank(onClock);
        league.pick(3, 0);
        address next = league.managers()[league.onTheClock()];
        vm.prank(next);
        vm.expectRevert("League: stock taken");
        league.pick(3, 0);
    }

    function test_min_shares_protects_the_buyer() public {
        _joinAll(league, 4);
        league.startDraft();
        vm.prank(league.managers()[league.onTheClock()]);
        vm.expectRevert("League: below minShares");
        league.pick(0, type(uint256).max);
    }

    function test_autopick_only_after_the_clock_runs_out() public {
        _joinAll(league, 4);
        league.startDraft();
        vm.expectRevert("League: clock still running");
        league.autopick();
        uint256 seat = league.onTheClock();
        vm.warp(block.timestamp + 2 minutes + 1);
        league.autopick();
        (bool taken, uint256 owner) = league.ownerOf(0);
        assertTrue(taken);
        assertEq(owner, seat, "first listed stock goes to the absent manager");
    }

    function test_buy_refused_while_price_is_off_its_twap() public {
        _joinAll(league, 4);
        league.startDraft();
        pools[2].setStockTick(int24(50_200 + 400)); // jump 4% just now: spot far from the 30-min TWAP
        vm.prank(league.managers()[league.onTheClock()]);
        vm.expectRevert("League: price off its TWAP, try later");
        league.pick(2, 0);
    }

    function test_buy_refused_when_it_moves_price_too_far() public {
        _joinAll(league, 4);
        league.startDraft();
        pools[1].setBuyImpact(301);
        vm.prank(league.managers()[league.onTheClock()]);
        vm.expectRevert("League: buy moves price too much");
        league.pick(1, 0);
    }

    function test_draft_close_buys_treasury_and_marks_prices() public {
        _joinAll(league, 4);
        league.startDraft();
        _draftAll(league);
        assertGt(league.treasuryShares(), 0);
        uint256 rake = 4 * ENTRY - league.perPickUsdc() * 8;
        assertEq(rake, 2e6, "2% of $100 in entries");
        assertEq(league.markTick(0), int24(50_000));
        assertEq(league.markTick(7), int24(50_700));
        assertEq(league.seasonStart(), block.timestamp);
    }

    function test_swap_callback_only_from_the_active_pool() public {
        vm.expectRevert("League: not the active pool");
        league.uniswapV3SwapCallback(1e6, 0, "");
    }

    // ───────────── season ─────────────

    function test_week_winner_gets_ten_percent_of_loser_shares_in_wallet() public {
        _joinAll(league, 4);
        league.startDraft();
        _draftAll(league);

        // Week 0 pairs: seat 0 vs seat 3, seat 1 vs seat 2.
        (bool has, uint256 opp) = league.opponentOf(0, 0);
        assertTrue(has);
        assertEq(opp, 3);

        // Seat 0's stocks rise 2%, seat 3's fall 1%.
        uint8[] memory r0 = league.rosterOf(0);
        uint8[] memory r3 = league.rosterOf(3);
        vm.warp(block.timestamp + 1 hours);
        for (uint256 k; k < r0.length; k++) _setPrice(r0[k], league.markTick(r0[k]) + 200);
        for (uint256 k; k < r3.length; k++) _setPrice(r3[k], league.markTick(r3[k]) - 100);

        uint256[] memory loserShares = new uint256[](r3.length);
        for (uint256 k; k < r3.length; k++) loserShares[k] = league.shares(r3[k]);

        _endWeek(league);
        league.settleWeek();

        address winner = league.managers()[0];
        for (uint256 k; k < r3.length; k++) {
            uint256 slice = loserShares[k] / 10;
            assertEq(stockTokens[r3[k]].balanceOf(winner), slice, "slice landed in the winner's wallet");
            assertEq(league.shares(r3[k]), loserShares[k] - slice, "loser's bag shrank");
        }
        assertEq(league.wins(0), 1);
        assertEq(league.losses(3), 1);
        // Seat 0 score: two stocks +200 each, captain (first pick) counted twice = 600.
        assertEq(league.weekScore(0, 0), 600);
        assertEq(league.weekScore(0, 3), -300);
    }

    function test_captain_change_waits_for_next_week() public {
        _joinAll(league, 4);
        league.startDraft();
        _draftAll(league);
        uint8[] memory r0 = league.rosterOf(0);
        address m0 = league.managers()[0];
        assertEq(league.captain(0), r0[0]);

        vm.warp(block.timestamp + 1 hours);
        _setPrice(r0[1], league.markTick(r0[1]) + 500); // second stock jumps
        vm.prank(m0);
        league.setCaptain(r0[1]); // too late for this week

        _endWeek(league);
        league.settleWeek();
        assertEq(league.weekScore(0, 0), 500, "old captain still counted this week");
        assertEq(league.captain(0), r0[0]);

        vm.warp(block.timestamp + 1 hours);
        _setPrice(r0[1], league.markTick(r0[1]) + 100);
        _endWeek(league);
        league.settleWeek();
        assertEq(league.captain(0), r0[1], "new captain from week 1");
        assertEq(league.weekScore(1, 0), 200);
    }

    function test_blocked_winner_is_owed_and_claims_to_another_wallet() public {
        _joinAll(league, 4);
        league.startDraft();
        _draftAll(league);
        uint8[] memory r0 = league.rosterOf(0);
        uint8[] memory r3 = league.rosterOf(3);
        address winner = league.managers()[0];
        stockTokens[r3[0]].setBlocked(winner, true);

        vm.warp(block.timestamp + 1 hours);
        _setPrice(r0[0], league.markTick(r0[0]) + 300);
        uint256 slice = league.shares(r3[0]) / 10;
        _endWeek(league);
        league.settleWeek(); // must not revert just because one wallet is blocked

        assertEq(league.owed(winner, address(stockTokens[r3[0]])), slice);
        address backup = makeAddr("backup");
        vm.prank(winner);
        league.claim(address(stockTokens[r3[0]]), backup);
        assertEq(stockTokens[r3[0]].balanceOf(backup), slice);
        assertEq(league.owed(winner, address(stockTokens[r3[0]])), 0);
    }

    function test_week_cannot_settle_early() public {
        _joinAll(league, 4);
        league.startDraft();
        _draftAll(league);
        vm.warp(block.timestamp + 1 days - 1);
        vm.expectRevert("League: week not over");
        league.settleWeek();
    }

    function test_late_settle_uses_price_at_week_end_not_now() public {
        _joinAll(league, 4);
        league.startDraft();
        _draftAll(league);
        uint8[] memory r0 = league.rosterOf(0);
        uint256 start = league.seasonStart();
        vm.warp(start + 1 hours);
        _setPrice(r0[1], league.markTick(r0[1]) + 100);
        vm.warp(start + 1 days + 6 hours); // 6h after the week ended, price jumps again
        _setPrice(r0[1], league.markTick(r0[1]) + 900);
        vm.warp(start + 1 days + 7 hours);
        league.settleWeek();
        assertEq(league.weekScore(0, 0), 100, "the jump after the week ended is ignored");
    }

    function test_full_season_sends_bags_home_and_champion_takes_treasury() public {
        _joinAll(league, 4);
        league.startDraft();
        _draftAll(league);
        uint256 treasury = league.treasuryShares();
        uint8[] memory r2 = league.rosterOf(2);

        for (uint256 w; w < 3; w++) {
            vm.warp(block.timestamp + 1 hours);
            for (uint256 k; k < r2.length; k++) _setPrice(r2[k], league.markTick(r2[k]) + 150); // seat 2 wins every week
            _endWeek(league);
            league.settleWeek();
        }
        assertEq(uint256(league.phase()), uint256(League.Phase.Finished));
        (bool decided, uint256 seat, address wallet) = league.champion();
        assertTrue(decided);
        assertEq(seat, 2);
        assertEq(league.wins(2), 3);
        assertGe(stockTokens[0].balanceOf(wallet), treasury, "champion holds the treasury stock");
        assertEq(league.treasuryShares(), 0);

        for (uint256 s; s < 4; s++) {
            uint8[] memory r = league.rosterOf(s);
            for (uint256 k; k < r.length; k++) {
                assertEq(league.shares(r[k]), 0, "nothing left in the league");
                assertGt(stockTokens[r[k]].balanceOf(league.managers()[s]), 0, "bag sent home");
            }
        }
        assertEq(stockTokens[0].balanceOf(address(league)), 0);
    }

    function test_odd_league_gives_one_bye_per_week() public {
        vm.prank(alice);
        League odd = factory.createLeague("Three", _config(3, 2, 3));
        _joinAll(odd, 3);
        odd.startDraft();
        _draftAll(odd);
        for (uint256 w; w < 3; w++) {
            uint256 byes;
            for (uint256 s; s < 3; s++) {
                (bool has,) = odd.opponentOf(s, w);
                if (!has) byes++;
            }
            assertEq(byes, 1);
        }
        for (uint256 w; w < 3; w++) {
            _endWeek(odd);
            odd.settleWeek();
        }
        assertEq(uint256(odd.phase()), uint256(League.Phase.Finished));
        uint256 played;
        for (uint256 s; s < 3; s++) played += odd.wins(s) + odd.losses(s) + odd.ties(s);
        assertEq(played, 6, "3 weeks x 1 match x 2 seats");
    }

    // ───────────── factory / construction ─────────────

    function test_league_rejects_a_pool_that_is_not_stock_usdc() public {
        address[] memory tokens = new address[](2);
        address[] memory poolAddrs = new address[](2);
        tokens[0] = address(stockTokens[0]);
        tokens[1] = address(stockTokens[1]);
        poolAddrs[0] = address(pools[0]);
        poolAddrs[1] = address(pools[0]); // wrong pool for stock 1
        vm.expectRevert("League: pool is not stock/USDC");
        new League(address(usdc), alice, "bad", _config(2, 1, 1), tokens, poolAddrs);
    }

    function test_factory_limits_and_owner_only_stock_list() public {
        League.Config memory c = _config(4, 2, 3);
        c.weekLength = 10 minutes;
        vm.expectRevert("Factory: week too short");
        factory.createLeague("x", c);

        (address[] memory t, address[] memory p) = factory.stocks();
        vm.prank(bob);
        vm.expectRevert("Factory: only owner");
        factory.setStocks(t, p);
        assertEq(factory.leagueCount(), 1);
    }
}
