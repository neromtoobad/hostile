// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The parts of an Aerodrome Slipstream (concentrated liquidity) pool that Hostile uses.
/// Every liquid Coinbase stock token on Base trades in one of these pools against USDC.
interface IClPool {
    function token0() external view returns (address);
    function token1() external view returns (address);

    /// @dev amountSpecified > 0 means exact input. The pool calls back `uniswapV3SwapCallback` to get paid.
    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96, bytes calldata data)
        external
        returns (int256 amount0, int256 amount1);

    /// @dev Cumulative tick values for each `secondsAgo`; the difference over a window / window = average tick (TWAP).
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
}
