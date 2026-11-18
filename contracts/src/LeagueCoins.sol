// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {League} from "./League.sol";
import {LeagueFactory} from "./LeagueFactory.sol";
import {IStonksLauncher, IStonksFeeLocker} from "./interfaces/IStonks.sol";
import {TokenTransfer} from "./lib/TokenTransfer.sol";

/// @title Hostile league coins
/// @notice A league's commissioner can launch the league's own coin on Stonks Exchange, priced in
/// the league's treasury stock (for example a coin that trades against NVDA). This contract is the
/// coin's fee owner. Whenever anyone calls `harvest`, the coin's trading fees are collected:
///   - the stock side goes into the league treasury, which the champion takes at season end
///     (after the season, straight to the champion);
///   - the coin side is burned.
/// So fans who trade a league's coin grow that league's prize in real shares.
/// @dev Nothing here has an owner. This contract never holds funds between transactions, except
/// stock owed to a champion whose wallet could not receive it.
contract LeagueCoins {
    using TokenTransfer for address;

    address public constant BURN = 0x000000000000000000000000000000000000dEaD;

    LeagueFactory public immutable factory;
    IStonksLauncher public immutable launcher;
    IStonksFeeLocker public immutable locker;

    mapping(address => address) public coinOf; // league => coin
    mapping(address => address) public leagueOf; // coin => league
    mapping(address => mapping(address => uint256)) public owed; // wallet => stock => amount

    uint256 private _lock = 1;

    event CoinLaunched(address indexed league, address indexed coin, address indexed stock, string symbol, int24 tickSpacing);
    event Harvested(address indexed league, address indexed coin, uint256 stockToTreasury, uint256 stockToChampion, uint256 coinBurned);
    event Owed(address indexed wallet, address indexed stock, uint256 amount);

    modifier nonReentrant() {
        require(_lock == 1, "Coins: busy");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(LeagueFactory factory_, IStonksLauncher launcher_, IStonksFeeLocker locker_) {
        factory = factory_;
        launcher = launcher_;
        locker = locker_;
    }

    /// @notice Launch the league's coin. Commissioner only, once per league, before the season ends.
    /// @param tickSpacing Stonks tier: 80 = 1% trading fee, 500 = 2%, 150 = 3%
    /// @param maxPlatformBps highest Stonks platform share of fees you accept (today 3000 or 2500)
    function launch(
        League league,
        string calldata name,
        string calldata symbol,
        int24 tickSpacing,
        uint16 maxPlatformBps,
        IStonksLauncher.Meta calldata meta
    ) external payable nonReentrant returns (address coin) {
        require(factory.isLeague(address(league)), "Coins: not a Hostile league");
        require(msg.sender == league.commissioner(), "Coins: only commissioner");
        require(coinOf[address(league)] == address(0), "Coins: already launched");
        require(league.phase() != League.Phase.Finished, "Coins: season over");

        address stock = _treasuryStock(league);
        IStonksLauncher.LaunchParams memory p = IStonksLauncher.LaunchParams({
            name: name,
            symbol: symbol,
            totalSupply: launcher.enforcedSupply(),
            quote: stock,
            tickSpacing: tickSpacing,
            devBuyQuote: 0,
            minDevBuyTokens: 0,
            userSalt: bytes32(0),
            maxLaunchFeeWei: msg.value,
            maxPlatformBps: maxPlatformBps,
            feeOwner: address(this),
            quoteOnly: false
        });
        (coin,) = launcher.launchWithMeta{value: msg.value}(p, meta);
        coinOf[address(league)] = coin;
        leagueOf[coin] = address(league);
        emit CoinLaunched(address(league), coin, stock, symbol, tickSpacing);
    }

    /// @notice Anyone can call: collect the coin's trading fees and route them (see contract notes).
    function harvest(address coin) external nonReentrant {
        address leagueAddr = leagueOf[coin];
        require(leagueAddr != address(0), "Coins: unknown coin");
        League league = League(leagueAddr);
        address stock = _treasuryStock(league);

        uint256 stockBefore = stock.balanceOf(address(this));
        uint256 coinBefore = coin.balanceOf(address(this));
        locker.collect(coin);
        // Anything the locker could not push earlier is waiting there for us.
        if (locker.claimable(address(this), stock) > 0) locker.claim(stock);
        if (locker.claimable(address(this), coin) > 0) locker.claim(coin);
        uint256 stockGot = stock.balanceOf(address(this)) - stockBefore;
        uint256 coinGot = coin.balanceOf(address(this)) - coinBefore;

        if (coinGot > 0) coin.safeTransfer(BURN, coinGot);

        uint256 toTreasury;
        uint256 toChampion;
        if (stockGot > 0) {
            if (league.phase() != League.Phase.Finished) {
                _approve(stock, leagueAddr, stockGot);
                league.fundTreasury(stockGot);
                toTreasury = stockGot;
            } else {
                (, , address champ) = league.champion();
                toChampion = stockGot;
                if (!stock.tryTransfer(champ, stockGot)) {
                    owed[champ][stock] += stockGot;
                    emit Owed(champ, stock, stockGot);
                }
            }
        }
        emit Harvested(leagueAddr, coin, toTreasury, toChampion, coinGot);
    }

    /// @notice A champion whose wallet could not receive collects the stock to any wallet.
    function claim(address stock, address to) external nonReentrant {
        uint256 amount = owed[msg.sender][stock];
        require(amount > 0, "Coins: nothing owed");
        owed[msg.sender][stock] = 0;
        stock.safeTransfer(to, amount);
    }

    function _treasuryStock(League league) internal view returns (address) {
        (,,,,,, uint8 treasuryStock) = league.config();
        return league.stockAt(treasuryStock).token;
    }

    function _approve(address token, address spender, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x095ea7b3, spender, amount));
        require(ok && ret.length >= 32 && abi.decode(ret, (uint256)) == 1, "Coins: approve failed");
    }
}
