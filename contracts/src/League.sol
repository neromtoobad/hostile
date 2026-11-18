// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IClPool} from "./interfaces/IClPool.sol";
import {PoolPrice} from "./lib/PoolPrice.sol";
import {TokenTransfer} from "./lib/TokenTransfer.sol";

/// @title Hostile league
/// @notice A fantasy stock league where every draft pick is a real stock token bought on Aerodrome
/// and held by this contract. Each week managers play head to head; scores come from each pool's
/// onchain price history (TWAP), and the loser sends 10% of every share they hold to the winner's
/// wallet. A 2% rake buys a stock into the league treasury, which the champion takes at the end.
/// When the season ends every manager's remaining shares go to their wallet.
/// @dev No one, including the commissioner and the deployer, can set a price, move shares or pause.
contract League {
    using TokenTransfer for address;

    enum Phase {
        Joining,
        Drafting,
        Season,
        Finished
    }

    struct Stock {
        address token; // Coinbase B20 stock token (8 decimals)
        address pool; // Aerodrome Slipstream stock/USDC pool
        bool usdcIsToken0;
    }

    struct Config {
        uint256 entryFee; // USDC (6 decimals) each manager pays to join
        uint8 maxManagers;
        uint8 rosterSize; // stocks each manager drafts
        uint8 seasonWeeks; // matchup weeks
        uint32 weekLength; // seconds in one matchup week
        uint32 pickWindow; // seconds a manager has to pick before anyone can autopick for them
        uint8 treasuryStock; // stock id the rake buys for the champion
    }

    uint256 public constant RAKE_BPS = 200; // 2% of entries buys the champion's treasury
    uint256 public constant SLICE_BPS = 1000; // loser sends 10% of each holding to the winner
    uint32 public constant TWAP_WINDOW = 30 minutes;
    int24 public constant MAX_SPOT_GAP = 150; // ticks (~1.5%): refuse to buy while price is off its TWAP
    int24 public constant MAX_FILL_GAP = 300; // ticks (~3%): refuse a buy that moves price this far

    address public immutable usdc;
    address public immutable commissioner;
    string public name;
    Config public config;
    Phase public phase;

    Stock[] internal _stocks;
    address[] internal _managers; // index = seat
    mapping(address => uint256) internal _seatPlusOne;
    mapping(uint256 => string) public teamName; // seat => name

    // Draft
    uint8[] internal _draftOrder; // seats in round-one order; even rounds run backwards (snake)
    uint256 public pickNumber;
    uint256 public pickDeadline;
    uint256 public perPickUsdc;
    mapping(uint256 => uint256) internal _ownerPlusOne; // stock id => seat + 1
    mapping(uint256 => uint8[]) internal _roster; // seat => stock ids
    mapping(uint256 => uint256) public shares; // stock id => token amount held for its owner
    uint256 public treasuryShares;

    // Season
    uint256 public seasonStart;
    uint256 public weeksSettled;
    mapping(uint256 => int24) public markTick; // stock id => price tick at the last week boundary
    mapping(uint256 => uint8) public captain; // seat => stock id that scores double
    mapping(uint256 => uint8) internal _nextCaptain;
    mapping(uint256 => uint256) internal _nextCaptainFrom; // week the queued captain starts
    mapping(uint256 => bool) internal _hasNextCaptain;
    mapping(uint256 => mapping(uint256 => int256)) public weekScore; // week => seat => ticks
    mapping(uint256 => uint256) public wins;
    mapping(uint256 => uint256) public losses;
    mapping(uint256 => uint256) public ties;
    mapping(uint256 => int256) public totalScore;
    uint256 internal _championPlusOne;

    /// @notice Shares that could not be delivered (for example the wallet is on the token's blocklist).
    /// The owner can claim them to any wallet later.
    mapping(address => mapping(address => uint256)) public owed; // wallet => token => amount

    uint256 private _lock = 1;
    address private _swapPool;
    uint256 private _swapBudget;

    event Joined(uint256 indexed seat, address indexed manager, string team);
    event Left(address indexed manager);
    event DraftStarted(uint8[] order, uint256 perPickUsdc);
    event Picked(uint256 indexed pick, uint256 indexed seat, uint256 indexed stockId, uint256 usdcIn, uint256 sharesOut, bool auto_);
    event TreasuryBought(uint256 indexed stockId, uint256 usdcIn, uint256 sharesOut);
    event TreasuryFunded(address indexed from, uint256 amount);
    event SeasonStarted(uint256 start);
    event CaptainSet(uint256 indexed seat, uint256 indexed stockId, uint256 fromWeek);
    event WeekScored(uint256 indexed week, uint256 indexed seat, int256 score);
    event MatchSettled(uint256 indexed week, uint256 indexed seatA, uint256 indexed seatB, int256 scoreA, int256 scoreB, int256 winner);
    event SliceSent(uint256 indexed week, uint256 indexed stockId, uint256 fromSeat, address indexed to, uint256 amount, bool delivered);
    event SeasonFinished(uint256 indexed championSeat, address champion, uint256 treasuryShares);
    event BagReleased(uint256 indexed seat, uint256 indexed stockId, address to, uint256 amount, bool delivered);
    event Owed(address indexed wallet, address indexed token, uint256 amount);
    event Claimed(address indexed wallet, address indexed token, address to, uint256 amount);

    modifier nonReentrant() {
        require(_lock == 1, "League: busy");
        _lock = 2;
        _;
        _lock = 1;
    }

    modifier inPhase(Phase p) {
        require(phase == p, "League: wrong phase");
        _;
    }

    constructor(
        address usdc_,
        address commissioner_,
        string memory name_,
        Config memory cfg,
        address[] memory tokens,
        address[] memory pools
    ) {
        require(tokens.length == pools.length && tokens.length > 0 && tokens.length <= 255, "League: stocks");
        require(cfg.maxManagers >= 2 && cfg.rosterSize >= 1 && cfg.seasonWeeks >= 1, "League: config");
        require(uint256(cfg.maxManagers) * cfg.rosterSize <= tokens.length, "League: not enough stocks");
        require(cfg.treasuryStock < tokens.length, "League: treasury stock");
        require(cfg.entryFee >= uint256(cfg.rosterSize) * 1e5, "League: entry too small");
        usdc = usdc_;
        commissioner = commissioner_;
        name = name_;
        config = cfg;
        for (uint256 i; i < tokens.length; i++) {
            // Check onchain that each pool really trades this stock against USDC.
            address t0 = IClPool(pools[i]).token0();
            address t1 = IClPool(pools[i]).token1();
            bool usdcIs0 = t0 == usdc_ && t1 == tokens[i];
            require(usdcIs0 || (t1 == usdc_ && t0 == tokens[i]), "League: pool is not stock/USDC");
            _stocks.push(Stock(tokens[i], pools[i], usdcIs0));
        }
    }

    // ───────────────────────────── Joining ─────────────────────────────

    /// @notice Pay the entry fee in USDC and take a seat.
    function join(string calldata team) external nonReentrant inPhase(Phase.Joining) {
        require(_seatPlusOne[msg.sender] == 0, "League: already joined");
        require(_managers.length < config.maxManagers, "League: full");
        require(bytes(team).length > 0 && bytes(team).length <= 32, "League: team name");
        usdc.safeTransferFrom(msg.sender, address(this), config.entryFee);
        uint256 seat = _managers.length;
        _managers.push(msg.sender);
        _seatPlusOne[msg.sender] = seat + 1;
        teamName[seat] = team;
        emit Joined(seat, msg.sender, team);
    }

    /// @notice Leave before the draft starts and get the entry fee back.
    function leave() external nonReentrant inPhase(Phase.Joining) {
        uint256 seatPlusOne = _seatPlusOne[msg.sender];
        require(seatPlusOne != 0, "League: not in league");
        uint256 seat = seatPlusOne - 1;
        uint256 last = _managers.length - 1;
        if (seat != last) {
            address moved = _managers[last];
            _managers[seat] = moved;
            _seatPlusOne[moved] = seat + 1;
            teamName[seat] = teamName[last];
        }
        _managers.pop();
        delete teamName[last];
        delete _seatPlusOne[msg.sender];
        usdc.safeTransfer(msg.sender, config.entryFee);
        emit Left(msg.sender);
    }

    // ───────────────────────────── Draft ─────────────────────────────

    /// @notice The commissioner starts the draft, or anyone once the league is full.
    /// The round-one order is shuffled with the block's randomness (prevrandao).
    function startDraft() external nonReentrant inPhase(Phase.Joining) {
        uint256 n = _managers.length;
        require(n >= 2, "League: need 2 managers");
        require(msg.sender == commissioner || n == config.maxManagers, "League: only commissioner");
        uint8[] memory order = new uint8[](n);
        for (uint256 i; i < n; i++) order[i] = uint8(i);
        uint256 seed = uint256(keccak256(abi.encode(block.prevrandao, blockhash(block.number - 1), address(this))));
        for (uint256 i = n - 1; i > 0; i--) {
            uint256 j = uint256(keccak256(abi.encode(seed, i))) % (i + 1);
            (order[i], order[j]) = (order[j], order[i]);
        }
        _draftOrder = order;
        perPickUsdc = (config.entryFee * (10_000 - RAKE_BPS)) / 10_000 / config.rosterSize;
        phase = Phase.Drafting;
        pickDeadline = block.timestamp + config.pickWindow;
        emit DraftStarted(order, perPickUsdc);
    }

    /// @notice Seat that is on the clock (snake order: 1-2-3-4, 4-3-2-1, ...).
    function onTheClock() public view returns (uint256) {
        uint256 n = _managers.length;
        uint256 round = pickNumber / n;
        uint256 i = pickNumber % n;
        return _draftOrder[round % 2 == 0 ? i : n - 1 - i];
    }

    /// @notice Draft a stock: this buys it on Aerodrome with your pick budget, right now.
    /// @param minShares lowest token amount you accept (0 = rely on the TWAP guard only)
    function pick(uint256 stockId, uint256 minShares) external nonReentrant inPhase(Phase.Drafting) {
        uint256 seatPlusOne = _seatPlusOne[msg.sender];
        require(seatPlusOne != 0 && seatPlusOne - 1 == onTheClock(), "League: not your pick");
        _draft(seatPlusOne - 1, stockId, minShares, false);
    }

    /// @notice When a manager runs out of time, anyone can pick for them: the highest-listed
    /// stock still available (the list is ordered by liquidity).
    function autopick() external nonReentrant inPhase(Phase.Drafting) {
        require(block.timestamp > pickDeadline, "League: clock still running");
        uint256 stockId;
        while (_ownerPlusOne[stockId] != 0) stockId++;
        _draft(onTheClock(), stockId, 0, true);
    }

    function _draft(uint256 seat, uint256 stockId, uint256 minShares, bool auto_) internal {
        require(stockId < _stocks.length, "League: no such stock");
        require(_ownerPlusOne[stockId] == 0, "League: stock taken");
        uint256 bought = _buy(stockId, perPickUsdc);
        require(bought >= minShares, "League: below minShares");
        _ownerPlusOne[stockId] = seat + 1;
        _roster[seat].push(uint8(stockId));
        shares[stockId] = bought;
        if (_roster[seat].length == 1) captain[seat] = uint8(stockId); // first pick captains by default
        emit Picked(pickNumber, seat, stockId, perPickUsdc, bought, auto_);
        pickNumber++;
        if (pickNumber == _managers.length * config.rosterSize) _closeDraft();
        else pickDeadline = block.timestamp + config.pickWindow;
    }

    function _closeDraft() internal {
        uint256 n = _managers.length;
        uint256 rake = config.entryFee * n - perPickUsdc * config.rosterSize * n;
        uint256 bought = _buy(config.treasuryStock, rake);
        treasuryShares += bought;
        emit TreasuryBought(config.treasuryStock, rake, bought);
        for (uint256 seat; seat < n; seat++) {
            uint8[] storage r = _roster[seat];
            for (uint256 k; k < r.length; k++) {
                Stock memory s = _stocks[r[k]];
                markTick[r[k]] = PoolPrice.stockTick(PoolPrice.twapTick(s.pool, TWAP_WINDOW, 0), s.usdcIsToken0);
            }
        }
        seasonStart = block.timestamp;
        phase = Phase.Season;
        emit SeasonStarted(block.timestamp);
    }

    /// @dev Buys `stockId` with `usdcIn` straight from its Slipstream pool. Refuses when the spot
    /// price is far from the 30-minute TWAP (someone is pushing the price) or when the buy itself
    /// would move the price too far.
    function _buy(uint256 stockId, uint256 usdcIn) internal returns (uint256 bought) {
        Stock memory s = _stocks[stockId];
        int24 twap = PoolPrice.stockTick(PoolPrice.twapTick(s.pool, TWAP_WINDOW, 0), s.usdcIsToken0);
        int24 spot = PoolPrice.stockTick(PoolPrice.spotTick(s.pool), s.usdcIsToken0);
        require(_abs(spot - twap) <= MAX_SPOT_GAP, "League: price off its TWAP, try later");

        uint256 before = s.token.balanceOf(address(this));
        _swapPool = s.pool;
        _swapBudget = usdcIn;
        IClPool(s.pool).swap(
            address(this),
            s.usdcIsToken0, // USDC in: token0 -> token1 when USDC is token0
            int256(usdcIn),
            s.usdcIsToken0 ? PoolPrice.MIN_SQRT_PRICE_PLUS_ONE : PoolPrice.MAX_SQRT_PRICE_MINUS_ONE,
            ""
        );
        require(_swapBudget == 0, "League: swap not paid");
        _swapPool = address(0);

        int24 after_ = PoolPrice.stockTick(PoolPrice.spotTick(s.pool), s.usdcIsToken0);
        require(after_ - twap <= MAX_FILL_GAP, "League: buy moves price too much");
        bought = s.token.balanceOf(address(this)) - before;
        require(bought > 0, "League: bought nothing");
    }

    /// @notice Slipstream pays out first, then calls this to collect the USDC.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        require(msg.sender == _swapPool && msg.sender != address(0), "League: not the active pool");
        uint256 owe = uint256(amount0Delta > 0 ? amount0Delta : amount1Delta);
        require(owe <= _swapBudget, "League: pool asked too much");
        _swapBudget = 0;
        usdc.safeTransfer(msg.sender, owe);
    }

    /// @notice Add treasury stock to the champion's prize. The league coin's trading fees arrive
    /// here (see LeagueCoins), and anyone else can top up the pot too.
    function fundTreasury(uint256 amount) external nonReentrant {
        require(phase != Phase.Finished, "League: season over");
        require(amount > 0, "League: nothing to add");
        _stocks[config.treasuryStock].token.safeTransferFrom(msg.sender, address(this), amount);
        treasuryShares += amount;
        emit TreasuryFunded(msg.sender, amount);
    }

    // ───────────────────────────── Season ─────────────────────────────

    /// @notice Choose which of your stocks scores double. During the season the change starts
    /// next week, so a captain can't be picked after seeing this week's prices.
    function setCaptain(uint256 stockId) external {
        require(phase == Phase.Drafting || phase == Phase.Season, "League: wrong phase");
        uint256 seatPlusOne = _seatPlusOne[msg.sender];
        require(seatPlusOne != 0 && _ownerPlusOne[stockId] == seatPlusOne, "League: not your stock");
        uint256 seat = seatPlusOne - 1;
        if (phase == Phase.Drafting) {
            captain[seat] = uint8(stockId);
            _hasNextCaptain[seat] = false;
            emit CaptainSet(seat, stockId, 0);
        } else {
            _nextCaptain[seat] = uint8(stockId);
            _nextCaptainFrom[seat] = weeksSettled + 1;
            _hasNextCaptain[seat] = true;
            emit CaptainSet(seat, stockId, weeksSettled + 1);
        }
    }

    /// @notice Anyone can settle a week once it has ended. Scores are read from each pool's TWAP
    /// at the exact week end (falling back to now if the pool's history doesn't reach back).
    /// Score = sum of each stock's price change in ticks (+100 ≈ +1%), captain counted twice.
    function settleWeek() external nonReentrant inPhase(Phase.Season) {
        uint256 week = weeksSettled;
        uint256 end = seasonStart + (week + 1) * config.weekLength;
        require(block.timestamp >= end, "League: week not over");
        uint32 ago = uint32(block.timestamp - end);
        uint256 n = _managers.length;

        int256[] memory score = new int256[](n);
        for (uint256 seat; seat < n; seat++) {
            if (_hasNextCaptain[seat] && _nextCaptainFrom[seat] <= week) {
                captain[seat] = _nextCaptain[seat];
                _hasNextCaptain[seat] = false;
            }
            uint8[] storage r = _roster[seat];
            for (uint256 k; k < r.length; k++) {
                int256 move = _markToMarket(r[k], ago);
                score[seat] += move;
                if (r[k] == captain[seat]) score[seat] += move;
            }
            weekScore[week][seat] = score[seat];
            totalScore[seat] += score[seat];
            emit WeekScored(week, seat, score[seat]);
        }

        uint256 slots = n % 2 == 0 ? n : n + 1; // odd leagues: one manager has a bye each week
        for (uint256 i; i < slots / 2; i++) {
            uint256 a = _slot(i, week, slots);
            uint256 b = _slot(slots - 1 - i, week, slots);
            if (a >= n || b >= n) continue;
            if (score[a] == score[b]) {
                ties[a]++;
                ties[b]++;
                emit MatchSettled(week, a, b, score[a], score[b], -1);
            } else {
                (uint256 w, uint256 l) = score[a] > score[b] ? (a, b) : (b, a);
                wins[w]++;
                losses[l]++;
                emit MatchSettled(week, a, b, score[a], score[b], int256(w));
                _sendSlice(week, l, w);
            }
        }

        weeksSettled = week + 1;
        if (weeksSettled == config.seasonWeeks) _finish();
    }

    function _markToMarket(uint256 stockId, uint32 ago) internal returns (int256 move) {
        Stock memory s = _stocks[stockId];
        (bool ok, int24 t) = PoolPrice.tryTwapTick(s.pool, TWAP_WINDOW, ago);
        if (!ok) t = PoolPrice.twapTick(s.pool, TWAP_WINDOW, 0);
        t = PoolPrice.stockTick(t, s.usdcIsToken0);
        move = int256(t) - int256(markTick[stockId]);
        markTick[stockId] = t;
    }

    /// @dev Loser sends 10% of every holding to the winner's wallet as a real token transfer.
    function _sendSlice(uint256 week, uint256 loser, uint256 winner) internal {
        uint8[] storage r = _roster[loser];
        address to = _managers[winner];
        for (uint256 k; k < r.length; k++) {
            uint256 amount = (shares[r[k]] * SLICE_BPS) / 10_000;
            if (amount == 0) continue;
            shares[r[k]] -= amount;
            bool delivered = _sendOrOwe(_stocks[r[k]].token, to, amount);
            emit SliceSent(week, r[k], loser, to, amount, delivered);
        }
    }

    /// @dev Round-robin "circle" schedule: seat 0 stays, the rest rotate one place each week.
    function _slot(uint256 i, uint256 week, uint256 slots) internal pure returns (uint256) {
        if (i == 0) return 0;
        return 1 + ((i - 1 + week) % (slots - 1));
    }

    function _finish() internal {
        phase = Phase.Finished;
        uint256 n = _managers.length;
        uint256 best;
        for (uint256 seat = 1; seat < n; seat++) {
            if (wins[seat] > wins[best] || (wins[seat] == wins[best] && totalScore[seat] > totalScore[best])) best = seat;
        }
        _championPlusOne = best + 1;
        uint256 prize = treasuryShares;
        treasuryShares = 0;
        _sendOrOwe(_stocks[config.treasuryStock].token, _managers[best], prize);
        emit SeasonFinished(best, _managers[best], prize);

        for (uint256 seat; seat < n; seat++) {
            uint8[] storage r = _roster[seat];
            for (uint256 k; k < r.length; k++) {
                uint256 amount = shares[r[k]];
                if (amount == 0) continue;
                shares[r[k]] = 0;
                bool delivered = _sendOrOwe(_stocks[r[k]].token, _managers[seat], amount);
                emit BagReleased(seat, r[k], _managers[seat], amount, delivered);
            }
        }
    }

    function _sendOrOwe(address token, address to, uint256 amount) internal returns (bool) {
        if (token.tryTransfer(to, amount)) return true;
        owed[to][token] += amount;
        emit Owed(to, token, amount);
        return false;
    }

    /// @notice Collect shares that could not be delivered earlier, to any wallet you choose.
    function claim(address token, address to) external nonReentrant {
        uint256 amount = owed[msg.sender][token];
        require(amount > 0, "League: nothing owed");
        owed[msg.sender][token] = 0;
        token.safeTransfer(to, amount);
        emit Claimed(msg.sender, token, to, amount);
    }

    // ───────────────────────────── Views ─────────────────────────────

    function stockCount() external view returns (uint256) {
        return _stocks.length;
    }

    function stockAt(uint256 id) external view returns (Stock memory) {
        return _stocks[id];
    }

    function managers() external view returns (address[] memory) {
        return _managers;
    }

    function seatOf(address who) external view returns (bool joined, uint256 seat) {
        uint256 s = _seatPlusOne[who];
        return (s != 0, s == 0 ? 0 : s - 1);
    }

    function draftOrder() external view returns (uint8[] memory) {
        return _draftOrder;
    }

    function rosterOf(uint256 seat) external view returns (uint8[] memory) {
        return _roster[seat];
    }

    /// @return taken whether the stock was drafted, and by which seat
    function ownerOf(uint256 stockId) external view returns (bool taken, uint256 seat) {
        uint256 s = _ownerPlusOne[stockId];
        return (s != 0, s == 0 ? 0 : s - 1);
    }

    /// @return hasOpponent false on a bye week
    function opponentOf(uint256 seat, uint256 week) external view returns (bool hasOpponent, uint256 opponent) {
        uint256 n = _managers.length;
        uint256 slots = n % 2 == 0 ? n : n + 1;
        for (uint256 i; i < slots; i++) {
            if (_slot(i, week, slots) == seat) {
                uint256 o = _slot(slots - 1 - i, week, slots);
                return (o < n, o < n ? o : 0);
            }
        }
    }

    function champion() external view returns (bool decided, uint256 seat, address wallet) {
        uint256 c = _championPlusOne;
        if (c == 0) return (false, 0, address(0));
        return (true, c - 1, _managers[c - 1]);
    }

    function _abs(int24 x) private pure returns (int24) {
        return x < 0 ? -x : x;
    }
}
