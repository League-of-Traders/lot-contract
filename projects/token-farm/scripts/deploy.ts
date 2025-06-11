import { ethers, network } from "hardhat";
import { parseUnits, parseEther } from "ethers";

import dotenv from "dotenv";

dotenv.config();
const config = require("../config");
const currentNetwork = network.name;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Parameters
  const INITIAL_SUPPLY = parseUnits("15000000", 18);
  const TOTAL_REWARD_CAP = INITIAL_SUPPLY;

  let deployedTokenAddress = config.default.rewardTokenAddress[currentNetwork];
  let rewardToken;

  if (
    deployedTokenAddress &&
    typeof deployedTokenAddress === "string" &&
    deployedTokenAddress.startsWith("0x") &&
    deployedTokenAddress.length === 42
  ) {
    rewardToken = await ethers.getContractAt("DummyToken", deployedTokenAddress);
  } else {
    const MockBEP20 = await ethers.getContractFactory("DummyToken");
    const now = Math.floor(Date.now() / 1000) + 5;

    rewardToken = await MockBEP20.deploy(now);
  }
  await rewardToken.waitForDeployment();
  console.log("Token deployed to:", await rewardToken.getAddress());

  // 2. 토큰 민트 (deployer에게)
  const rewardTokenAddress = await rewardToken.getAddress();
  const mintTx = await rewardToken.mint(INITIAL_SUPPLY + parseEther("1000000"));
  await mintTx.wait();
  console.log(`Minted ${(INITIAL_SUPPLY + parseEther("1000000")).toString()} tokens to ${deployer.address}`);

  // 3. Staking 컨트랙트 배포
  let stakingContractAddress = config.default.stakingAddress[currentNetwork];

  let staking;
  if (
    stakingContractAddress &&
    typeof stakingContractAddress === "string" &&
    stakingContractAddress.startsWith("0x") &&
    stakingContractAddress.length === 42
  ) {
    staking = await ethers.getContractAt("TimeBasedStaking", stakingContractAddress);
  } else {
    const stakingConctract = await ethers.getContractFactory("TimeBasedStaking");
    staking = await stakingConctract.deploy(rewardTokenAddress, rewardTokenAddress);
  }

  await staking.waitForDeployment();
  console.log("Staking deployed to:", await staking.getAddress());

  await rewardToken.approve(staking.getAddress(), TOTAL_REWARD_CAP + parseEther("1000000"));
  console.log(`Transferred ${TOTAL_REWARD_CAP.toString()} tokens to staking contract`);
  sleep(500000);

  await staking.setReward(TOTAL_REWARD_CAP);
  console.log(`Set reward to ${TOTAL_REWARD_CAP.toString()}`);

  //wait and check the balance
  while (true) {
    const balance = await rewardToken.balanceOf(staking.getAddress());
    console.log(`Staking contract balance: ${balance.toString()}`);
    if (balance < TOTAL_REWARD_CAP) {
      console.log("Insufficient balance in staking contract");
      sleep(100000);
    } else {
      break;
    }
  }

  // 4. Staking
  // await staking.stake(parseEther("1000000"), 365);
  // console.log(`Staked 10000000 tokens for 365 days`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
