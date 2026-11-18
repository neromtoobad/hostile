// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {LeagueFactory} from "../src/LeagueFactory.sol";
import {LeagueCoins} from "../src/LeagueCoins.sol";
import {IStonksLauncher, IStonksFeeLocker} from "../src/interfaces/IStonks.sol";

/// Deploys LeagueFactory on Base mainnet with the liquid stocks from stocks.base.json.
///   forge script script/Deploy.s.sol --rpc-url base --broadcast --verify
/// Note: forge's local simulation cannot run Coinbase's B20 precompiles, but the factory
/// constructor never calls them, so the deploy simulates fine.
contract Deploy is Script {
    // Stonks Exchange V2 on Base (Stocks Maxxing launchpad partner).
    address constant STONKS_LAUNCHER = 0xD58a240995405941cdbA41cd35d7920F2B212B4a;
    address constant STONKS_LOCKER = 0x43555104f569D17026037E5637691b95c79fD03A;

    function run() external {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/script/stocks.base.json"));
        address usdc = vm.parseJsonAddress(json, ".usdc");
        uint256 total;
        while (vm.keyExistsJson(json, string.concat(".stocks[", vm.toString(total), "]"))) total++;
        string[] memory symbols = new string[](total);
        address[] memory allTokens = new address[](total);
        address[] memory allPools = new address[](total);
        for (uint256 i; i < total; i++) {
            string memory at = string.concat(".stocks[", vm.toString(i), "]");
            symbols[i] = vm.parseJsonString(json, string.concat(at, ".symbol"));
            allTokens[i] = vm.parseJsonAddress(json, string.concat(at, ".token"));
            allPools[i] = vm.parseJsonAddress(json, string.concat(at, ".pool"));
        }

        uint256 n;
        bool[] memory keep = new bool[](symbols.length);
        for (uint256 i; i < symbols.length; i++) {
            keep[i] = !_skip(symbols[i]);
            if (keep[i]) n++;
        }
        address[] memory tokens = new address[](n);
        address[] memory pools = new address[](n);
        uint256 j;
        for (uint256 i; i < symbols.length; i++) {
            if (!keep[i]) continue;
            tokens[j] = allTokens[i];
            pools[j] = allPools[i];
            j++;
        }

        vm.startBroadcast();
        LeagueFactory factory = new LeagueFactory(usdc, tokens, pools);
        LeagueCoins coins = new LeagueCoins(factory, IStonksLauncher(STONKS_LAUNCHER), IStonksFeeLocker(STONKS_LOCKER));
        vm.stopBroadcast();
        console.log("LeagueFactory", address(factory), "stocks", n);
        console.log("LeagueCoins", address(coins));
    }

    /// Pools that barely trade: left out of the draft list.
    function _skip(string memory s) internal pure returns (bool) {
        bytes32 h = keccak256(bytes(s));
        return h == keccak256("LITE") || h == keccak256("AAOI") || h == keccak256("BRK.B");
    }
}
