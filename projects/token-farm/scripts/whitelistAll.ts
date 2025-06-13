import { ethers, network } from "hardhat";
import { parseUnits, parseEther, getAddress } from "ethers";

import dotenv from "dotenv";
import config from "../config";

dotenv.config();
const currentNetwork = network.name;

const ADDRESSES: string[] = [
  "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
  "0x41ff9AA7e16B8B1a8a8dc4f0eFacd93D02d071c9",
  "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
  "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2",
  "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
  "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
  "0x9a489505a00cE272eAa5e07Dba6491314CaE3796",
  "0xac1cE734566f390A94b00eb9bf561c2625BF44ea",
  "0x678Aa4bF4E210cf2166753e054d5b7c31cc7fa86",
  "0x864ED564875BdDD6F421e226494a0E7c071C06f8",
];

async function main() {
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const confirm = await rl.question(`Are you sure you want to addresses ${ADDRESSES.length} addresses? (y/N): `);
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

  let i = 1;
  for (const address of ADDRESSES) {
    const result = await token.addToWhitelist(address);
    console.log(i, "done tx hash:", result.hash);
    i++;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
