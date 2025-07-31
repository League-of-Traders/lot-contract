import { ethers, network } from "hardhat";
import { ChainId } from "@pancakeswap/chains";
import { CurrencyAmount, Native, Token, TradeType, Percent } from "@pancakeswap/sdk";
import { SmartRouter } from "@pancakeswap/smart-router";
import { PancakeSwapUniversalRouter, getUniversalRouterAddress } from "@pancakeswap/universal-router-sdk";
import { lot } from "./chain";
import { bsc } from "viem/chains";
import { createPublicClient, http, hexToBigInt, encodeFunctionData, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GraphQLClient } from "graphql-request";
import { recordVolume } from "./record";

const publicClient = createPublicClient({
  chain: bsc,
  transport: http("https://bsc-dataseed.binance.org/"),
});
const v3SubgraphClient = new GraphQLClient("https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc");

const quoteProvider = SmartRouter.createQuoteProvider({
  onChainProvider: () => publicClient,
});
const provider = new ethers.JsonRpcProvider(process.env.RPC_BSC);

// ① 체인 설정
const chainId = ChainId.BSC;

// ② 토큰 정보 (LOT)
const swapFrom = Native.onChain(chainId);
const swapTo = lot;

const routerAddress = getUniversalRouterAddress(chainId);
const rewardToken = "0xbfe78De7D1c51E0868501D5FA3E88e674C79AcDD";

const v3Pools = await SmartRouter.getV3CandidatePools({
  onChainProvider: () => publicClient,
  subgraphProvider: () => v3SubgraphClient,
  currencyA: swapFrom,
  currencyB: swapTo,
});

// ④ 유저 설정
const slippageTolerance = new Percent(50, 10000);

export async function buildBuyLOT(id: string, secret: string, lotBalance: bigint, bnbPrice?: number) {
  // 5) SmartRouter로 Trade 생성
  const key = ("0x" + secret) as `0x${string}`;
  const account = privateKeyToAccount(key);

  // const signer = new ethers.Wallet(secret, provider);
  // const token = await ethers.getContractAt("LotToken", rewardToken, signer);
  // await token.waitForDeployment();

  // const balance = await token.balanceOf(account.address);

  // if (lotBalance > 0n) {
  //   return;
  // }

  const bnbBalance = await provider.getBalance(account.address);
  const raw = bnbBalance - BigInt(0.0001 * 10 ** 18);
  const amount = CurrencyAmount.fromRawAmount(swapFrom, raw);
  const trade = await SmartRouter.getBestTrade(amount, swapTo, TradeType.EXACT_INPUT, {
    gasPriceWei: () => publicClient.getGasPrice(),
    maxHops: 1,
    maxSplits: 1,
    poolProvider: SmartRouter.createStaticPoolProvider(v3Pools),
    quoteProvider,
    quoterOptimization: true,
    gasEstimate: 0n,
  });

  if (!trade) {
    console.log("No trade found.");
    return;
  }

  // 6) UniversalRouter SDK로 calldata 생성
  const { calldata, value } = PancakeSwapUniversalRouter.swapERC20CallParameters(trade, {
    slippageTolerance,
    recipient: account.address,
    deadline: Math.floor(Date.now() / 1000) + 60 * 10,
    gasEstimate: 0n,
  });

  // console.log("msg.value to send:", value.toString());
  console.log(`Estimated LOT amount out: ${trade?.outputAmount?.toExact() || "Unknown"}`);

  // ⑦ 유저 지갑 트랜잭션 요청
  const tx = {
    chainId: chainId,
    account: account.address,
    to: routerAddress,
    data: calldata,
    value: hexToBigInt(value),
  };
  const gas = await publicClient.estimateGas(tx);

  const gasPrice = await publicClient.getGasPrice();
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  const signedTx = await account.signTransaction({ ...tx, gasPrice, gas, nonce });

  // Send raw
  const txHash = await publicClient.sendRawTransaction({ serializedTransaction: signedTx });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

  console.log("✅ Buy completed TX URL:", `https://bscscan.com/tx/${txHash}`);

  // await recordVolume(`${id}`, Number(amount.toExact()) * bnbPrice);
}
