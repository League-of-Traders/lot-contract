import { ethers, network } from "hardhat";
import { parseUnits, parseEther } from "ethers";

import dotenv from "dotenv";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  let token;
  const tokenContract = await ethers.getContractFactory("LotToken");

  const transferAllowTime = Math.floor(Date.now() / 1000) + 5;
  token = await tokenContract.deploy(transferAllowTime);

  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
