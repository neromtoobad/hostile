// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockToken} from "./MockToken.sol";

interface ISwapCallback {
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external;
}

/// @notice Test-only stand-in for a Slipstream stock/USDC pool: fixed swap rate, a tick that tests
/// move by hand, and a real tick-cumulative history so observe() gives true TWAPs.
contract MockPool {
    address public immutable token0;
    address public immutable token1;
    address public immutable usdc;
    address public immutable stock;
    bool public immutable usdcIsToken0;

    int24 public tick; // pool direction (token1 per token0)
    uint256 public stockPerUsdcE18; // swap output rate
    int24 public buyImpact; // stock-direction ticks one buy moves the price

    struct Checkpoint {
        uint32 time;
        int56 cumulative;
        int24 tickAfter;
    }

    Checkpoint[] public checkpoints;

    constructor(address usdc_, address stock_, bool usdcFirst, int24 stockTick_, uint256 rate) {
        usdc = usdc_;
        stock = stock_;
        usdcIsToken0 = usdcFirst;
        (token0, token1) = usdcFirst ? (usdc_, stock_) : (stock_, usdc_);
        tick = usdcFirst ? -stockTick_ : stockTick_;
        stockPerUsdcE18 = rate;
        checkpoints.push(Checkpoint(uint32(block.timestamp - 1 days), 0, tick));
    }

    function setStockTick(int24 stockTick_) external {
        _setTick(usdcIsToken0 ? -stockTick_ : stockTick_);
    }

    function setBuyImpact(int24 ticks) external {
        buyImpact = ticks;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, bool) {
        return (uint160(1) << 96, tick, 0, 1, 1, true);
    }

    function observe(uint32[] calldata secondsAgos) external view returns (int56[] memory cums, uint160[] memory spl) {
        cums = new int56[](secondsAgos.length);
        spl = new uint160[](secondsAgos.length);
        for (uint256 i; i < secondsAgos.length; i++) {
            uint32 target = uint32(block.timestamp) - secondsAgos[i];
            require(target >= checkpoints[0].time, "OLD");
            uint256 j = checkpoints.length - 1;
            while (checkpoints[j].time > target) j--;
            Checkpoint memory c = checkpoints[j];
            cums[i] = c.cumulative + int56(c.tickAfter) * int56(uint56(target - c.time));
        }
    }

    function swap(address recipient, bool zeroForOne, int256 amountSpecified, uint160, bytes calldata data)
        external
        returns (int256 amount0, int256 amount1)
    {
        require(zeroForOne == usdcIsToken0, "mock: only buys stock with USDC");
        require(amountSpecified > 0, "mock: exact input only");
        uint256 amountIn = uint256(amountSpecified);
        uint256 out = (amountIn * stockPerUsdcE18) / 1e18;
        MockToken(stock).transfer(recipient, out);
        (amount0, amount1) = usdcIsToken0 ? (amountSpecified, -int256(out)) : (-int256(out), amountSpecified);
        uint256 before = MockToken(usdc).balanceOf(address(this));
        ISwapCallback(msg.sender).uniswapV3SwapCallback(amount0, amount1, data);
        require(MockToken(usdc).balanceOf(address(this)) >= before + amountIn, "mock: not paid");
        if (buyImpact != 0) _setTick(usdcIsToken0 ? tick - buyImpact : tick + buyImpact);
    }

    function _setTick(int24 next) internal {
        Checkpoint memory last = checkpoints[checkpoints.length - 1];
        int56 cum = last.cumulative + int56(last.tickAfter) * int56(uint56(uint32(block.timestamp) - last.time));
        checkpoints.push(Checkpoint(uint32(block.timestamp), cum, next));
        tick = next;
    }
}
