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
  const INITIAL_SUPPLY = parseUnits("100000000", 18);

  let rewardToken;
  if (currentNetwork == "bsc") {
    rewardToken = await ethers.getContractAt("LotToken", config.default.rewardTokenAddress[currentNetwork]);
  } else {
    const MockBEP20 = await ethers.getContractFactory("MockBEP20");
    rewardToken = await MockBEP20.deploy("Test League of Traders", "tLOT", INITIAL_SUPPLY);
  }
  await rewardToken.waitForDeployment();
  console.log("Token deployed to:", await rewardToken.getAddress());

  // 2. 토큰 민트 (deployer에게)
  const rewardTokenAddress = await rewardToken.getAddress();

  // 3. Staking 컨트랙트 배포
  const Staking = await ethers.getContractFactory("TimeBasedStaking");
  const staking = await Staking.deploy(rewardTokenAddress, rewardTokenAddress);
  await staking.waitForDeployment();
  console.log("Staking deployed to:", await staking.getAddress());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
