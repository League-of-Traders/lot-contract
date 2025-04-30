// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "bsc-library/contracts/IBEP20.sol";

contract TimeBasedStaking is Ownable, ReentrancyGuard {
    IBEP20 public stakingToken;
    IBEP20 public rewardToken;

    uint256 public immutable startBlock;
    uint256 public immutable totalRewardCap;
    uint256 public constant BLOCKS_PER_YEAR = 365 days;
    uint256 public constant BLOCKS_PER_DAY = 1 days;
    uint256 public constant MAX_LOCK_DAYS = 1460; // 4 years
    uint256 public constant PRECISION_FACTOR = 1e18;

    uint256 public accumulatedLockupDays;
    uint256 public stakerCount;
    uint256 public accRewardPerShare;
    uint256 public lastRewardBlock;
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

    event Staked(address indexed user, uint256 amount, uint256 lockupDays);
    event Withdrawn(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);

    constructor(
        IBEP20 _stakingToken,
        IBEP20 _rewardToken,
        uint256 _totalRewardCap
    ) Ownable(msg.sender) {
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        totalRewardCap = _totalRewardCap;
        startBlock = block.number;
        lastRewardBlock = block.number;
    }

    function getLockupWeight(uint256 lockupDays) public pure returns (uint256) {
        require(lockupDays <= MAX_LOCK_DAYS, "Exceeds max lock");
        return (lockupDays * PRECISION_FACTOR) / MAX_LOCK_DAYS;
    }

    function _updatePool() internal {
        if (block.number <= lastRewardBlock || totalWeightedStaked == 0) return;

        uint256 reward = _calculateTotalReward(lastRewardBlock, block.number);
        accRewardPerShare += (reward * PRECISION_FACTOR) / totalWeightedStaked;

        lastRewardBlock = block.number;
    }

    function stake(uint256 amount, uint256 lockupDays) external nonReentrant {
        require(lockupDays <= MAX_LOCK_DAYS, "Too long");

        _updatePool();
        StakeInfo storage s = stakes[msg.sender];

        require(amount > 0 || s.amount > 0, "Cannot init stake 0");
        require(s.lockupEndBlock <=  block.number + (lockupDays * BLOCKS_PER_DAY), "Lock up should be longer then initial lockup period");

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
            accumulatedLockupDays -= (s.lockupEndBlock - block.number) /BLOCKS_PER_DAY;
        }
        accumulatedLockupDays += lockupDays;


        uint256 weight = (amount * getLockupWeight(lockupDays)) / PRECISION_FACTOR;
        s.amount += amount;
        s.weight += weight;
        s.rewardDebt = (s.weight * accRewardPerShare) / PRECISION_FACTOR;
        s.lockupEndBlock = block.number + (lockupDays * BLOCKS_PER_DAY);
        totalWeightedStaked += weight;
        totalStaked += amount;

        stakingToken.transferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, lockupDays);
    }

    function withdraw(uint256 amount) external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(block.number >= s.lockupEndBlock, "Locked");
        require(amount > 0 && s.amount >= amount, "Invalid");

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

        uint256 reward = _calculateTotalReward(lastRewardBlock, block.number);
        uint256 acc = accRewardPerShare + (reward * PRECISION_FACTOR) / totalWeightedStaked;
        return (s.weight * acc) / PRECISION_FACTOR - s.rewardDebt;
    }

    function estimateReward(uint256 amount, uint256 lockupDays) external view returns (uint256) {
        uint256 lockupBlocks = lockupDays * BLOCKS_PER_DAY;
        uint256 projectedReward = _calculateTotalReward(block.number, block.number + lockupBlocks);
        uint256 weight = (amount * getLockupWeight(lockupDays)) / PRECISION_FACTOR;
        uint256 newTotalWeighted = totalWeightedStaked + weight;
        if (newTotalWeighted == 0) return 0;

        uint256 projectedAcc = accRewardPerShare + (projectedReward * PRECISION_FACTOR) / newTotalWeighted;
        return (weight * projectedAcc) / PRECISION_FACTOR;
    }

    function _calculateTotalReward(uint256 from, uint256 to) internal view returns (uint256) {
        if (from >= to) return 0;
        uint256 sum = 0;
        uint256 remaining = totalRewardCap;

        for (uint256 i = 0; i < 1000; i++) {
            uint256 yearStart = startBlock + i * BLOCKS_PER_YEAR;
            uint256 yearEnd = yearStart + BLOCKS_PER_YEAR;

            uint256 yearlyAllocation = (i == 0)
                ? totalRewardCap / 3
                : (remaining * 2) / 3;
            remaining -= yearlyAllocation;

            if (from >= yearEnd) continue;
            if (to <= yearStart) break;

            uint256 overlapStart = from > yearStart ? from : yearStart;
            uint256 overlapEnd = to < yearEnd ? to : yearEnd;
            uint256 blocks = overlapEnd - overlapStart;

            sum += blocks * (yearlyAllocation / BLOCKS_PER_YEAR);
        }

        return sum;
    }

    function getAPY() external view returns (uint256) {
        if (totalWeightedStaked == 0) return 0;

        uint256 reward = _calculateTotalReward(block.number, block.number + BLOCKS_PER_YEAR);
        return reward / totalWeightedStaked;
    }

    function getAvgLockupYears() external view returns (uint256) {
        if (stakerCount == 0) return 0;
        return (accumulatedLockupDays * 1e18) / (stakerCount * 365);
    }
}
