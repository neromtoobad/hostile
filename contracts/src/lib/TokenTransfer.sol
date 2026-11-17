// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Token calls that work for USDC and for Coinbase B20 stock tokens.
/// B20 tokens are native precompiles with no bytecode, so every call is low level and a call
/// only counts as successful when it returns a real `true` (an address with no code returns
/// nothing and must not look like a success).
library TokenTransfer {
    function tryTransfer(address token, address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        return ok && ret.length >= 32 && abi.decode(ret, (uint256)) == 1;
    }

    function safeTransfer(address token, address to, uint256 amount) internal {
        require(tryTransfer(token, to, amount), "Token: transfer failed");
    }

    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        require(ok && ret.length >= 32 && abi.decode(ret, (uint256)) == 1, "Token: transferFrom failed");
    }

    function balanceOf(address token, address who) internal view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        require(ok && ret.length >= 32, "Token: balanceOf failed");
        return abi.decode(ret, (uint256));
    }
}
