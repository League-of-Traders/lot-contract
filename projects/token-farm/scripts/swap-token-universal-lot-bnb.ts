import { formatUnits } from "ethers";
import { ethers, network } from "hardhat";
import { ChainId } from "@pancakeswap/chains";
import { CurrencyAmount, Native, TradeType, Percent } from "@pancakeswap/sdk";
import { SmartRouter } from "@pancakeswap/smart-router";
import { PancakeSwapUniversalRouter } from "@pancakeswap/universal-router-sdk";
import { bsc } from "viem/chains";
import { createPublicClient, createWalletClient, http, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GraphQLClient } from "graphql-request";
import { lot } from "./chain";
import { SQL } from "bun";
import { generatePermitTypedData, AllowanceTransfer, MaxAllowanceTransferAmount } from "@pancakeswap/permit2-sdk";
import { createData, updateData, notion } from "./notion-db";
import { bscTokens } from "@pancakeswap/tokens";

const db = new SQL({
  url: "postgres://postgres:P6xPYZ-Y83xkb-ByobvJL@bnb-keys:5434/bnb",
  max: 20,
  idleTimeout: 30,
  maxLifetime: 0,
  connectionTimeout: 30,
  tls: false,
  onconnect: (client) => {
    console.log("Success! Connected to database");
  },
  onclose: (client) => {
    console.log("Failed! Connection closed");
  },
});

await db.connect();
const wallets = await db`
  SELECT * FROM bnb.keys ORDER BY id
`;

const publicClient = createPublicClient({
  chain: bsc,
  transport: http("https://bsc-dataseed.binance.org/"),
});
const v3SubgraphClient = new GraphQLClient("https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc");

const quoteProvider = SmartRouter.createQuoteProvider({
  onChainProvider: () => publicClient,
});

const chainId = ChainId.BSC;

const swapFrom = lot;
const swapTo = Native.onChain(chainId);

const routerAddress = "0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB";
const PERMIT2_ADDRESS = "0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768";
const rewardToken = "0xbfe78De7D1c51E0868501D5FA3E88e674C79AcDD";

const raw = BigInt(1 * 10 ** 18);
const amount = CurrencyAmount.fromRawAmount(swapFrom, raw);

const slippageTolerance = new Percent(50, 10000);

async function createPermit2Signature(secret: string) {
  const key = ("0x" + secret) as `0x${string}`;
  const account = privateKeyToAccount(key);

  const result = await publicClient.readContract({
    address: PERMIT2_ADDRESS,
    abi: [
      {
        name: "allowance",
        type: "function",
        stateMutability: "view",
        inputs: [
          { name: "", type: "address" },
          { name: "", type: "address" },
          { name: "", type: "address" },
        ],
        outputs: [
          { name: "amount", type: "uint160" },
          { name: "expiration", type: "uint48" },
          { name: "nonce", type: "uint48" },
        ],
      },
    ],
    functionName: "allowance",
    args: [account.address, swapFrom.address, routerAddress],
  });

  const permitSingle = generatePermitTypedData(swapFrom, result?.at(2) as bigint, routerAddress);
  const client = createWalletClient({
    account,
    chain: bsc,
    transport: http("https://bsc-dataseed.binance.org/"),
  });

  const permitData = AllowanceTransfer.getPermitData(permitSingle, PERMIT2_ADDRESS, 56);

  const signature = await client.signTypedData({
    domain: permitData.domain,
    types: permitData.types,
    primaryType: "PermitSingle",
    message: permitData.values,
  });

  const permit2Signature = {
    ...permitSingle,
    signature,
  };

  return permit2Signature;
}

const provider = new ethers.JsonRpcProvider(process.env.RPC_BSC);
async function erc20Approve(secret: string) {
  const key = ("0x" + secret) as `0x${string}`;
  const account = privateKeyToAccount(key);

  const approveData = encodeFunctionData({
    abi: [
      {
        name: "approve",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "spender", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ name: "", type: "bool" }],
      },
    ],
    functionName: "approve",
    args: [PERMIT2_ADDRESS, MaxAllowanceTransferAmount],
  });

  // === Send approve TX ===
  const approveGas = await publicClient.estimateGas({
    account: account.address,
    to: swapFrom.address,
    data: approveData,
  });

  const approveGasPrice = await publicClient.getGasPrice();
  const approveNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  const signedApprove = await account.signTransaction({
    chain: bsc,
    account: account.address,
    to: swapFrom.address,
    data: approveData,
    gas: approveGas,
    gasPrice: approveGasPrice,
    nonce: approveNonce,
  });

  const approveHash = await publicClient.sendRawTransaction({
    serializedTransaction: signedApprove,
  });

  // === 6) Wait Approve (권장) ===
  await publicClient.waitForTransactionReceipt({ hash: approveHash });

  const allowance = await publicClient.readContract({
    address: swapFrom.address,
    abi: [
      {
        name: "allowance",
        type: "function",
        stateMutability: "view",
        inputs: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
        ],
        outputs: [{ name: "", type: "uint256" }],
      },
    ],

    functionName: "allowance",
    args: [account.address, PERMIT2_ADDRESS],
  });

  console.log("allowance: ", formatUnits(allowance, 18));

  console.log("✅ Approve Hash:", approveHash);
}

const v3Pools = await SmartRouter.getV3CandidatePools({
  onChainProvider: () => publicClient,
  subgraphProvider: () => v3SubgraphClient,
  currencyA: swapFrom,
  currencyB: swapTo,
});

async function buildSwapTx(id: string, secret: string) {
  // ② SmartRouter로 Trade 생성
  const key = ("0x" + secret) as `0x${string}`;
  const account = privateKeyToAccount(key);

  const signer = new ethers.Wallet(secret, provider);
  const token = await ethers.getContractAt("LotToken", rewardToken, signer);
  await token.waitForDeployment();

  const balance = await token.balanceOf(account.address);

  console.log("balance: ", formatUnits(balance, 18));

  const amountToSwap = CurrencyAmount.fromRawAmount(swapFrom, balance);
  const trade = await SmartRouter.getBestTrade(amountToSwap, swapTo, TradeType.EXACT_INPUT, {
    gasPriceWei: () => publicClient.getGasPrice(),
    maxHops: 2,
    maxSplits: 2,
    poolProvider: SmartRouter.createStaticPoolProvider(v3Pools),
    quoteProvider,
    quoterOptimization: true,
  });

  if (!trade) {
    console.log("No trade found for the specified amount.");
    return;
  }

  const permit = await createPermit2Signature(secret);
  console.log(`Estimated BNB out: ${trade.outputAmount?.toExact() || "Unknown"}`);
  const { calldata, value } = PancakeSwapUniversalRouter.swapERC20CallParameters(trade, {
    slippageTolerance,
    recipient: account.address,
    inputTokenPermit: permit,
  });

  // ④ UniversalRouter 실행
  const gas = await publicClient.estimateGas({
    account: account.address,
    to: routerAddress,
    data: calldata,
  });

  const gasPrice = await publicClient.getGasPrice();
  const nonceTx = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  const signedTx = await account.signTransaction({
    chain: bsc,
    account: account.address,
    to: routerAddress,
    data: calldata,
    value: 0n,
    gas,
    gasPrice,
    nonce: nonceTx,
  });

  const txHash = await publicClient.sendRawTransaction({
    serializedTransaction: signedTx,
  });

  console.log("✅ Swap TX Hash:", txHash);
  console.log(`https://bscscan.com/tx/${txHash}`);
}

async function main() {
  // for (const w of wallets) {
  //   if (w.id <= 680) {
  //     continue;
  //   }
  //   if (w.id >= 687) {
  //     break;
  //   }
  //   console.log("id: ", w.id, w.address);
  //   await erc20Approve(w.secret);
  //   await buildSwapTx(w.id, w.secret);
  // }
}

main().catch(console.error);
