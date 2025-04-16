import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  const pointManagerAddress = "0xD66De4109cd3f6f0c039064F51A94D80c5C6A3C8";

  const ContractFactory = await ethers.getContractFactory("FollowSocial");
  const contract = await ContractFactory.deploy(pointManagerAddress);

  await contract.waitForDeployment();
  console.log("Contract deployed at:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
