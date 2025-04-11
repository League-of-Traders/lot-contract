// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IRewardVault {
    function payout(address user, uint256 amount) external;
}

/**
 * @title PointManager
 * @notice Manages user points awarded from authorized services and triggers reward claims through an external vault
 */
contract PointManager is Ownable {
    mapping(address => uint256) public points;
    mapping(address => bool) public isAuthorized;

    address public rewardVault;
    bool public claimingEnabled = false;
    uint256 public conversionRate = 1e18; // Default: 1 point = 1 token (18 decimals)

    event PointsAwarded(address indexed user, uint256 amount);
    event PointsClaimed(address indexed user, uint256 tokenAmount);
    event AuthorizationUpdated(address indexed contractAddress, bool allowed);
    event RewardVaultUpdated(address vault);
    event ClaimingEnabled(bool enabled);
    event ConversionRateUpdated(uint256 newRate);

    modifier onlyAuthorized() {
        require(isAuthorized[msg.sender], "Unauthorized");
        _;
    }

    constructor() Ownable(msg.sender) {
        transferOwnership(msg.sender);
    }

    /// @notice Register or revoke a contract authorized to award points
    function setAuthorized(address contractAddr, bool allowed) external onlyOwner {
        isAuthorized[contractAddr] = allowed;
        emit AuthorizationUpdated(contractAddr, allowed);
    }

    /// @notice Update the address of the reward vault contract
    function setRewardVault(address _vault) external onlyOwner {
        rewardVault = _vault;
        emit RewardVaultUpdated(_vault);
    }

    /// @notice Enable or disable claiming (e.g., after TGE)
    function setClaimingEnabled(bool enabled) external onlyOwner {
        claimingEnabled = enabled;
        emit ClaimingEnabled(enabled);
    }

    /// @notice Set how many tokens are given per point (e.g., 1 point = 0.5 token)
    function setConversionRate(uint256 rate) external onlyOwner {
        require(rate > 0, "Rate must be positive");
        conversionRate = rate;
        emit ConversionRateUpdated(rate);
    }

    /// @notice Award points to a user (only callable by authorized contracts)
    function awardPoints(address user, uint256 amount) external onlyAuthorized {
        points[user] += amount;
        emit PointsAwarded(user, amount);
    }

    /// @notice Return user's point balance
    function getPoints(address user) external view returns (uint256) {
        return points[user];
    }

    /// @notice Users can claim tokens proportional to their point balance
    function claimPoints(uint256 pointAmount) external {
        require(claimingEnabled, "Claiming not enabled");
        require(points[msg.sender] >= pointAmount, "Insufficient points");
        require(rewardVault != address(0), "Reward vault not set");

        points[msg.sender] -= pointAmount;

        uint256 tokenAmount = pointAmount * conversionRate / 1e18;
        IRewardVault(rewardVault).payout(msg.sender, tokenAmount);

        emit PointsClaimed(msg.sender, tokenAmount);
    }
}
