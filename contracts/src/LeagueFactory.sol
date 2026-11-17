// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {League} from "./League.sol";

/// @title Hostile league factory
/// @notice Anyone can open a league. Each league copies the current stock list when it is created,
/// so later list changes never affect a league that is already running.
/// @dev The owner can only edit the stock list for future leagues. It cannot touch any league's funds.
contract LeagueFactory {
    address public immutable usdc;
    address public owner;

    address[] internal _tokens; // Coinbase stock tokens, ordered by pool liquidity (autopick takes the first free one)
    address[] internal _pools; // matching Aerodrome Slipstream stock/USDC pools
    address[] internal _leagues;

    uint32 public constant MIN_WEEK = 1 hours;
    uint32 public constant MIN_PICK_WINDOW = 1 minutes;
    uint8 public constant MAX_MANAGERS = 12;
    uint8 public constant MAX_WEEKS = 26;

    event LeagueCreated(address indexed league, address indexed commissioner, string name, League.Config config);
    event StocksSet(uint256 count);
    event OwnerChanged(address owner);

    constructor(address usdc_, address[] memory tokens, address[] memory pools) {
        usdc = usdc_;
        owner = msg.sender;
        _setStocks(tokens, pools);
    }

    function createLeague(string calldata name, League.Config calldata cfg) external returns (League league) {
        require(bytes(name).length > 0 && bytes(name).length <= 48, "Factory: name");
        require(cfg.weekLength >= MIN_WEEK, "Factory: week too short");
        require(cfg.pickWindow >= MIN_PICK_WINDOW, "Factory: pick window too short");
        require(cfg.maxManagers <= MAX_MANAGERS && cfg.seasonWeeks <= MAX_WEEKS, "Factory: too big");
        league = new League(usdc, msg.sender, name, cfg, _tokens, _pools);
        _leagues.push(address(league));
        emit LeagueCreated(address(league), msg.sender, name, cfg);
    }

    function setStocks(address[] calldata tokens, address[] calldata pools) external {
        require(msg.sender == owner, "Factory: only owner");
        _setStocks(tokens, pools);
    }

    function setOwner(address next) external {
        require(msg.sender == owner, "Factory: only owner");
        owner = next;
        emit OwnerChanged(next);
    }

    function _setStocks(address[] memory tokens, address[] memory pools) internal {
        require(tokens.length == pools.length && tokens.length > 0 && tokens.length <= 255, "Factory: stocks");
        _tokens = tokens;
        _pools = pools;
        emit StocksSet(tokens.length);
    }

    function stocks() external view returns (address[] memory tokens, address[] memory pools) {
        return (_tokens, _pools);
    }

    function leagues() external view returns (address[] memory) {
        return _leagues;
    }

    function leagueCount() external view returns (uint256) {
        return _leagues.length;
    }
}
