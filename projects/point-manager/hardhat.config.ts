import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "dotenv/config";

const config = {
  solidity: "0.8.26",
  networks: {
    opbnb: {
      url: process.env.RPC_OPBNB,
      chainId: 204,
      accounts: [process.env.KEY_OPBNB],
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
      opbnb: process.env.API_KEY_OPBNB,
    },
    customChains: [
      {
        network: "opbnb",
        chainId: 204,
        urls: {
          apiURL: `https://open-platform.nodereal.io/${process.env.API_KEY_OPBNB}/op-bnb-mainnet/contract`,
          browserURL: "https://opbnbscan.com",
        },
      },
    ],
  },
};

export default config;
