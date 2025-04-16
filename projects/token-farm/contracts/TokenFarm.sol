// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "bsc-library/contracts/IBEP20.sol";

contract TimeBasedStaking is Ownable, ReentrancyGuard {
    IBEP20 public stakingToken;
    IBEP20 public rewardToken;

    uint256 public immutable startBlock;
    uint256 public immutable totalRewardCap;
    uint256 public constant BLOCKS_PER_YEAR = 10512000; // 1year
    uint256 public constant BLOCKS_PER_DAY = 28800; // 1day

    struct StakeInfo {
        uint256 amount;
        uint256 rewardDebt;
        uint256 lastSettledBlock;
        uint256 claimedAmount;
        uint256 lockupEndBlock;
    }

    mapping(address => StakeInfo) public stakes;
    address[] public stakers;
    mapping(address => bool) public existing;

    uint256 public totalStaked;

    event Staked(address indexed user, uint256 amount, uint256 lockupDays);
    event Settled(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event Claimed(address indexed user, uint256 reward);

    constructor(
        IBEP20 _stakingToken,
        IBEP20 _rewardToken,
        uint256 _totalRewardCap
    ) Ownable(msg.sender) {
        stakingToken = _stakingToken;
        rewardToken = _rewardToken;
        totalRewardCap = _totalRewardCap;
        startBlock = block.number;
    }

    function getPerBlockReward(uint256 blockNum) public view returns (uint256) {
        if (blockNum <= startBlock || totalRewardCap == 0) return 0;

        uint256 blocksSinceStart = blockNum - startBlock;
        uint256 year = blocksSinceStart / BLOCKS_PER_YEAR;

        uint256 remaining = totalRewardCap;
        uint256 yearlyAllocation;

        for (uint256 i = 0; i <= year; i++) {
            yearlyAllocation = (i == 0) ? remaining / 3 : (remaining * 2) / 3;
            remaining -= yearlyAllocation;
        }

        return yearlyAllocation / BLOCKS_PER_YEAR;
    }

    function stake(uint256 amount, uint256 lockupDays) external nonReentrant {
        require(amount > 0, "Cannot stake 0");
        require(lockupDays >= 1, "Minimum 1 day lockup required");

        settleReward(msg.sender);
        stakingToken.transferFrom(msg.sender, address(this), amount); // change pool

        if (!existing[msg.sender]) {
            stakers.push(msg.sender);
            existing[msg.sender] = true;
        }

        StakeInfo storage s = stakes[msg.sender];
        s.amount += amount;
        s.lockupEndBlock = block.number + (lockupDays * BLOCKS_PER_DAY);
        totalStaked += amount;

        emit Staked(msg.sender, amount, lockupDays);
    }

    function withdraw(uint256 amount) external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(amount > 0 && s.amount >= amount, "Invalid amount");
        require(block.number >= s.lockupEndBlock, "Lockup period not ended");

        settleReward(msg.sender);

        s.amount -= amount;
        totalStaked -= amount;
        stakingToken.transfer(msg.sender, amount);

        if (s.amount == 0) {
            delete stakes[msg.sender];
            existing[msg.sender] = false;
        }

        emit Withdrawn(msg.sender, amount);
    }

    function claim() external nonReentrant {
        StakeInfo storage s = stakes[msg.sender];
        require(block.number >= s.lockupEndBlock, "Claim locked");

        settleReward(msg.sender);

        uint256 reward = s.rewardDebt;
        require(reward > 0, "No rewards");

        s.rewardDebt = 0;
        s.claimedAmount += reward;

        rewardToken.transfer(msg.sender, reward);

        emit Claimed(msg.sender, reward);
    }

    function settleReward(address user) public {
        StakeInfo storage s = stakes[user];
        if (s.amount == 0 || totalStaked == 0) {
            s.lastSettledBlock = block.number;
            return;
        }

        uint256 from = s.lastSettledBlock > 0 ? s.lastSettledBlock : startBlock;
        uint256 to = block.number;
        if (from >= to) return;

        uint256 totalReward = _calculateRewardRange(from, to, s.amount);
        s.rewardDebt += totalReward;
        s.lastSettledBlock = to;

        emit Settled(user, totalReward);
    }

    function _calculateRewardRange(uint256 from, uint256 to, uint256 userAmount) internal view returns (uint256) {
        if (from >= to || totalStaked == 0) return 0;

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
          
            uint256 perBlockReward = yearlyAllocation / BLOCKS_PER_YEAR;
            uint256 yearReward = (blocks * perBlockReward * userAmount) / totalStaked;
            sum += yearReward;
        }

        return sum;
    }

    function pendingReward(address user) external view returns (uint256) {
        StakeInfo storage s = stakes[user];
        if (s.amount == 0 || totalStaked == 0) return s.rewardDebt;

        uint256 from = s.lastSettledBlock > 0 ? s.lastSettledBlock : startBlock;
        uint256 to = block.number;
        uint256 reward = _calculateRewardRange(from, to, s.amount);`

        return s.rewardDebt + reward;
    }

    function getAPY() external view returns (uint256) {
        uint256 rewardPerBlock = getPerBlockReward(block.number);
        if (rewardPerBlock == 0 || totalStaked == 0) return 0;

        return (rewardPerBlock * BLOCKS_PER_YEAR * 1e18) / totalStaked;
    }

    function getStakers() external view returns (address[] memory) {
        return stakers;
    }
}
