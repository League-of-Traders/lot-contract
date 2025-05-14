import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, parseEther, formatEther } from "ethers";

function days(n: number) {
  return n * 24 * 60 * 60;
}

function toBigInt(etherStr: string): bigint {
  return BigInt(parseEther(etherStr).toString());
}

describe("TimeBasedStaking - Full Test Suite", function () {
  let stakingToken: Contract;
  let rewardToken: Contract;
  let staking: Contract;
  let owner: any;
  let user: any;
  let other: any;

  const initialSupply = parseEther("1000000");
  const totalRewardCap = parseEther("300000");
  const stakeAmount = parseEther("1000");
  const PRECISION = toBigInt("1");
  let startTimestamp: number;

  beforeEach(async function () {
    [owner, user, other] = await ethers.getSigners();

    const Token = await ethers.getContractFactory("MockBEP20");
    stakingToken = await Token.deploy("StakingToken", "STAKE", initialSupply);
    rewardToken = await Token.deploy("RewardToken", "REWARD", initialSupply);

    const Staking = await ethers.getContractFactory("TimeBasedStaking");
    staking = await Staking.deploy(stakingToken.target, rewardToken.target, totalRewardCap);

    await stakingToken.mintTokens(initialSupply);
    await stakingToken.connect(owner).transfer(user.address, initialSupply / 2n);
    await stakingToken.connect(owner).transfer(other.address, initialSupply / 2n);

    await stakingToken.connect(user).approve(staking.target, initialSupply);
    await stakingToken.connect(other).approve(staking.target, initialSupply);

    await rewardToken.mintTokens(totalRewardCap);
    await rewardToken.connect(owner).transfer(staking.target, totalRewardCap);

    const block = await ethers.provider.getBlock("latest");
    startTimestamp = block.timestamp;
  });

  describe("stake()", () => {
    it("should stake with min amount and 1-day lockup", async () => {
      const minAmount = parseEther("0.000001");
      await stakingToken.connect(user).transfer(user.address, minAmount);
      await staking.connect(user).stake(minAmount, 1);
      const info = await staking.stakes(user.address);
      expect(info.amount).to.equal(minAmount);
      expect(info.lockupEndBlock).to.be.gt(0);
    });

    it("should revert when lockupDays > max", async () => {
      await expect(staking.connect(user).stake(stakeAmount, 1461)).to.be.revertedWith("Too long");
    });

    it("should accumulate on repeated stakes with different lockups", async () => {
      await staking.connect(user).stake(parseEther("100"), 30);
      await staking.connect(user).stake(parseEther("200"), 60);
      const info = await staking.stakes(user.address);
      expect(info.amount).to.equal(parseEther("300"));
      expect(info.weight).to.be.gt(0);
    });

    it("should revert on stake(0) with no previous stake", async () => {
      await expect(staking.connect(user).stake(0, 10)).to.be.revertedWith("Cannot init stake 0");
    });
  });

  describe("claim()", () => {
    it("should accumulate correct reward after 30 days", async () => {
      await staking.connect(user).stake(stakeAmount, 30);
      await ethers.provider.send("evm_increaseTime", [days(30)]);
      await ethers.provider.send("evm_mine");

      // 🔧 updatePool() 강제 트리거
      await staking.pendingReward(user.address);

      await staking.connect(user).claim();

      const stake = await staking.stakes(user.address);
      const weight = BigInt(stake.weight.toString());
      const accRewardPerShare = await staking.getAccRewardPerShareNow();

      const acc = BigInt(accRewardPerShare.toString());
      const expected = (weight * acc) / toBigInt("1");

      const updatedStake = await staking.stakes(user.address);
      const claimed = BigInt(updatedStake.claimed.toString());

      expect(claimed).to.equal(expected);
    });

    it("should not allow double claiming", async () => {
      await staking.connect(user).stake(stakeAmount, 30);
      await ethers.provider.send("evm_increaseTime", [days(30)]);
      await ethers.provider.send("evm_mine");

      await staking.connect(user).claim();
      const stakeAfterFirst = await staking.stakes(user.address);
      const claimed1 = BigInt(stakeAfterFirst.claimed.toString());

      await ethers.provider.send("evm_increaseTime", [days(1)]);
      await ethers.provider.send("evm_mine");

      await staking.connect(user).claim();
      // manually calculate expected additional reward
      const weight = BigInt(stakeAfterFirst.weight.toString());
      await staking.pendingReward(user.address); // force updatePool()
      const accRewardPerShare = await staking.getAccRewardPerShareNow();
      const acc = BigInt(accRewardPerShare.toString());
      const expectedIncrement = (weight * acc) / toBigInt("1") - claimed1;

      const stakeAfterSecond = await staking.stakes(user.address);
      const claimed2 = BigInt(stakeAfterSecond.claimed.toString());
      const diff = claimed2 - claimed1;
      expect(diff).to.equal(expectedIncrement);
    });
  });

  describe("withdraw()", () => {
    it("should allow partial withdrawal after lockup", async () => {
      await staking.connect(user).stake(stakeAmount, 30);
      await ethers.provider.send("evm_increaseTime", [days(31)]);
      await ethers.provider.send("evm_mine", []);
      const partial = stakeAmount / 2n;
      await staking.connect(user).withdraw(partial);
      const info = await staking.stakes(user.address);
      expect(info.amount).to.equal(stakeAmount - partial);
    });

    it("should auto-claim rewards before withdraw", async () => {
      await staking.connect(user).stake(stakeAmount, 30);
      await ethers.provider.send("evm_increaseTime", [days(31)]);

      const stakeBefore = await staking.stakes(user.address);

      const before = await rewardToken.balanceOf(user.address);
      await staking.connect(user).withdraw(stakeAmount);

      const weight = BigInt(stakeBefore.weight.toString());
      const accRewardPerShare = await staking.getAccRewardPerShareNow();
      const acc = BigInt(accRewardPerShare.toString());
      const expectedReward = (weight * acc) / toBigInt("1");

      const stakeAfter = await staking.stakes(user.address);
      const claimed = BigInt(stakeAfter.claimed.toString());

      const after = await rewardToken.balanceOf(user.address);
      const actualReward = BigInt(after.toString()) - BigInt(before.toString());

      expect(actualReward).to.equal(expectedReward);
      expect(actualReward).to.equal(claimed);
    });
  });

  describe("getAPY() / getAvgLockupYears()", () => {
    it("should return correct values after stake", async () => {
      await staking.connect(user).stake(stakeAmount, 365);
      const apy = await staking.getAPY();
      const avg = await staking.getAvgLockupYears();
      expect(apy).to.be.gt(0);
      const avgYear = Number(formatEther(avg));
      expect(avgYear).to.be.closeTo(1.0, 0.01);
    });
  });

  describe("Calculate total reward", () => {
    const year = 365 * 24 * 60 * 60;
    beforeEach(async () => {
      startTimestamp = Number(await staking.startTimestamp());
    });

    it("should return 0 reward for same from/to", async () => {
      const reward = await staking.testCalculateTotalReward(startTimestamp, startTimestamp);
      expect(reward).to.equal(0);
    });

    it("should match _calculateTotalReward exactly", async () => {
      const capBN = await staking.totalRewardCap();
      const cap = BigInt(capBN.toString());

      const from = startTimestamp;
      const to = startTimestamp + year;

      const actual = BigInt((await staking.testCalculateTotalReward(from, to)).toString());
      const expected = cap / 3n;

      expect(actual).to.equal(expected);
    });

    it("should return 50% of 1st year reward for 6 months", async () => {
      const halfYear = year / 2;
      const reward = await staking.testCalculateTotalReward(startTimestamp, startTimestamp + halfYear);
      const expected = totalRewardCap / 3n / 2n;
      expect(BigInt(reward.toString())).to.equal(expected);
    });

    it("should return 1st year + 2nd year reward for 2 full years", async () => {
      const y1 = totalRewardCap / 3n;
      const y2 = (totalRewardCap - y1) / 3n;
      const reward = await staking.testCalculateTotalReward(startTimestamp, startTimestamp + 2 * year);
      const expected = y1 + y2;
      expect(BigInt(reward.toString())).to.equal(expected);
    });

    it("should return partial reward crossing year boundary", async () => {
      const from = startTimestamp + Math.floor(year * 0.75);
      const to = startTimestamp + year + Math.floor(year * 0.25);
      const y1 = totalRewardCap / 3n;
      const y2 = (totalRewardCap - y1) / 3n;
      const r1 = (y1 * BigInt(year - Math.floor(year * 0.75))) / BigInt(year);
      const r2 = (y2 * BigInt(Math.floor(year * 0.25))) / BigInt(year);
      const expected = r1 + r2;
      const reward = await staking.testCalculateTotalReward(from, to);
      expect(BigInt(reward.toString())).to.equal(expected);
    });
  });
});
