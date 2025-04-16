// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IPointManager {
    function awardPoints(address user, uint256 amount) external;
}

/**
 * @title FollowSocial
 * @notice Users can follow/unfollow others and earn points. A portion of payment goes to the followee; the rest stays in contract.
 */
contract FollowSocial is Ownable, ReentrancyGuard {
    mapping(address => mapping(address => bool)) public isFollowing;
    mapping(address => address[]) public followers;
    mapping(address => address[]) public followees;

    IPointManager public pointManager;
    uint256 public pointReward = 10;
    uint256 public OWNER_FEE_PERCENT = 30;
    uint256 public lastWithdrawalTime;
    uint256 public withdrawalCooldown = 1 days;

    event Followed(address indexed follower, address indexed followee);
    event Unfollowed(address indexed follower, address indexed followee);
    event PointManagerUpdated(address pointManager);
    event PointRewardUpdated(uint256 newReward);
    event OwnerFeePaid(uint256 amount);
    event Withdrawal(address indexed owner, uint256 amount);
    event Refund(address indexed user, uint256 amount);

    constructor(address _pointManager) Ownable(msg.sender) {
        pointManager = IPointManager(_pointManager);
        transferOwnership(msg.sender);
    }

    modifier onlyCooldownPassed() {
        require(block.timestamp >= lastWithdrawalTime + withdrawalCooldown, "Withdrawal cooldown in effect");
        _;
    }

    function setOwner(address _admin) external onlyOwner {
        require(_admin != address(0), "Zero address not allowed");
        transferOwnership(_admin);
    }

    function setOwnerFee(uint256 feePercent) external onlyOwner {
        require(feePercent < 100, "Invalid fee percentage");
        OWNER_FEE_PERCENT = feePercent;
    }

    function setPointManager(address _pointManager) external onlyOwner {
        pointManager = IPointManager(_pointManager);
        emit PointManagerUpdated(_pointManager);
    }

    function setPointReward(uint256 newReward) external onlyOwner {
        pointReward = newReward;
        emit PointRewardUpdated(newReward);
    }

    function follow(address followee) external payable nonReentrant {
        require(followee != msg.sender, "Cannot follow yourself");
        require(!isFollowing[msg.sender][followee], "Already following");
        require(msg.value > 0, "No payment sent");

        isFollowing[msg.sender][followee] = true;
        followees[msg.sender].push(followee);
        followers[followee].push(msg.sender);

        pointManager.awardPoints(msg.sender, pointReward);

        uint256 ownerFee = (msg.value * OWNER_FEE_PERCENT) / 100;
        uint256 followeeAmount = msg.value - ownerFee;

        (bool successViewee, ) = payable(followee).call{value: followeeAmount}("");
        require(successViewee, "Failed to send payment to followee");

        emit OwnerFeePaid(ownerFee);
        emit Followed(msg.sender, followee);
    }

    function unfollow(address followee) external nonReentrant {
        require(isFollowing[msg.sender][followee], "Not following");
        isFollowing[msg.sender][followee] = false;

        _removeFromList(followees[msg.sender], followee);
        _removeFromList(followers[followee], msg.sender);

        emit Unfollowed(msg.sender, followee);
    }

    function withdrawFunds(uint256 amount) external onlyOwner nonReentrant onlyCooldownPassed {
        require(address(this).balance >= amount, "Insufficient balance");

        lastWithdrawalTime = block.timestamp;

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdrawal failed");

        emit Withdrawal(owner(), amount);
    }

    function _removeFromList(address[] storage list, address target) internal {
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i] == target) {
                list[i] = list[list.length - 1];
                list.pop();
                break;
            }
        }
    }

    function getFollowers(address user) external view returns (address[] memory) {
        return followers[user];
    }

    function getFollowees(address user) external view returns (address[] memory) {
        return followees[user];
    }

    fallback() external payable {
        emit Refund(msg.sender, msg.value);
    }

    receive() external payable {
        emit Refund(msg.sender, msg.value);
    }
}
