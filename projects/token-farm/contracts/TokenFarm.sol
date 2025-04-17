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
    uint256 public constant BLOCKS_PER_YEAR = 10512000;
    uint256 public constant BLOCKS_PER_DAY = 28800; // 1day

    uint256 public accRewardPerShare; // PRECISION_FACTOR precision
    uint256 public lastRewardBlock;
    uint256 public totalStaked;

    // The precision factor
    uint256 public PRECISION_FACTOR;

    struct StakeInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 claimed;
        uint256 lockupEndBlock;
    }

    mapping(address => StakeInfo) public stakes;

    event Staked(address indexed user, uint256 amount);
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

         uint256 decimalsRewardToken = uint256(rewardToken.decimals());
        require(decimalsRewardToken < 30, "Must be inferior to 30");

        PRECISION_FACTOR = uint256(10**(uint256(30) - decimalsRewardToken));

    }
    
    function getAPY() external view returns (uint256) {
         uint256 rewardPerBlock = _calculateTotalReward(block.number, block.number+BLOCKS_PER_YEAR);
         if (rewardPerBlock == 0 || totalStaked == 0) return 0;
 
         return (rewardPerBlock * PRECISION_FACTOR) / totalStaked;
     }

    function estimateReward(uint256 amount, uint256 lockupDays) external view returns (uint256 ) {
        uint256 nowReward = (amount * accRewardPerShare) / PRECISION_FACTOR;
        uint256 lockupBlocks = lockupDays * BLOCKS_PER_DAY;
        uint256 projectedEnd = block.number + lockupBlocks;

        uint256 projectedReward = _calculateTotalReward(block.number, projectedEnd);

        uint256 newTotalStaked = totalStaked + amount;
        if (newTotalStaked == 0) return 0; 

        uint256 projectedAccRewardPerShare = accRewardPerShare + (projectedReward * PRECISION_FACTOR) / newTotalStaked;

        uint256 futureReward = (amount * projectedAccRewardPerShare) / PRECISION_FACTOR;

        return futureReward - nowReward;
    }

    function settle() public {
        if (block.number <= lastRewardBlock || totalStaked == 0) return;

        uint256 reward = _calculateTotalReward(lastRewardBlock, block.number);
        accRewardPerShare += (reward * PRECISION_FACTOR) / totalStaked;
        lastRewardBlock = block.number;
    }

    function _calculateTotalReward(uint256 from, uint256 to) internal view returns (uint256) {
        if (from >= to) return 0;

        uint256 sum = 0;
        uint256 remaining = totalRewardCap;

        for (uint256 i = 0; i < 100; i++) {
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

            uint256 perBlock = yearlyAllocation / BLOCKS_PER_YEAR;
            sum += blocks * perBlock;
        }

        return sum;
    }

    function stake(uint256 amount, uint256 lockupDays) external nonReentrant {
        require(amount > 0, "Cannot stake 0");

        settle();
        StakeInfo storage s = stakes[msg.sender];

        if (s.amount > 0) {
            uint256 pending = (s.amount * accRewardPerShare) / PRECISION_FACTOR - s.rewardDebt;
            s.claimed += pending;
            rewardToken.transfer(msg.sender, pending);
            emit Claimed(msg.sender, pending);
        }

        s.amount += amount;
        s.rewardDebt = (s.amount * accRewardPerShare) / PRECISION_FACTOR;
        s.lockupEndBlock = block.number + (lockupDays * BLOCKS_PER_DAY);
        totalStaked += amount;

        stakingToken.transferFrom(msg.sender, address(this), amount);
        
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(amount > 0 && s.amount >= amount, "Invalid amount");
        require(block.number >= s.lockupEndBlock, "Lockup period not ended");

        settle();

        uint256 pending = (s.amount * accRewardPerShare) / PRECISION_FACTOR - s.rewardDebt;
        if (pending > 0) {
            s.claimed += pending;
            rewardToken.transfer(msg.sender, pending);
            emit Claimed(msg.sender, pending);
        }

        s.amount -= amount;
        s.rewardDebt = (s.amount * accRewardPerShare) / PRECISION_FACTOR;
        totalStaked -= amount;

        stakingToken.transfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount);
    }

    function claim() external nonReentrant {
        settle();
        StakeInfo storage s = stakes[msg.sender];

        uint256 pending = (s.amount * accRewardPerShare) / PRECISION_FACTOR - s.rewardDebt;
        require(pending > 0, "No rewards");

        s.claimed += pending;
        s.rewardDebt = (s.amount * accRewardPerShare) / PRECISION_FACTOR;
        rewardToken.transfer(msg.sender, pending);

        emit Claimed(msg.sender, pending);
    }

    function pendingReward(address user) external view returns (uint256) {
        StakeInfo storage s = stakes[user];
        if (s.amount == 0 || totalStaked == 0) return 0;

        uint256 reward = _calculateTotalReward(lastRewardBlock, block.number);
        uint256 acc = accRewardPerShare + (reward * PRECISION_FACTOR) / totalStaked;
        return (s.amount * acc) / PRECISION_FACTOR - s.rewardDebt;
    }
}
