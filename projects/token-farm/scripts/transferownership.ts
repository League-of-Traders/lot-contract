import { ethers, network } from "hardhat";
import { parseUnits, parseEther, getAddress } from "ethers";

import dotenv from "dotenv";
import config from "../config";

dotenv.config();
const currentNetwork = network.name;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const newOwner = config.newOwner['bsc'];
  if (!newOwner || !ethers.isAddress(newOwner)) {
    throw new Error("Please provide a valid newOwner address as argument");
  }

  // Parameters
  let deployedTokenAddress = config.stakingAddress[currentNetwork];
  let token;

  if (
    deployedTokenAddress &&
    typeof deployedTokenAddress === "string" &&
    deployedTokenAddress.startsWith("0x") &&
    deployedTokenAddress.length === 42
  ) {
    token = await ethers.getContractAt("TimeBasedStaking", deployedTokenAddress);
  } else {
    const tokenContract = await ethers.getContractFactory("TimeBasedStaking");
    const transferAllowTime = config.transferAllowTime();
    token = await tokenContract.deploy(transferAllowTime);
  }
  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());

  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const confirm = await rl.question("Are you sure you want to transfer ownership to " + newOwner + "? (y/n): ");
  rl.close();
  if (confirm.toLowerCase() !== "y") {
    console.log("Transfer aborted.");
    return;
  }

  const tx = await token.transferOwnership(newOwner);
  await tx.wait();
  console.log("Ownership transferred to: ", newOwner);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
