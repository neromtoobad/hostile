// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {MockToken} from "./MockToken.sol";
import {IStonksLauncher} from "../../src/interfaces/IStonks.sol";

/// @notice Test-only stand-in for the Stonks Exchange launcher + fee locker. `collect` pays the
/// fee owner whatever fees a test queued with `accrue`. The real contracts are exercised in
/// tools/live-dry-run.mjs against Base mainnet state.
contract MockStonks {
    struct Launch {
        address quote;
        address feeOwner;
        int24 tickSpacing;
    }

    mapping(address => Launch) public launches;
    mapping(address => uint256) public quoteFees;
    mapping(address => uint256) public coinFees;
    mapping(address => mapping(address => uint256)) public claimable;
    address public lastCoin;

    function enforcedSupply() external pure returns (uint256) {
        return 1e27;
    }

    function launchFeeWei() external pure returns (uint256) {
        return 0;
    }

    function launchWithMeta(IStonksLauncher.LaunchParams calldata p, IStonksLauncher.Meta calldata)
        external
        payable
        returns (address token, uint256 tokenId)
    {
        MockToken coin = new MockToken(p.symbol, 18);
        coin.mint(address(this), p.totalSupply);
        launches[address(coin)] = Launch(p.quote, p.feeOwner == address(0) ? msg.sender : p.feeOwner, p.tickSpacing);
        lastCoin = address(coin);
        return (address(coin), 1);
    }

    /// Test helper: pretend the coin's pool earned these fees (quote must be minted to this mock).
    function accrue(address coin, uint256 quoteAmount, uint256 coinAmount) external {
        quoteFees[coin] += quoteAmount;
        coinFees[coin] += coinAmount;
    }

    function collect(address coin) external {
        Launch memory l = launches[coin];
        uint256 q = quoteFees[coin];
        uint256 c = coinFees[coin];
        quoteFees[coin] = 0;
        coinFees[coin] = 0;
        if (q > 0) MockToken(l.quote).transfer(l.feeOwner, q);
        if (c > 0) MockToken(coin).transfer(l.feeOwner, c);
    }

    function claim(address) external pure {
        revert("nothing");
    }

    function feeOwnerOf(address coin) external view returns (address) {
        return launches[coin].feeOwner;
    }
}
