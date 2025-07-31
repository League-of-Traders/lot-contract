import { ethers, network } from "hardhat";
import { parseUnits, parseEther } from "ethers";
import config from "../config";
import dotenv from "dotenv";

dotenv.config();
const currentNetwork = network.name;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Parameters
  const INITIAL_SUPPLY = parseUnits("15000000", 18);
  const TOTAL_REWARD_CAP = INITIAL_SUPPLY;

  let deployedTokenAddress = config.rewardTokenAddress[currentNetwork];

  let rewardToken;

  if (
    //validate the address format
    deployedTokenAddress &&
    typeof deployedTokenAddress === "string" &&
    deployedTokenAddress.startsWith("0x") &&
    deployedTokenAddress.length === 42
  ) {
    rewardToken = await ethers.getContractAt("LotToken", deployedTokenAddress);
  } else {
    const MockBEP20 = await ethers.getContractFactory("LotToken");
    const transferAllowTime = config.transferAllowTime();
    rewardToken = await MockBEP20.deploy(transferAllowTime);
  }
  await rewardToken.waitForDeployment();
  console.log("Token deployed to:", await rewardToken.getAddress());
  const rewardTokenAddress = await rewardToken.getAddress();

  // 2. 토큰 민트 (deployer에게)
  const mintTx = await rewardToken.mint(INITIAL_SUPPLY + parseEther("1000000"));
  await mintTx.wait();
  console.log(`Minted ${(INITIAL_SUPPLY + parseEther("1000000")).toString()} tokens to ${deployer.address}`);

  // 3. Staking 컨트랙트 배포
  let stakingContractAddress = config.stakingAddress[currentNetwork];

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

  // check transaction confirm
  const stakingAddress = await staking.getAddress();
  const expectedAllowance = TOTAL_REWARD_CAP;
  let allowanceConfirmed = false;
  for (let i = 0; i < 10; i++) {
    // 최대 10번 시도
    const allowance = await rewardToken.allowance(deployer.address, stakingAddress);
    console.log(`Current allowance: ${allowance.toString()}`);

    if (allowance.gte(expectedAllowance)) {
      console.log("✅ Approve confirmed: staking contract has sufficient allowance.");
      allowanceConfirmed = true;
      break;
    } else {
      console.log("⏳ Waiting for allowance to be confirmed... retrying in 3 seconds");
      await sleep(3000); // 3초 대기 후 재시도
    }
  }

  if (!allowanceConfirmed) {
    console.error("❌ Approve failed or not confirmed after retries.");
    process.exit(1);
  }

  await staking.setReward(TOTAL_REWARD_CAP); // real transfer
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
