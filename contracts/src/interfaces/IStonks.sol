// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice The parts of Stonks Exchange (a Stocks Maxxing launchpad partner) that Hostile uses.
/// Launcher (proxy) 0xD58a240995405941cdbA41cd35d7920F2B212B4a and fee locker
/// 0x43555104f569D17026037E5637691b95c79fD03A on Base, source verified on Sourcify.
/// A launch puts the coin's whole supply into an Aerodrome Slipstream pool priced in a stock token
/// and locks it forever; only swap fees can be collected, split between the platform and the
/// coin's fee owner.
interface IStonksLauncher {
    struct LaunchParams {
        string name;
        string symbol;
        uint256 totalSupply;
        address quote; // the stock token the coin is priced in
        int24 tickSpacing; // launch tier: 80 (1% fee), 500 (2%), 150 (3%)
        uint256 devBuyQuote;
        uint256 minDevBuyTokens;
        bytes32 userSalt;
        uint256 maxLaunchFeeWei;
        uint16 maxPlatformBps;
        address feeOwner; // receives AND controls the creator share of fees
        bool quoteOnly;
    }

    struct Meta {
        string image;
        string banner;
        string description;
        string website;
        string twitter;
        string telegram;
    }

    function launchWithMeta(LaunchParams calldata p, Meta calldata meta)
        external
        payable
        returns (address token, uint256 tokenId);

    function enforcedSupply() external view returns (uint256);
    function launchFeeWei() external view returns (uint256);
    function tiers(int24 tickSpacing) external view returns (uint24 expectedFeePips, uint16 platformBps, bool enabled);
}

interface IStonksFeeLocker {
    /// @notice Anyone can call: collects the coin pool's swap fees and pays the fee owner's share.
    function collect(address token) external;
    /// @notice Payouts that could not be pushed (e.g. a blocked transfer) wait here.
    function claimable(address who, address asset) external view returns (uint256);
    function claim(address asset) external;
    function feeOwnerOf(address token) external view returns (address);
}
