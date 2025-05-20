// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "bsc-library/contracts/IBEP20.sol";

contract TimeBasedStaking is Ownable, ReentrancyGuard {
    IBEP20 public stakingToken;
    IBEP20 public rewardToken;

    uint256 public immutable startTimestamp;
    uint256 public constant TIMESTAMP_PER_YEAR = 365 days;
    uint256 public constant TIMESTAMP_PER_DAY = 1 days;
    uint256 public constant MAX_LOCK_DAYS = 1460; // 4 years
    uint256 public constant PRECISION_FACTOR = 1e18;

    uint256 public totalRewardCap;
    uint256 public accumulatedLockupDays;
    uint256 public stakerCount;
    uint256 public accRewardPerShare;
    uint256 public lastRewardTimestamp;
    uint256 public totalStaked;
    uint256 public totalWeightedStaked;

    struct StakeInfo {
        uint256 amount;
        uint256 weight;
        uint256 rewardDebt;
        uint256 claimed;
        uint256 lockupEndBlock;
    }

    mapping(address => StakeInfo) public stakes;
    mapping(address => bool) public isBanned;
    mapping(uint256 => uint256) public rewardPerYear;


    event Banned(address indexed user);
    event Unbanned(address indexed user);
    event Staked(address indexed user, uint256 amount, uint256 lockupDays);
    event Withdrawn(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event RewardAdded(uint256 indexed fromYear, uint256 amount);

    constructor(
        IBEP20 _stakingToken,
        IBEP20 _rewardToken
    ) Ownable(msg.sender) {
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        startTimestamp = block.timestamp;
        lastRewardTimestamp = block.timestamp;
    }

    function getLockupWeight(uint256 lockupDays) public pure returns (uint256) {
        require(lockupDays <= MAX_LOCK_DAYS, "Exceeds max lock");
        return (lockupDays * PRECISION_FACTOR) / MAX_LOCK_DAYS;
    }

    function setReward(uint256 amount) external onlyOwner {
        require(amount > 0, "Invalid amount");
        require(totalRewardCap == 0, "Already set");

        totalRewardCap = amount;
        uint256 fromYear = _getYearIndex(block.timestamp);

        _distributeDecay(fromYear, amount);
        _updatePool();

        require(rewardToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit RewardAdded(fromYear, amount);
    }

    function addReward(uint256 amount) external onlyOwner {
        require(amount > 0, "Invalid amount");

        _updatePool();

        totalRewardCap += amount;

        uint256 fromYear = _getYearIndex(block.timestamp) + 1;

        _distributeDecay(fromYear, amount);

        require(rewardToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        emit RewardAdded(fromYear, amount);
    }

    function _getYearIndex(uint256 timestamp) internal view returns (uint256) {
        return (timestamp - startTimestamp) / TIMESTAMP_PER_YEAR;
    }


    function _distributeDecay(uint256 fromYear, uint256 totalAmount) internal {
        uint256 remaining = totalAmount;

        for (uint256 i = 0; i < 100 && remaining > 0; i++) {
            uint256 decayAmount = remaining / 3;
            rewardPerYear[fromYear + i] += decayAmount;
            remaining -= decayAmount;
        }
    }

    function _updatePool() internal {
        if (block.timestamp <= lastRewardTimestamp || totalWeightedStaked == 0) return;

        uint256 reward = _calculateTotalReward(lastRewardTimestamp, block.timestamp);
        accRewardPerShare += (reward * PRECISION_FACTOR) / totalWeightedStaked;

        lastRewardTimestamp = block.timestamp;
    }

    function stake(uint256 amount, uint256 lockupDays) external nonReentrant {
        require(lockupDays <= MAX_LOCK_DAYS, "Too long");
        require(!isBanned[msg.sender], "Banned user");
        require(totalRewardCap != 0, "Reward not set");

        _updatePool();
        StakeInfo storage s = stakes[msg.sender];

        require(amount > 0 || s.amount > 0, "Cannot init stake 0");
        require(s.lockupEndBlock <=  block.timestamp + (lockupDays * TIMESTAMP_PER_DAY), "Lock up should be longer then initial lockup period");

        if (s.weight > 0) {
            uint256 pending = (s.weight * accRewardPerShare) / PRECISION_FACTOR - s.rewardDebt;
            if (pending > 0) {
                s.claimed += pending;
                rewardToken.transfer(msg.sender, pending);
                emit Claimed(msg.sender, pending);
            }
        }

        if (s.amount == 0) {
            stakerCount += 1;
        } else {
            accumulatedLockupDays -= (s.lockupEndBlock - block.timestamp) /TIMESTAMP_PER_DAY;
        }
        accumulatedLockupDays += lockupDays;


        uint256 weight = (amount * getLockupWeight(lockupDays)) / PRECISION_FACTOR;
        s.amount += amount;
        s.weight += weight;
        s.rewardDebt = (s.weight * accRewardPerShare) / PRECISION_FACTOR;
        s.lockupEndBlock = block.timestamp + (lockupDays * TIMESTAMP_PER_DAY);
        totalWeightedStaked += weight;
        totalStaked += amount;

        stakingToken.transferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, lockupDays);
    }

    function withdraw(uint256 amount) external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(block.timestamp >= s.lockupEndBlock, "Locked");
        require(amount > 0 && s.amount >= amount, "Invalid");
        require(totalRewardCap != 0, "Reward not set");

        _updatePool();

        uint256 pending = (s.weight * accRewardPerShare) / PRECISION_FACTOR - s.rewardDebt;
        if (pending > 0) {
            s.claimed += pending;
            rewardToken.transfer(msg.sender, pending);
            emit Claimed(msg.sender, pending);
        }

        uint256 withdrawnWeight = (s.weight * amount) / s.amount;
        s.amount -= amount;
        s.weight -= withdrawnWeight;
        s.rewardDebt = (s.weight * accRewardPerShare) / PRECISION_FACTOR;
        totalWeightedStaked -= withdrawnWeight;
        totalStaked -= amount;

        stakingToken.transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function claim() external nonReentrant {
        require(totalRewardCap != 0, "Reward not set");

        _updatePool();
        StakeInfo storage s = stakes[msg.sender];

        uint256 pending = (s.weight * accRewardPerShare) / PRECISION_FACTOR - s.rewardDebt;
        require(pending > 0, "No rewards");

        s.claimed += pending;
        s.rewardDebt = (s.weight * accRewardPerShare) / PRECISION_FACTOR;
        rewardToken.transfer(msg.sender, pending);
        emit Claimed(msg.sender, pending);
    }

    function pendingReward(address user) external view returns (uint256) {
        StakeInfo storage s = stakes[user];
        if (s.weight == 0 || totalWeightedStaked == 0) return 0;

        uint256 reward = _calculateTotalReward(lastRewardTimestamp, block.timestamp);
        uint256 updatedAcc = accRewardPerShare + (reward * PRECISION_FACTOR) / totalWeightedStaked;

        return (s.weight * updatedAcc) / PRECISION_FACTOR - s.rewardDebt;
    }
    

    function estimateReward(uint256 amount, uint256 lockupDays) external view returns (uint256) {
        uint256 lockupTIMESTAMP = lockupDays * TIMESTAMP_PER_DAY;
        uint256 projectedReward = _calculateTotalReward(block.timestamp, block.timestamp + lockupTIMESTAMP);
        uint256 weight = (amount * getLockupWeight(lockupDays)) / PRECISION_FACTOR;
        uint256 newTotalWeighted = totalWeightedStaked + weight;
        if (newTotalWeighted == 0) return 0;

        uint256 projectedAcc = accRewardPerShare + (projectedReward * PRECISION_FACTOR) / newTotalWeighted;
        return (weight * projectedAcc) / PRECISION_FACTOR;
    }

    function _calculateTotalReward(uint256 from, uint256 to) internal view returns (uint256) {
        if (from >= to) return 0;

        uint256 sum = 0;
        uint256 fromYear = _getYearIndex(from);
        uint256 toYear = _getYearIndex(to);

        for (uint256 i = fromYear; i <= toYear; i++) {
            uint256 yearStart = startTimestamp + (i * TIMESTAMP_PER_YEAR);
            uint256 yearEnd = yearStart + TIMESTAMP_PER_YEAR;

            uint256 overlapStart = from > yearStart ? from : yearStart;
            uint256 overlapEnd = to < yearEnd ? to : yearEnd;

            if (overlapEnd <= overlapStart) continue;

            uint256 duration = overlapEnd - overlapStart;
            uint256 rewardForYear = rewardPerYear[i];

            sum += (duration * rewardForYear) / TIMESTAMP_PER_YEAR;
        }

        return sum;
    }


    function getAPY() external view returns (uint256) {
        if (totalWeightedStaked == 0) return 0;

        uint256 reward = _calculateTotalReward(block.timestamp, block.timestamp + TIMESTAMP_PER_YEAR);
        return reward / totalWeightedStaked;
    }

    function getAvgLockupYears() external view returns (uint256) {
        if (stakerCount == 0) return 0;
        return (accumulatedLockupDays * 1e18) / (stakerCount * 365);
    }

    function getAccRewardPerShareNow() external view returns (uint256) {
        return accRewardPerShare;
    }

    function emergencyWithdraw() external nonReentrant {
        StakeInfo storage user = stakes[msg.sender];
        uint256 amountToTransfer = user.amount;

        require(amountToTransfer > 0, "Nothing to withdraw");
        require(user.claimed == 0, "Already claimed");

        uint256 penalty = (amountToTransfer * 10_000) / 100_000;
        uint256 finalAmount = amountToTransfer - penalty;

        totalWeightedStaked -= user.weight;
        totalStaked -= amountToTransfer;
        accumulatedLockupDays -= (user.lockupEndBlock > block.timestamp)
            ? (user.lockupEndBlock - block.timestamp) / TIMESTAMP_PER_DAY
            : 0;

        user.amount = 0;
        user.weight = 0;
        user.rewardDebt = 0;
        user.lockupEndBlock = 0;

        stakingToken.transfer(msg.sender, finalAmount);
        if (penalty > 0) stakingToken.transfer(owner(), penalty);

        emit EmergencyWithdraw(msg.sender, finalAmount);
    }

    function ban(address user) external onlyOwner {
        require(!isBanned[user], "Already banned");
        isBanned[user] = true;
        emit Banned(user);
    }

    function unban(address user) external onlyOwner {
        require(isBanned[user], "Not banned");
        isBanned[user] = false;
        emit Unbanned(user);
    }

    function testCalculateTotalReward(uint256 from, uint256 to) external view returns (uint256) {
        return _calculateTotalReward(from, to);
    }

    function testGetYearIndex(uint256 timestamp) external view returns (uint256) {
        return _getYearIndex(timestamp);
    }
}