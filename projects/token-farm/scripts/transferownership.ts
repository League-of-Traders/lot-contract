import { ethers, network } from "hardhat";
import { parseUnits, parseEther, getAddress } from "ethers";

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
  if (currentNetwork == "bsc_testnet") {
    rewardToken = await ethers.getContractAt("MockBEP20", config.default.rewardTokenAddress[currentNetwork]);
  } else if (currentNetwork == "bsc") {
    rewardToken = await ethers.getContractAt("MockBEP20", config.default.rewardTokenAddress[currentNetwork]);
    console.log("Using existing token at:", rewardToken.address);
  } else {
    const MockBEP20 = await ethers.getContractFactory("MockBEP20");
    rewardToken = await MockBEP20.deploy("Test League of Traders", "tLOT", INITIAL_SUPPLY);
  }
  const newOwnerRaw = "0xCAB4Ccda51f40B677061A7D5e6CED04817BE8F53";
  const newOwner = getAddress(newOwnerRaw); // 주소 정제

  const tx = await rewardToken.transferOwnership(newOwner);
  await tx.wait();
  console.log("Ownership transferred to:", "0xCAB4Ccda51f40B677061A7D5e6CED04817BE8F53  ", tx);

  // await rewardToken.waitForDeployment();
  // console.log("Token deployed to:", await rewardToken.getAddress());

  // // 2. 토큰 민트 (deployer에게)
  // const rewardTokenAddress = await rewardToken.getAddress();
  // const mintTx = await rewardToken.mintTokens(INITIAL_SUPPLY + parseEther("1000000"));
  // await mintTx.wait();
  // console.log(`Minted ${(INITIAL_SUPPLY + parseEther("1000000")).toString()} tokens to ${deployer.address}`);

  // // 3. Staking 컨트랙트 배포
  // const Staking = await ethers.getContractFactory("TimeBasedStaking");
  // const staking = await Staking.deploy(rewardTokenAddress, rewardTokenAddress);
  // await staking.waitForDeployment();
  // console.log("Staking deployed to:", await staking.getAddress());

  // await rewardToken.approve(staking.getAddress(), TOTAL_REWARD_CAP + parseEther("1000000"));
  // console.log(`Transferred ${TOTAL_REWARD_CAP.toString()} tokens to staking contract`);
  // sleep(100000);

  // await staking.setReward(TOTAL_REWARD_CAP);
  // console.log(`Set reward to ${TOTAL_REWARD_CAP.toString()}`);

  // //wait and check the balance
  // while (true) {
  //   const balance = await rewardToken.balanceOf(staking.getAddress());
  //   console.log(`Staking contract balance: ${balance.toString()}`);
  //   if (balance < TOTAL_REWARD_CAP) {
  //     console.log("Insufficient balance in staking contract");
  //     sleep(100000);
  //   } else {
  //     break;
  //   }
  // }

  // // 4. Staking
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
