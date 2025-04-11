// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
}

/**
 * @title RewardVault
 * @notice This contract holds and distributes reward tokens on behalf of PointManager.
 *         Only PointManager is allowed to trigger payouts.
 */
contract RewardVault is Ownable {
    address public pointManager;
    IERC20 public rewardToken;

    event TokenSet(address token);
    event PointManagerSet(address pointManager);
    event RewardPayout(address indexed to, uint256 amount);

    modifier onlyPointManager() {
        require(msg.sender == pointManager, "Not authorized");
        _;
    }

    constructor(address _token) Ownable(msg.sender) {
        rewardToken = IERC20(_token);
        transferOwnership(msg.sender);
        emit TokenSet(_token);
    }

    function setAdmin(address _admin) external onlyOwner {
        require(_admin != address(0));
        transferOwnership(_admin);

    }
    /// @notice Set the PointManager contract that is allowed to trigger payouts
    function setPointManager(address _manager) external onlyOwner {
        pointManager = _manager;
        emit PointManagerSet(_manager);
    }

    /// @notice Update the token address (optional)
    function setRewardToken(address _token) external onlyOwner {
        rewardToken = IERC20(_token);
        emit TokenSet(_token);
    }

    /// @notice Called by PointManager to send reward tokens to a user
    function payout(address to, uint256 amount) external onlyPointManager {
        require(to != address(0), "Invalid address");
        require(rewardToken.transfer(to, amount), "Token transfer failed");
        emit RewardPayout(to, amount);
    }

    /// @notice Allow owner to withdraw unused tokens (in case of emergency)
    function rescueTokens(address to, uint256 amount) external onlyOwner {
        require(rewardToken.transfer(to, amount), "Rescue failed");
    }
}
