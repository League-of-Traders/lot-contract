import { createPublicClient, http, hexToBigInt, encodeFunctionData } from "viem";
import { bsc } from "viem/chains";
import { lot } from "./chain";
import { GraphQLClient } from "graphql-request";
import { SmartRouter, SMART_ROUTER_ADDRESSES, SwapRouter } from "@pancakeswap/smart-router";
import { CurrencyAmount, TradeType, ChainId, Percent, Native } from "@pancakeswap/sdk";
import { privateKeyToAccount } from "viem/accounts";

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
  transport: http("https://bsc-dataseed1.binance.org"),
  batch: {
    multicall: {
      batchSize: 1024 * 200,
    },
  },
});

const key = ("0x" + process.env.KEY_BSC) as `0x${string}`;
const account = privateKeyToAccount(key); // ⚠️ 개발용 ONLY!

const v2SubgraphClient = new GraphQLClient("https://proxy-worker-api.pancakeswap.com/bsc-exchange");
const v3SubgraphClient = new GraphQLClient("https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc");

const chainId = ChainId.BSC;
const routerAddress = SMART_ROUTER_ADDRESSES[chainId];
const quoteProvider = SmartRouter.createQuoteProvider({
  onChainProvider: () => publicClient,
});

const swapFrom = lot;
const swapTo = Native.onChain(chainId);

const [v2Pools, v3Pools] = await Promise.all([
  SmartRouter.getV2CandidatePools({
    onChainProvider: () => publicClient,
    v2SubgraphProvider: () => v2SubgraphClient,
    v3SubgraphProvider: () => v3SubgraphClient,
    currencyA: swapFrom,
    currencyB: swapTo,
  }),
  SmartRouter.getV3CandidatePools({
    onChainProvider: () => publicClient,
    subgraphProvider: () => v3SubgraphClient,
    currencyA: swapFrom,
    currencyB: swapTo,
  }),
]);

const raw = BigInt(1 * 10 ** 18);
const amount = CurrencyAmount.fromRawAmount(swapFrom, raw);
console.log(amount, amount.quotient);

const trade = await SmartRouter.getBestTrade(amount, swapTo, TradeType.EXACT_INPUT, {
  gasPriceWei: () => publicClient.getGasPrice(),
  maxHops: 2,
  maxSplits: 2,
  poolProvider: SmartRouter.createStaticPoolProvider([...v2Pools, ...v3Pools]),
  quoteProvider,
  quoterOptimization: true,
});

const { value, calldata } = SwapRouter.swapCallParameters(trade, {
  recipient: account.address,
  slippageTolerance: new Percent(50, 10000),
  useNative: true,
});

console.log("Input:", trade.inputAmount.toExact());
console.log("Output:", trade.outputAmount.toExact());
console.log("value (should be 0):", value);

// === 5) Approve CAKE ===
// encode ERC20 approve
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
  args: [routerAddress, amount.quotient],
});

console.log(swapFrom.address, account.address);
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

console.log("✅ Approve Hash:", approveHash);

// === 6) Wait Approve (권장) ===
await publicClient.waitForTransactionReceipt({ hash: approveHash });

// === 7) Send Swap TX ===
const gas = await publicClient.estimateGas({
  account: account.address,
  to: routerAddress,
  data: calldata,
  value: 0n,
});

const gasPrice = await publicClient.getGasPrice();
const nonce = await publicClient.getTransactionCount({
  address: account.address,
  blockTag: "pending",
});

const signedSwap = await account.signTransaction({
  chain: bsc,
  account: account.address,
  to: routerAddress,
  data: calldata,
  value: 0n, // ✅ ERC20 -> Native: value 0!
  gas,
  gasPrice,
  nonce,
});

const swapHash = await publicClient.sendRawTransaction({
  serializedTransaction: signedSwap,
});

console.log("✅ Swap Hash:", swapHash);
console.log("BSC TX URL:", `https://bscscan.com/tx/${swapHash}`);
