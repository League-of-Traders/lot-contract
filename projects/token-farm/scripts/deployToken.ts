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

  let token;
  const tokenContract = await ethers.getContractFactory("LotToken");
  token = await tokenContract.deploy();

  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
