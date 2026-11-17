// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IClPool} from "../interfaces/IClPool.sol";

/// @notice Reads prices from a Slipstream pool as ticks. One tick = a 0.01% price step, so the
/// difference between two ticks is a log return: +100 ticks ≈ +1%.
/// Hostile never needs a dollar price: it scores and guards buys with tick differences only.
library PoolPrice {
    uint160 internal constant MIN_SQRT_PRICE_PLUS_ONE = 4295128740;
    uint160 internal constant MAX_SQRT_PRICE_MINUS_ONE = 1461446703485210103287273052203988822378723970341;

    /// @notice Average pool tick over [now - ago - window, now - ago].
    function twapTick(address pool, uint32 window, uint32 ago) internal view returns (int24) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = ago + window;
        secondsAgos[1] = ago;
        (int56[] memory cumulatives,) = IClPool(pool).observe(secondsAgos);
        return _average(cumulatives[1] - cumulatives[0], window);
    }

    /// @notice Same as twapTick, but returns ok = false instead of reverting when the pool's
    /// history does not reach back far enough.
    function tryTwapTick(address pool, uint32 window, uint32 ago) internal view returns (bool ok, int24 tick) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = ago + window;
        secondsAgos[1] = ago;
        try IClPool(pool).observe(secondsAgos) returns (int56[] memory cumulatives, uint160[] memory) {
            return (true, _average(cumulatives[1] - cumulatives[0], window));
        } catch {
            return (false, 0);
        }
    }

    /// @notice Current pool tick. Slipstream's slot0 returns 6 values and Uniswap v3's returns 7;
    /// both start with (sqrtPriceX96, tick), so only those two are decoded.
    function spotTick(address pool) internal view returns (int24 tick) {
        (bool ok, bytes memory data) = pool.staticcall(abi.encodeWithSignature("slot0()"));
        require(ok && data.length >= 64, "PoolPrice: slot0");
        (, tick) = abi.decode(data, (uint160, int24));
    }

    /// @notice Turns a pool tick into "stock priced in USDC" direction: higher = stock worth more.
    function stockTick(int24 poolTick, bool usdcIsToken0) internal pure returns (int24) {
        return usdcIsToken0 ? -poolTick : poolTick;
    }

    function _average(int56 delta, uint32 window) private pure returns (int24 tick) {
        int56 w = int56(uint56(window));
        tick = int24(delta / w);
        if (delta < 0 && delta % w != 0) tick--; // round toward negative infinity
    }
}
