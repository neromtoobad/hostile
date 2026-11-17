// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Test-only ERC-20 that stands in for USDC or a Coinbase stock token, with a blocklist
/// like the B20 transfer policy (a blocked wallet cannot receive).
contract MockToken {
    string public symbol;
    uint8 public immutable decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public blocked;

    constructor(string memory symbol_, uint8 decimals_) {
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setBlocked(address who, bool b) external {
        blocked[who] = b;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(!blocked[to], "policy: receiver blocked");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}
