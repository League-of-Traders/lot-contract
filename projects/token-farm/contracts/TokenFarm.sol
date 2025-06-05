// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "bsc-library/contracts/IBEP20.sol";
import "bsc-library/contracts/SafeBEP20.sol";

/**
 * @title TimeBasedStaking
 * @notice This contract implements a long-term staking system inspired by veCRV mechanics.
 *
 * Key design principles:
 * - Rewards are front-loaded using a geometric decay: 1/3 of remaining is distributed each year.
 * - Stake weight is proportional to both amount and lockup duration (ve-style).
 * - Early and long-term stakers are heavily incentivized over short-term ones.
 *
 * Advantages:
 * - Predictable long-term reward schedule.
 * - Fairness: No advantage for frequent compounders.
 * - Gas efficiency: Uses accRewardPerShare for scalable distribution.
 */
contract TimeBasedStaking is Ownable, ReentrancyGuard {
    using SafeBEP20 for IBEP20;

    IBEP20 public stakingToken;
    IBEP20 public rewardToken;

    uint256 public immutable startTimestamp;
    uint256 public constant TIMESTAMP_PER_YEAR = 365 days;
    uint256 public constant TIMESTAMP_PER_DAY = 1 days;
    uint256 public constant MIN_LOCKUP_DAYS = 1;
    uint256 public constant MAX_LOCKUP_DAYS = 1460; 
    uint256 public constant PRECISION_FACTOR = 1e21;

    uint256 public totalRewardCap;
    uint256 public accumulatedLockupDays;
    uint256 public stakerCount;
    uint256 public accRewardPerShare;
    uint256 public lastRewardTimestamp;
    uint256 public totalStaked;
    uint256 public totalWeightedStaked;
    uint256 public totalPenalty;
    uint256 public lastSetOwnerTimestamp;
    uint256 public lastSetRewardTimestamp;
    uint256 public lastAddRewardTimestamp;
    
    struct StakeInfo {
        uint256 amount;               // User's staked amount
        uint256 weight;               // Staked amount weighted by lockup
        uint256 rewardDebt;           // Reward debt for reward accounting
        uint256 claimed;              // Total rewards claimed
        uint256 lockupEndTimestamp ;  // Timestamp when lockup ends        
    }

    mapping(address => StakeInfo) public stakes;
    mapping(uint256 => uint256) public rewardPerYear;

    event Banned(address indexed user);
    event Unbanned(address indexed user);
    event Staked(address indexed user, uint256 amount, uint256 lockupDays);
    event Withdrawn(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event RewardAdded(uint256 indexed fromYear, uint256 amount);
    event redistributeRemainingReward(uint256 amount);

    constructor(
        IBEP20 _stakingToken,
        IBEP20 _rewardToken
    ) Ownable(msg.sender) {
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        startTimestamp = block.timestamp;
        lastRewardTimestamp = block.timestamp;
    }
    
    function setOwner(address newOwner) external onlyOwner {
        require(block.timestamp >= lastSetOwnerTimestamp + 2 days, "Must wait 48h since last");
        lastSetOwnerTimestamp = block.timestamp;
        transferOwnership(newOwner);
    }

    /**
     * @dev Returns the ve-style staking weight for a given lockup duration.
     *      The weight is linearly proportional to the number of lockup days, scaled by MAX_LOCKUP_DAYS.
     *      This follows the "voting escrow" (ve) model, where longer lockups give more influence
     *      (or in this case, more reward share).
     *
     *      For example:
     *        - 1460 days (4 years) lockup gives full weight (1.0 * amount)
     *        - 365 days lockup gives 25% weight (0.25 * amount)
     *
     *      This design encourages longer commitments, rewarding long-term stakers more.
     *
     * @param lockupDays Number of days the stake will be locked
     * @return Lockup weight scaled by 1e18
     */
    function getLockupWeight(uint256 lockupDays) public pure returns (uint256) {
        require(lockupDays <= MAX_LOCKUP_DAYS, "Exceeds max lock");
        return (lockupDays * PRECISION_FACTOR) / MAX_LOCKUP_DAYS;
    }

    /**
     * @dev One-time reward initializer using geometric decay.
     */
    function setReward(uint256 amount) external onlyOwner {
        require(amount > 0, "Invalid amount");
        require(totalRewardCap == 0, "Already set");
        require(block.timestamp >= lastSetRewardTimestamp + 2 days, "Must wait 48h since last");
        lastSetRewardTimestamp = block.timestamp;

        totalRewardCap = amount;
        uint256 fromYear = _getYearIndex(block.timestamp);

        _distributeDecay(fromYear, amount);
        _updatePool();

        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardAdded(fromYear, amount);
    }

    /**
     * @dev Adds more rewards starting from next year.
     */
    function addReward(uint256 amount) external onlyOwner {
        require(amount > 0, "Invalid amount");
        require(block.timestamp >= lastAddRewardTimestamp + 2 days, "Must wait 48h since last");
        lastAddRewardTimestamp = block.timestamp;

        _updatePool();

        totalRewardCap += amount;

        uint256 fromYear = _getYearIndex(block.timestamp) + 1;

        _distributeDecay(fromYear, amount);

        rewardToken.safeTransferFrom(msg.sender, address(this), amount);
        emit RewardAdded(fromYear, amount);
    }

    function _getYearIndex(uint256 timestamp) internal view returns (uint256) {
        return (timestamp - startTimestamp) / TIMESTAMP_PER_YEAR;
    }


    /**
     * @dev Distributes a reward amount across future years using geometric decay.
     *      Each year receives 1/3 of the remaining undistributed balance.
     *      This results in most rewards being allocated early,
     *      but still sustaining the pool over many years (~80% in first 5 years).
     *
     *      Mathematically, this approximates:
     *        rewardYear[n] = total * (1/3) * (2/3)^n
     *      which ensures:
     *        ∑_{n=0}^{∞} rewardYear[n] = total
     *
     * @param fromYear Starting year index to begin distribution
     * @param totalAmount Total reward to be distributed over time
     */
    function _distributeDecay(uint256 fromYear, uint256 totalAmount) internal {
        uint256 remaining = totalAmount;

        for (uint256 i = 0; i < 100 && remaining > 0; i++) {
            uint256 decayAmount = remaining / 3;
            rewardPerYear[fromYear + i] += decayAmount;
            remaining -= decayAmount;
        }
    }

    /**
     * @dev Updates the accumulated reward per share value.
     */
    function _updatePool() internal {
        if (block.timestamp <= lastRewardTimestamp || totalWeightedStaked == 0) return;

        uint256 reward = _calculateTotalReward(lastRewardTimestamp, block.timestamp);
        accRewardPerShare += (reward * PRECISION_FACTOR) / totalWeightedStaked;

        lastRewardTimestamp = block.timestamp;
    }

    /**
     * @dev Stake tokens with specified lockup duration. Auto-claims pending rewards.
     */
    function stake(uint256 amount, uint256 lockupDays) external nonReentrant {
        require(lockupDays >= MIN_LOCKUP_DAYS, "Lockup too short");
        require(lockupDays <= MAX_LOCKUP_DAYS, "Lockup too long");
        require(totalRewardCap != 0, "Reward not set");

        _updatePool();
        StakeInfo storage s = stakes[msg.sender];

        require(amount > 0 || s.amount > 0, "Cannot init stake 0");
    
        uint256 newLockupEnd = block.timestamp + (lockupDays * TIMESTAMP_PER_DAY);
        require(s.lockupEndTimestamp <= newLockupEnd, "Lock up should be longer then initial lockup period");

        uint256 oldWeight = s.weight;
        uint256 newAmount = s.amount + amount;

        uint256 newWeight = (newAmount * getLockupWeight(lockupDays)) / PRECISION_FACTOR;
        require(newWeight > oldWeight, "Weight must increase");

        if (s.weight > 0) {
            uint256 pending = (s.weight * accRewardPerShare) / PRECISION_FACTOR - s.rewardDebt;
            if (pending > 0) {
                s.claimed += pending;
                rewardToken.safeTransfer(msg.sender, pending);
                emit Claimed(msg.sender, pending);
            }
        }

        if (s.amount == 0) {
            stakerCount += 1;
        } else {
            accumulatedLockupDays -= (s.lockupEndTimestamp - block.timestamp) /TIMESTAMP_PER_DAY;
        }
        accumulatedLockupDays += lockupDays;

        s.weight = newWeight;
        s.amount = newAmount;
        totalWeightedStaked = totalWeightedStaked - oldWeight + newWeight;
        s.rewardDebt = (s.weight * accRewardPerShare) / PRECISION_FACTOR;
        s.lockupEndTimestamp = newLockupEnd;
        totalStaked += amount;

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, amount, lockupDays);
    }

    /**
     * @dev Withdraw staked tokens after lockup period. Auto-claims pending rewards.
     */
    function withdraw(uint256 amount) external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(block.timestamp >= s.lockupEndTimestamp, "Locked");
        require(amount > 0 && s.amount >= amount, "Invalid");
        require(totalRewardCap != 0, "Reward not set");

        _updatePool();

        uint256 pending = (s.weight * accRewardPerShare) / PRECISION_FACTOR - s.rewardDebt;
        if (pending > 0) {
            s.claimed += pending;
            rewardToken.safeTransfer(msg.sender, pending);
            emit Claimed(msg.sender, pending);
        }

        uint256 withdrawnWeight = (s.weight * amount) / s.amount;
        s.amount -= amount;
        s.weight -= withdrawnWeight;
        s.rewardDebt = (s.weight * accRewardPerShare) / PRECISION_FACTOR;
        totalWeightedStaked -= withdrawnWeight;
        totalStaked -= amount;

        stakingToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    /**
     * @dev Claim pending rewards without withdrawing stake.
     */
    function claim() external nonReentrant {
        require(totalRewardCap != 0, "Reward not set");

        _updatePool();
        StakeInfo storage s = stakes[msg.sender];

        uint256 pending = (s.weight * accRewardPerShare) / PRECISION_FACTOR - s.rewardDebt;
        require(pending > 0, "No rewards");

        s.claimed += pending;
        s.rewardDebt = (s.weight * accRewardPerShare) / PRECISION_FACTOR;
        rewardToken.safeTransfer(msg.sender, pending);
        emit Claimed(msg.sender, pending);
    }

    /**
     * @dev View function to calculate pending reward for a user.
     */
    function pendingReward(address user) external view returns (uint256) {
        StakeInfo storage s = stakes[user];
        if (s.weight == 0 || totalWeightedStaked == 0) return 0;

        uint256 reward = _calculateTotalReward(lastRewardTimestamp, block.timestamp);
        uint256 updatedAcc = accRewardPerShare + (reward * PRECISION_FACTOR) / totalWeightedStaked;

        return (s.weight * updatedAcc) / PRECISION_FACTOR - s.rewardDebt;
    }
    
    /**
     * @dev Estimate future reward based on hypothetical stake.
     */
    function estimateReward(uint256 amount, uint256 lockupDays) external view returns (uint256) {
        uint256 lockupTIMESTAMP = lockupDays * TIMESTAMP_PER_DAY;
        uint256 projectedReward = _calculateTotalReward(block.timestamp, block.timestamp + lockupTIMESTAMP);
        uint256 weight = (amount * getLockupWeight(lockupDays)) / PRECISION_FACTOR;
        uint256 newTotalWeighted = totalWeightedStaked + weight;
        if (newTotalWeighted == 0) return 0;

        uint256 projectedAcc = accRewardPerShare + (projectedReward * PRECISION_FACTOR) / newTotalWeighted;
        return (weight * projectedAcc) / PRECISION_FACTOR;
    }

    /**
     * @dev Internal function to calculate total rewards to be distributed over a given period.
     *      The reward pool follows a geometric decay schedule:
     *      - In year N, 1/3 of the remaining undistributed reward is allocated.
     *      - This produces the following allocation pattern:
     *          Year 0: (1/3) of total
     *          Year 1: (1/3) of remaining = (1/3) * (2/3) = 2/9
     *          Year 2: (1/3) * (2/3)^2 = 4/27, ...
     *      This ensures early participants receive higher rewards (front-loaded incentive),
     *      while still allowing rewards to be emitted over the long term.
     *      This function slices the provided time window (`from` to `to`)
     *      into overlapping reward years and sums up proportional rewards.
     *
     * @param from Start timestamp (inclusive)
     * @param to   End timestamp (exclusive)
     * @return Total reward amount to distribute during this time window
     */
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
            uint256 part  = (duration * rewardForYear * PRECISION_FACTOR) / TIMESTAMP_PER_YEAR;

            sum += part / PRECISION_FACTOR;
        }

        return sum;
    }

    /**
     * @notice Returns projected reward token distribution over the next year, divided by total weighted stake. Not a fiat-denominated APY.
     */
    function getAnnualRewardRate() external view returns (uint256) {
        if (totalWeightedStaked == 0) return 0;

        uint256 reward = _calculateTotalReward(block.timestamp, block.timestamp + TIMESTAMP_PER_YEAR);
        return reward / totalWeightedStaked;
    }

    /**
     * @dev Returns the average lockup duration in years across all users.
     */
    function getAvgLockupYears() external view returns (uint256) {
        if (stakerCount == 0) return 0;
        return (accumulatedLockupDays * 1e18) / (stakerCount * 365);
    }

     /**
     * @dev Emergency withdraw with penalty. Forfeits all rewards.
     */
    function emergencyWithdraw() external nonReentrant {
        StakeInfo storage user = stakes[msg.sender];
        uint256 amountToTransfer = user.amount;

        require(amountToTransfer > 0, "Nothing to withdraw");
        require(user.claimed == 0, "Already claimed");

        _updatePool();
        uint256 pending = (user.weight * accRewardPerShare) / PRECISION_FACTOR - user.rewardDebt;
        if (pending > 0) {
            uint256 fromYear = _getYearIndex(block.timestamp) + 1;
            _distributeDecay(fromYear, pending);
        }

        uint256 penalty = (amountToTransfer * 10_000) / 100_000;
        uint256 finalAmount = amountToTransfer - penalty;

        totalWeightedStaked -= user.weight;
        totalStaked -= amountToTransfer;
        accumulatedLockupDays -= (user.lockupEndTimestamp > block.timestamp)
            ? (user.lockupEndTimestamp - block.timestamp) / TIMESTAMP_PER_DAY
            : 0;

        user.amount = 0;
        user.weight = 0;
        user.rewardDebt = 0;
        user.lockupEndTimestamp = 0;

        stakingToken.safeTransfer(msg.sender, finalAmount);
        if (penalty > 0) stakingToken.safeTransfer(owner(), penalty);

        emit EmergencyWithdraw(msg.sender, finalAmount);
    }

    function getTotalRewardFromTimestamp(uint256 from, uint256 to) external view returns (uint256) {
        return _calculateTotalReward(from, to);
    }

    function getYearIndex(uint256 timestamp) external view returns (uint256) {
        return _getYearIndex(timestamp);
    }
}