import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "dotenv/config";

const config = {
  solidity: "0.8.26",
  networks: {
    bsc: {
      url: process.env.RPC_BSC,
      chainId: 56,
      accounts: [process.env.KEY_BSC],
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  etherscan: {
    apiKey: {
      bsc: process.env.API_KEY_BSC,
    },
    customChains: [
      {
        network: "bsc",
        chainId: 56,
        urls: {
          apiURL: `https://api.bscscan.com/api`,
          browserURL: "https://bscscan.com",
        },
      },
    ],
  },
};

export default config;
