import { parseUnits } from "ethers";
import { ethers, network } from "hardhat";

import dotenv from "dotenv";
import config from "../config";

dotenv.config();
const currentNetwork = network.name;

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

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

  const tx = await pts.setPrices(parseUnits("1", 8), parseUnits("2", 8), parseUnits("0.05", 8), parseUnits("1", 8)); // BNB price in USD
  console.log(`Set prices:`);

  await tx.wait();
  console.log("Prices set successfully");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
