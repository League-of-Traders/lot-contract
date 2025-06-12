// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "bsc-library/contracts/BEP20.sol";

contract LotToken is BEP20("DUMMY", "TOKEN") {
    uint256 public transferAllowedTimestamp;
    uint256 public ETA;
    mapping(address => bool) public whitelist;

    event NewTransferAllowedTimestamp(uint256 newTimestamp);
    event WhitelistAdded(address user);
    event WhitelistRemoved(address user);

    constructor(uint256 _transferAllowedTimestamp) {
        require(_transferAllowedTimestamp >= block.timestamp, "Invalid launch time");
        transferAllowedTimestamp = _transferAllowedTimestamp;
        whitelist[msg.sender] = true;
    }

    function setTransferAllowedTimestamp(uint256 newTimestamp) external onlyOwner {
        if (transferAllowedTimestamp > block.timestamp && ETA == 0) {
            // any value is accepted
            transferAllowedTimestamp = newTimestamp;
        } else {
            if (ETA == 0) {
                ETA = transferAllowedTimestamp + 1 days;
            }
            // can not be later than ETA
            require(newTimestamp <= ETA, "ETA!");
            transferAllowedTimestamp = newTimestamp;
        }
        emit NewTransferAllowedTimestamp(newTimestamp);
    }

    function addToWhitelist(address user) external onlyOwner {
        whitelist[user] = true;
        emit WhitelistAdded(user);
    }

    function removeFromWhitelist(address user) external onlyOwner {
        whitelist[user] = false;
        emit WhitelistRemoved(user);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        require(
            block.timestamp >= transferAllowedTimestamp || whitelist[from] || whitelist[to],
            "Transfers not allowed yet"
        );
        super._beforeTokenTransfer(from, to, amount);
    }

    function mintTo(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }
}
