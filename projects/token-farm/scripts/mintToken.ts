import { ethers, network } from "hardhat";
import { parseUnits, parseEther, getAddress } from "ethers";

import dotenv from "dotenv";
import config from "../config";

dotenv.config();
const currentNetwork = network.name;

async function main() {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const address = process.env.MINT_ADDRESS;
  const amount = process.env.MINT_AMOUNT;

  if (!address || !amount) {
    console.error("Usage: <MINT_ADDRESS> <MINT_AMOUNT> yarn mint:<chain>");
    process.exit(1);
  }

  const confirm = await rl.question(`Are you sure you want to mint ${amount} tokens to ${address}? (y/N): `);
  rl.close();
  if (confirm.toLowerCase() !== "y") {
    console.log("Action aborted.");
    return;
  }

  // Parameters
  let deployedTokenAddress = config.rewardTokenAddress[currentNetwork];
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
    const transferAllowTime = config.transferAllowTime();
    token = await tokenContract.deploy(transferAllowTime);
  }
  await token.waitForDeployment();
  console.log("Token deployed to:", await token.getAddress());

  const result = await token.mintTo(address, parseUnits(amount, 18));
  console.log(`${amount} tokens minted to ${address}`);
  console.log("Tx hash:", result.hash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
