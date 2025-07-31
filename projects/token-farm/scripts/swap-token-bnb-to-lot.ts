import { createPublicClient, http, hexToBigInt } from "viem";
import { bsc } from "viem/chains";
import { lot } from "./chain";
import { GraphQLClient } from "graphql-request";
import { SmartRouter, SMART_ROUTER_ADDRESSES, SwapRouter } from "@pancakeswap/smart-router";
import { CurrencyAmount, TradeType, ChainId, Percent, Native, ERC20Token } from "@pancakeswap/sdk";
import { privateKeyToAccount } from "viem/accounts";

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

const v3SubgraphClient = new GraphQLClient("https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc");
const v2SubgraphClient = new GraphQLClient("https://proxy-worker-api.pancakeswap.com/bsc-exchange");

const chainId = ChainId.BSC;
const quoteProvider = SmartRouter.createQuoteProvider({
  onChainProvider: () => publicClient,
});

const swapFrom = Native.onChain(chainId);
const swapTo = lot;

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

const raw = BigInt(0.0005 * 10 ** 18);
const amount = CurrencyAmount.fromRawAmount(swapFrom, raw);

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
console.log("Amount:", hexToBigInt(value));

// === Final Tx ===
const tx = {
  chainId: chainId,
  account: account.address,
  to: SMART_ROUTER_ADDRESSES[chainId],
  data: calldata,
  value: hexToBigInt(value),
};
const gasEstimate = await publicClient.estimateGas(tx);
const gasPrice = await publicClient.getGasPrice();
const nonce = await publicClient.getTransactionCount({
  address: account.address,
});

console.log("TX Object:", tx);

const signedTx = await account.signTransaction({ ...tx, gasPrice, gas: gasEstimate, nonce });

// Send raw
const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx });

console.log("Hash:", txHash);
console.log("BSC TX URL:", `https://bscscan.com/tx/${txHash}`);
