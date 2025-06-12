import { ethers, network } from "hardhat";
import { parseUnits, parseEther } from "ethers";

import dotenv from "dotenv";
import config from "../config";

dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  let token;
  const tokenContract = await ethers.getContractFactory("LotToken");
  const transferAllowTime = config.transferAllowTime();
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const confirm = await rl.question(
    `Confirm issuing token,${"\n"}TransferAllowTime: ${transferAllowTime}\n${new Date(transferAllowTime * 1000).toLocaleString()}? (y/n): `,
  );
  rl.close();
  if (confirm.toLowerCase() !== "y") {
    console.log("Action aborted.");
    return;
  }

  token = await tokenContract.deploy(transferAllowTime);

  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
