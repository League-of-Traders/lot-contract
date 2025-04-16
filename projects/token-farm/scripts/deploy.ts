import { ethers, network } from "hardhat";
import { parseUnits } from "ethers";

import dotenv from "dotenv";

dotenv.config();
const currentNetwork = network.name;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Parameters
  const DECIMALS = 18;
  const INITIAL_SUPPLY = parseUnits("100000000", 18);
  const TOTAL_REWARD_CAP = INITIAL_SUPPLY;
  const START_TIME = Math.floor(Date.now() / 1000); // now in seconds

  const MockBEP20 = await ethers.getContractFactory("MockBEP20");
  const rewardToken = await MockBEP20.deploy("Test League of Traders", "tLOT", INITIAL_SUPPLY);

  await rewardToken.waitForDeployment();
  console.log("Token deployed to:", await rewardToken.getAddress());

  // 2. 토큰 민트 (deployer에게)
  const rewardTokenAddress = await rewardToken.getAddress();
  const mintTx = await rewardToken.mintTokens(INITIAL_SUPPLY);
  await mintTx.wait();
  console.log(`Minted ${INITIAL_SUPPLY.toString()} tokens to ${deployer.address}`);

  // 3. Staking 컨트랙트 배포
  const Staking = await ethers.getContractFactory("TimeBasedStaking");
  const staking = await Staking.deploy(rewardTokenAddress, rewardTokenAddress, TOTAL_REWARD_CAP);
  await staking.waitForDeployment();
  console.log("Staking deployed to:", await staking.getAddress());

  const stakingAddress = await staking.getAddress();

  // 4. 스테이킹 컨트랙트에 토큰 approve + 전송
  const approveTx = await rewardToken.approve(stakingAddress, TOTAL_REWARD_CAP);
  await approveTx.wait();

  const transferTx = await rewardToken.transfer(stakingAddress, TOTAL_REWARD_CAP);
  await transferTx.wait();
  console.log(`Transferred ${TOTAL_REWARD_CAP.toString()} tokens to staking contract`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
