// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {League} from "../src/League.sol";
import {LeagueFactory} from "../src/LeagueFactory.sol";
import {LeagueCoins} from "../src/LeagueCoins.sol";
import {IStonksLauncher, IStonksFeeLocker} from "../src/interfaces/IStonks.sol";
import {MockToken} from "./mocks/MockToken.sol";
import {MockPool} from "./mocks/MockPool.sol";
import {MockStonks} from "./mocks/MockStonks.sol";

contract LeagueCoinsTest is Test {
    MockToken usdc;
    MockToken[] stockTokens;
    MockPool[] pools;
    LeagueFactory factory;
    League league;
    MockStonks stonks;
    LeagueCoins coins;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address[] people;

    IStonksLauncher.Meta meta;

    function setUp() public {
        vm.warp(1_800_000_000);
        usdc = new MockToken("USDC", 6);
        address[] memory tokens = new address[](4);
        address[] memory poolAddrs = new address[](4);
        for (uint256 i; i < 4; i++) {
            MockToken t = new MockToken(string.concat("STK", vm.toString(i)), 8);
            MockPool p = new MockPool(address(usdc), address(t), i % 2 == 0, int24(int256(50_000 + i * 100)), 1e18);
            t.mint(address(p), 1e18);
            stockTokens.push(t);
            pools.push(p);
            tokens[i] = address(t);
            poolAddrs[i] = address(p);
        }
        factory = new LeagueFactory(address(usdc), tokens, poolAddrs);
        stonks = new MockStonks();
        coins = new LeagueCoins(factory, IStonksLauncher(address(stonks)), IStonksFeeLocker(address(stonks)));
        people = [alice, bob];
        for (uint256 i; i < 2; i++) usdc.mint(people[i], 1_000e6);
        vm.prank(alice);
        league = factory.createLeague(
            "Coin League",
            League.Config({entryFee: 25e6, maxManagers: 2, rosterSize: 1, seasonWeeks: 1, weekLength: 1 days, pickWindow: 2 minutes, treasuryStock: 0})
        );
        meta = IStonksLauncher.Meta("ipfs://img", "", "Fan coin of Coin League", "https://hostile.nerom.site", "", "");
    }

    function _launch() internal returns (address coin) {
        vm.prank(alice);
        coin = coins.launch(league, "Coin League", "COINL", 80, 3000, meta);
    }

    function _playSeason() internal {
        for (uint256 i; i < 2; i++) {
            vm.startPrank(people[i]);
            usdc.approve(address(league), type(uint256).max);
            league.join(string.concat("Team ", vm.toString(i)));
            vm.stopPrank();
        }
        league.startDraft();
        for (uint256 p; p < 2; p++) {
            address m = league.managers()[league.onTheClock()];
            vm.prank(m);
            league.pick(p, 0);
        }
    }

    function test_commissioner_launches_coin_priced_in_treasury_stock() public {
        address coin = _launch();
        (address quote, address feeOwner, int24 spacing) = stonks.launches(coin);
        assertEq(quote, address(stockTokens[0]), "priced in the league's treasury stock");
        assertEq(feeOwner, address(coins), "LeagueCoins owns the fees, not a person");
        assertEq(spacing, 80);
        assertEq(coins.coinOf(address(league)), coin);
        assertEq(coins.leagueOf(coin), address(league));
    }

    function test_only_commissioner_once_and_only_hostile_leagues() public {
        vm.prank(bob);
        vm.expectRevert("Coins: only commissioner");
        coins.launch(league, "x", "X", 80, 3000, meta);

        _launch();
        vm.prank(alice);
        vm.expectRevert("Coins: already launched");
        coins.launch(league, "x", "X", 80, 3000, meta);

        League stray = new League(address(usdc), alice, "stray", League.Config(25e6, 2, 1, 1, 1 days, 2 minutes, 0), _tokens(), _pools());
        vm.prank(alice);
        vm.expectRevert("Coins: not a Hostile league");
        coins.launch(stray, "x", "X", 80, 3000, meta);
    }

    function test_harvest_adds_stock_fees_to_treasury_and_burns_coin_fees() public {
        address coin = _launch();
        _playSeason();
        uint256 treasuryBefore = league.treasuryShares();

        stockTokens[0].mint(address(stonks), 5e6);
        stonks.accrue(coin, 5e6, 1e21);
        coins.harvest(coin);

        assertEq(league.treasuryShares(), treasuryBefore + 5e6, "stock fees grow the champion's prize");
        assertEq(MockToken(coin).balanceOf(coins.BURN()), 1e21, "coin fees burned");
        assertEq(stockTokens[0].balanceOf(address(coins)), 0, "nothing left behind");
    }

    function test_fees_harvested_before_the_draft_still_count() public {
        address coin = _launch();
        stockTokens[0].mint(address(stonks), 3e6);
        stonks.accrue(coin, 3e6, 0);
        coins.harvest(coin); // league still joining
        assertEq(league.treasuryShares(), 3e6);
        _playSeason(); // draft close adds the rake buy on top
        assertGt(league.treasuryShares(), 3e6);
    }

    function test_champion_takes_the_whole_treasury_and_later_fees_go_straight_to_them() public {
        address coin = _launch();
        _playSeason();
        stockTokens[0].mint(address(stonks), 4e6);
        stonks.accrue(coin, 4e6, 0);
        coins.harvest(coin);
        uint256 prize = league.treasuryShares();

        vm.warp(league.seasonStart() + 1 days + 1 hours);
        league.settleWeek();
        (, , address champ) = league.champion();
        uint256 champHas = stockTokens[0].balanceOf(champ);
        assertGe(champHas, prize, "treasury, including coin fees, went to the champion");

        stockTokens[0].mint(address(stonks), 2e6);
        stonks.accrue(coin, 2e6, 0);
        coins.harvest(coin);
        assertEq(stockTokens[0].balanceOf(champ), champHas + 2e6, "after the season, fees go to the champion");
    }

    function test_fund_treasury_rejected_after_season() public {
        _playSeason();
        vm.warp(league.seasonStart() + 1 days + 1 hours);
        league.settleWeek();
        vm.expectRevert("League: season over");
        league.fundTreasury(1);
    }

    function _tokens() internal view returns (address[] memory t) {
        t = new address[](4);
        for (uint256 i; i < 4; i++) t[i] = address(stockTokens[i]);
    }

    function _pools() internal view returns (address[] memory p) {
        p = new address[](4);
        for (uint256 i; i < 4; i++) p[i] = address(pools[i]);
    }
}
