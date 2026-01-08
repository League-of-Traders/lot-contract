import { ethers, network } from "hardhat";
import { parseUnits, parseEther, getAddress } from "ethers";

import dotenv from "dotenv";
import config from "../config";

dotenv.config();
const currentNetwork = network.name;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const newOwner = config.newOwner[currentNetwork];
  if (!newOwner || !ethers.isAddress(newOwner)) {
    throw new Error("Please provide a valid newOwner address as argument");
  }

  const tokenAddress = config.tokenAddress[currentNetwork];
  const oracleAddress = config.dexOracleAddress[currentNetwork];
  console.log("Deploying PortfolioViewV2 with token:", tokenAddress, "and oracle:", oracleAddress);

  const oracle = await ethers.getContractAt("IDexPriceOracle", oracleAddress);

  try {
    const tokenFromOracle = await oracle.getTokenAddress();
    console.log("Oracle returns token address:", tokenFromOracle);
  } catch (err) {
    console.error("❌ getTokenAddress() failed:", err);
  }

  // Parameters
  const payToSee = config.payToSeeV2[currentNetwork];
  let pts;

  if (payToSee && typeof payToSee === "string" && payToSee.startsWith("0x") && payToSee.length === 42) {
    pts = await ethers.getContractAt("PortfolioViewV2", payToSee);
  } else {
    const ContractFactory = await ethers.getContractFactory("PortfolioViewV2");
    pts = await ContractFactory.deploy(tokenAddress, oracleAddress);
  }
  await pts.waitForDeployment();
  console.log("Contract deployed at:", await pts.getAddress());

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

  const tx = await pts.transferOwnership(newOwner);
  await tx.wait();
  console.log("Ownership transferred to: ", newOwner);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
