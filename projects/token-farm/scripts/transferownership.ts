import { ethers, network } from "hardhat";
import { parseUnits, parseEther, getAddress } from "ethers";

import dotenv from "dotenv";

dotenv.config();
const config = require("../config");
const currentNetwork = network.name;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const newOwner = process.argv[2]; // argument for new owner address

  if (!newOwner || !ethers.isAddress(newOwner)) {
    throw new Error("Please provide a valid newOwner address as argument");
  }

  // Parameters
  let deployedTokenAddress = config.default.rewardTokenAddress[currentNetwork];
  let token;

  if (
    deployedTokenAddress &&
    typeof deployedTokenAddress === "string" &&
    deployedTokenAddress.startsWith("0x") &&
    deployedTokenAddress.length === 42
  ) {
    token = await ethers.getContractAt("LotToken", deployedTokenAddress);
  } else {
    const tokenContract = await ethers.getContractFactory("LotToken");

    const transferAllowTime = Math.floor(Date.now() / 1000) + 5;
    token = await tokenContract.deploy(transferAllowTime);
  }
  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());

  const tx = await token.transferOwnership(newOwner);
  await tx.wait();
  console.log("Ownership transferred to: ", newOwner);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
