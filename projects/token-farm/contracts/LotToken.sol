// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "bsc-library/contracts/BEP20.sol";

// CakeToken with Governance.
contract LotToken is BEP20("League of traders", "LOT") {
    /// @dev Creates `_amount` token to `_to`. Must only be called by the owner.
    function mintTo(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }
}