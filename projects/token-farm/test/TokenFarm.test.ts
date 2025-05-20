import { ethers } from "hardhat";
import { expect } from "chai";
import { Contract, parseEther, formatEther, toNumber } from "ethers";

const days = (n: number) => n * 24 * 60 * 60;
const toBigInt = (v: any) => BigInt(v.toString());

describe("TimeBasedStaking - Full Test Suite", () => {
  let staking: Contract;
  let stakeToken: Contract;
  let rewardToken: Contract;
  let owner: any;
  let user: any;
  let other: any;
  const totalRewardCap = parseEther("300000");
  const stakeAmount = parseEther("1000");
  const PRECISION = 10n ** 18n;

  beforeEach(async () => {
    [owner, user, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("MockBEP20");
    stakeToken = await Token.deploy("Stake", "STK", parseEther("1000000"));
    rewardToken = await Token.deploy("Reward", "RWD", parseEther("1000000"));

    const Staking = await ethers.getContractFactory("TimeBasedStaking");
    staking = await Staking.deploy(stakeToken.target, rewardToken.target);

    await stakeToken.connect(owner).transfer(user.address, parseEther("10000"));
    await stakeToken.connect(user).approve(staking.target, parseEther("10000"));

    await rewardToken.connect(owner).approve(staking.target, parseEther("1000000"));
    await staking.setReward(totalRewardCap);
    // await staking.connect(owner).addReward(parseEther("700000"));

    await stakeToken.connect(owner).transfer(other.address, parseEther("1000"));
    await stakeToken.connect(other).approve(staking.target, parseEther("1000"));
  });

  describe("stake()", () => {
    it("should stake with min amount and 1-day lockup", async () => {
      await staking.connect(user).stake(parseEther("0.000001"), 1);
      const stake = await staking.stakes(user.address);
      expect(stake.amount).to.equal(parseEther("0.000001"));
    });

    it("should revert when lockupDays > MAX_LOCK_DAYS", async () => {
      await expect(staking.connect(user).stake(stakeAmount, 1461)).to.be.revertedWith("Too long");
    });

    it("should accumulate stake and weight across multiple lockups", async () => {
      await staking.connect(user).stake(parseEther("100"), 30);
      await staking.connect(user).stake(parseEther("200"), 60);
      const stake = await staking.stakes(user.address);
      expect(stake.amount).to.equal(parseEther("300"));
      expect(stake.weight).to.be.gt(0);
    });

    it("should revert on initial stake with 0 amount", async () => {
      await expect(staking.connect(user).stake(0, 10)).to.be.revertedWith("Cannot init stake 0");
    });
  });

  describe("testCalculateTotalReward()", () => {
    const year = days(365);

    it("should return 0 when from == to", async () => {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const reward = await staking.testCalculateTotalReward(now, now);
      expect(reward).to.equal(0);
    });

    it("should return full 1st year reward over 365 days", async () => {
      const start = await staking.startTimestamp();
      const end = start + BigInt(year);

      const cap = await staking.totalRewardCap();
      const expected = toBigInt(cap) / 3n;

      const actual = toBigInt(await staking.testCalculateTotalReward(start, end));
      expect(actual).to.equal(expected);
    });

    it("should return half of 1st year reward for 182.5 days", async () => {
      const start = await staking.startTimestamp();
      const end = start + BigInt(year / 2);

      const cap = await staking.totalRewardCap();
      const expected = toBigInt(cap) / 3n / 2n;

      const actual = toBigInt(await staking.testCalculateTotalReward(start, end));
      expect(actual).to.equal(expected);
    });

    it("should return 1st + 2nd year reward over 1 year and 100 days", async () => {
      const start = await staking.startTimestamp();
      const end = start + BigInt(days(365 + 100));

      const cap = toBigInt(await staking.totalRewardCap());
      const y1 = cap / 3n;
      const y2 = (cap - y1) / 3n;
      const r2 = (y2 * BigInt(days(100))) / BigInt(days(365));
      const expected = y1 + r2;

      const actual = toBigInt(await staking.testCalculateTotalReward(start, end));
      expect(actual).to.equal(expected);
    });

    it("should return partial reward crossing boundary", async () => {
      const start = (await staking.startTimestamp()) + BigInt(Math.floor(year * 0.75));
      const end = start + BigInt(Math.floor(year * 0.5)); // cross boundary 75% y1 + 25% y2

      const cap = toBigInt(await staking.totalRewardCap());

      const y1 = (cap * PRECISION) / 3n;
      const y2 = (cap * PRECISION - y1) / 3n;

      const r1 = (y1 * BigInt(Math.floor(year * 0.25))) / BigInt(year); // last 25% of y1
      const r2 = (y2 * BigInt(Math.floor(year * 0.25))) / BigInt(year); // first 25% of y2

      const expected = (r1 + r2) / PRECISION;

      const actual = toBigInt(await staking.testCalculateTotalReward(start, end));
      expect(actual).to.equal(expected);
    });
  });

  describe("accRewardPerShare - behavior over time", () => {
    it("should increase correctly with one user over 10 days (using exact reward)", async () => {
      // 유저 스테이킹 (최대 weight)
      await staking.connect(user).stake(parseEther("1000"), 365);

      // 초기 acc 값 및 weight 확보
      const initialWeight = toBigInt((await staking.stakes(user.address)).weight);
      const accInitial = toBigInt(await staking.getAccRewardPerShareNow());
      const start = await staking.lastRewardTimestamp();

      const next = toNumber(start) + days(10);

      await ethers.provider.send("evm_setNextBlockTimestamp", [next]);
      await staking.connect(user).claim();

      const accAfter = toBigInt(await staking.getAccRewardPerShareNow());

      const reward = toBigInt(await staking.testCalculateTotalReward(start, next));
      const expectedAccIncrease = (reward * 10n ** 18n) / initialWeight;

      // 정확하게 일치해야 함
      expect(accAfter - accInitial).to.equal(expectedAccIncrease);
    });

    it("should increase correctly with two users sharing equal weight", async () => {
      await staking.connect(user).stake(parseEther("1000"), 365);
      await staking.connect(other).stake(parseEther("1000"), 365);

      const totalWeight = toBigInt(await staking.totalWeightedStaked());
      const accInitial = toBigInt(await staking.getAccRewardPerShareNow());

      const start = await staking.lastRewardTimestamp();
      const next = toNumber(start) + days(10);

      await ethers.provider.send("evm_setNextBlockTimestamp", [next]);
      await staking.connect(user).claim();

      const accAfter = toBigInt(await staking.getAccRewardPerShareNow());

      const reward = toBigInt(await staking.testCalculateTotalReward(start, next));
      const expectedAccIncrease = (reward * 10n ** 18n) / totalWeight;

      const user1weight = (parseEther("1000") * 25n) / 100n;
      const user2weight = (parseEther("1000") * 25n) / 100n;

      expect(totalWeight).to.equal(user1weight + user2weight);
      expect(accAfter - accInitial).to.equal(expectedAccIncrease);
    });

    it("should account for partial first and second year rewards", async () => {
      await staking.connect(user).stake(parseEther("1000"), 365);
      const totalWeight = toBigInt(await staking.totalWeightedStaked());

      const start = await staking.lastRewardTimestamp();
      const after1yr = toNumber(start) + days(365);
      const after2yr = after1yr + days(30); // 1 year + 30 days

      await ethers.provider.send("evm_setNextBlockTimestamp", [after2yr]);
      await staking.connect(user).claim();

      const accAfter = toBigInt(await staking.getAccRewardPerShareNow());
      const cap = toBigInt(await staking.totalRewardCap());

      const y1 = cap / 3n;
      const y2 = (cap - y1) / 3n;
      const r1 = (y1 * BigInt(days(365))) / BigInt(days(365)); // 1yr
      const r2 = (y2 * BigInt(days(30))) / BigInt(days(365)); // 30 days of 2nd year
      const totalReward = r1 + r2;
      const expectedAccIncrease = (totalReward * PRECISION) / totalWeight;

      expect(accAfter).to.equal(expectedAccIncrease);
    });
  });

  describe("claim()", () => {
    it("should correctly calculate and claim reward after 30 days", async () => {
      await staking.connect(user).stake(stakeAmount, 365);
      await ethers.provider.send("evm_increaseTime", [days(30)]);
      await ethers.provider.send("evm_mine");

      const before = await rewardToken.balanceOf(user.address);
      await staking.connect(user).claim();
      const after = await rewardToken.balanceOf(user.address);

      const stake = await staking.stakes(user.address);
      const accRewardPerShare = await staking.getAccRewardPerShareNow();
      const weight = toBigInt(stake.weight);
      const acc = toBigInt(accRewardPerShare);

      const expected = (weight * acc) / PRECISION;
      const actual = toBigInt(after - before);

      expect(actual).to.equal(expected);
    });

    it("should correctly distribute 10-day reward based on weight ratio", async () => {
      await staking.connect(user).stake(parseEther("1000"), 365); // 최대 weight
      const start = await staking.lastRewardTimestamp();

      const firstClaimTime = toNumber(start) + days(30);
      await ethers.provider.send("evm_setNextBlockTimestamp", [firstClaimTime]);
      await staking.connect(user).claim();

      const secondClaimTime = firstClaimTime + days(10);
      const before = await rewardToken.balanceOf(user.address);

      await ethers.provider.send("evm_setNextBlockTimestamp", [secondClaimTime]);
      await staking.connect(user).claim();
      const after = await rewardToken.balanceOf(user.address);

      const diff = toBigInt(after) - toBigInt(before);

      const totalReward = toBigInt(await staking.testCalculateTotalReward(firstClaimTime, secondClaimTime));
      const weight = toBigInt((await staking.stakes(user.address)).weight);
      const totalWeight = toBigInt(await staking.totalWeightedStaked());
      const expectedUserReward = (totalReward * weight) / totalWeight;

      expect(diff).to.be.equal(expectedUserReward);
    });
  });

  describe("withdraw()", () => {
    it("should allow partial withdrawal after lockup period", async () => {
      await staking.connect(user).stake(stakeAmount, 30);
      await ethers.provider.send("evm_increaseTime", [days(31)]);
      await staking.connect(user).withdraw(stakeAmount / 2n);
      const stake = await staking.stakes(user.address);
      expect(stake.amount).to.equal(stakeAmount / 2n);
    });

    it("should auto-claim reward before full withdrawal", async () => {
      await staking.connect(user).stake(stakeAmount, 30);
      await ethers.provider.send("evm_increaseTime", [days(31)]);

      const before = await rewardToken.balanceOf(user.address);
      await staking.connect(user).withdraw(stakeAmount);
      const after = await rewardToken.balanceOf(user.address);

      expect(after - before).to.be.gt(0);
    });
  });

  describe("emergencyWithdraw()", () => {
    it("should allow emergencyWithdraw with 10% penalty if not claimed", async () => {
      await staking.connect(user).stake(parseEther("1000"), 365);
      const before = await stakeToken.balanceOf(user.address);
      await staking.connect(user).emergencyWithdraw();
      const after = await stakeToken.balanceOf(user.address);
      expect(after - before).to.be.closeTo(parseEther("900"), parseEther("0.01"));
    });

    it("should revert emergencyWithdraw if rewards were already claimed", async () => {
      await staking.connect(user).stake(parseEther("1000"), 365);
      await ethers.provider.send("evm_increaseTime", [days(10)]);
      await staking.connect(user).claim();
      await expect(staking.connect(user).emergencyWithdraw()).to.be.revertedWith("Already claimed");
    });
  });

  describe("addReward()", () => {
    it("should distribute newly added reward starting from next year only", async () => {
      const block = await ethers.provider.getBlock("latest");
      const currentYear = await staking.testGetYearIndex(block.timestamp);
      await staking.connect(owner).addReward(parseEther("27000"));

      const year0 = await staking.rewardPerYear(currentYear);
      const year1 = await staking.rewardPerYear(currentYear + 1n);
      const year2 = await staking.rewardPerYear(currentYear + 2n);

      expect(year0).to.equal(parseEther("100000"));
      expect(year1).to.be.gt(parseEther("200000") / 3n);
      expect(year2).to.be.gt((parseEther("200000") - parseEther("200000") / 3n) / 3n);
    });
  });

  describe("ban()", () => {
    it("should prevent banned user from staking", async () => {
      await staking.connect(owner).ban(user.address);
      await expect(staking.connect(user).stake(stakeAmount, 30)).to.be.revertedWith("Banned user");
    });
  });

  describe("metrics()", () => {
    it("should return non-zero APY and average lockup after stake", async () => {
      await staking.connect(user).stake(stakeAmount, 365);
      const apy = await staking.getAPY();
      const avg = await staking.getAvgLockupYears();
      expect(apy).to.be.gt(0);
      expect(Number(formatEther(avg))).to.be.closeTo(1.0, 0.01);
    });
  });
});
