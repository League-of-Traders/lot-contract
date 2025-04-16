// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "bsc-library/contracts/BEP20.sol";

// CakeToken with Governance.
contract LotToken is BEP20("League of traders token", "LOT") {
    /// @dev Creates `_amount` token to `_to`. Must only be called by the owner.
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }

    /// @dev A record of states for signing / validating signatures
    mapping(address => uint256) public nonces;

    function safe32(uint256 n, string memory errorMessage) internal pure returns (uint32) {
        require(n < 2**32, errorMessage);
        return uint32(n);
    }
}