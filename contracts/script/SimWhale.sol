// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IClPool} from "../src/interfaces/IClPool.sol";
import {PoolPrice} from "../src/lib/PoolPrice.sol";
import {TokenTransfer} from "../src/lib/TokenTransfer.sol";

/// @notice Dry-run helper only, never deployed: an outside trader inside an eth_simulateV1 run.
/// It moves one stock's price so a simulated week has a real winner and loser, and trades a
/// league coin so its pool earns real fees.
contract SimWhale {
    using TokenTransfer for address;

    address internal _pool;
    address internal _usdc;

    function buy(address pool, address usdc, uint256 usdcIn) external {
        _swap(pool, usdc, usdcIn);
    }

    /// @notice Sell `shareBps` of this contract's balance of `tokenIn` into `pool`.
    function swapShare(address pool, address tokenIn, uint256 shareBps) external {
        _swap(pool, tokenIn, (tokenIn.balanceOf(address(this)) * shareBps) / 10_000);
    }

    function _swap(address pool, address tokenIn, uint256 amountIn) internal {
        _pool = pool;
        _usdc = tokenIn;
        bool inIs0 = IClPool(pool).token0() == tokenIn;
        IClPool(pool).swap(
            address(this),
            inIs0,
            int256(amountIn),
            inIs0 ? PoolPrice.MIN_SQRT_PRICE_PLUS_ONE : PoolPrice.MAX_SQRT_PRICE_MINUS_ONE,
            ""
        );
    }

    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        require(msg.sender == _pool, "whale: pool");
        _usdc.safeTransfer(msg.sender, uint256(a0 > 0 ? a0 : a1));
    }
}
