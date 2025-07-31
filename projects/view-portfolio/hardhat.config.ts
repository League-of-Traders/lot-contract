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
    bsc: {
      url: process.env.RPC_BSC,
      chainId: 56,
      accounts: [process.env.KEY_BSC],
    },
    bsc_testnet: {
      url: process.env.RPC_BSC_TESTNET,
      chainId: 97,
      accounts: [process.env.KEY_BSC_TESTNET],
    },
    hardhat: {
      forking: {
        url: "https://bsc-dataseed1.binance.org/",
      },
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
      bsc: process.env.API_KEY_BSC,
      bsc_testnet: process.env.API_KEY_BSC_TESTNET,
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
      {
        network: "bsc",
        chainId: 56,
        urls: {
          apiURL: `https://api.bscscan.com/api`,
          browserURL: "https://bscscan.com",
        },
      },
      {
        network: "bsc_testnet",
        chainId: 97,
        urls: {
          apiURL: `https://api-testnet.bscscan.com/api`,
          browserURL: "https://testnet.bscscan.com",
        },
      },
    ],
  },
};

export default config;
