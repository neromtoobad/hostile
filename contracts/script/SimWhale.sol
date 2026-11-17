// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IClPool} from "../src/interfaces/IClPool.sol";
import {PoolPrice} from "../src/lib/PoolPrice.sol";
import {TokenTransfer} from "../src/lib/TokenTransfer.sol";

/// @notice Dry-run helper only, never deployed: an outside buyer that moves one stock's price
/// inside an eth_simulateV1 run, so a simulated week has a real winner and loser.
contract SimWhale {
    using TokenTransfer for address;

    address internal _pool;
    address internal _usdc;

    function buy(address pool, address usdc, uint256 usdcIn) external {
        _pool = pool;
        _usdc = usdc;
        bool usdcIs0 = IClPool(pool).token0() == usdc;
        IClPool(pool).swap(
            address(this),
            usdcIs0,
            int256(usdcIn),
            usdcIs0 ? PoolPrice.MIN_SQRT_PRICE_PLUS_ONE : PoolPrice.MAX_SQRT_PRICE_MINUS_ONE,
            ""
        );
    }

    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        require(msg.sender == _pool, "whale: pool");
        _usdc.safeTransfer(msg.sender, uint256(a0 > 0 ? a0 : a1));
    }
}
