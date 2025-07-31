import { ethers } from "hardhat";
import { ChainId } from "@pancakeswap/chains";
import { CurrencyAmount, Native, TradeType, Percent } from "@pancakeswap/sdk";
import { SmartRouter } from "@pancakeswap/smart-router";
import { PancakeSwapUniversalRouter } from "@pancakeswap/universal-router-sdk";
import { bsc, theta } from "viem/chains";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GraphQLClient } from "graphql-request";
import { lot } from "./chain";
import { SQL } from "bun";
import { generatePermitTypedData, AllowanceTransfer } from "@pancakeswap/permit2-sdk";
import { recordVolume } from "./record";

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
const v3Pools = await SmartRouter.getV3CandidatePools({
  onChainProvider: () => publicClient,
  subgraphProvider: () => v3SubgraphClient,
  currencyA: swapFrom,
  currencyB: swapTo,
});

export async function buildSellLOT(id: string, secret: string, balance: bigint, lotPrice?: number) {
  // ② SmartRouter로 Trade 생성
  const key = ("0x" + secret) as `0x${string}`;
  const account = privateKeyToAccount(key);

  // const signer = new ethers.Wallet(secret, provider);
  // const token = await ethers.getContractAt("LotToken", rewardToken, signer);
  // await token.waitForDeployment();

  // const balance = await token.balanceOf(account.address);

  try {
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

    await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 1 });

    console.log(`✅ Sell completed TX URL:`, `https://bscscan.com/tx/${txHash}`);
  } catch (e) {
    throw e;
  }
  // console.log(Number(amountToSwap.toExact()), amountToSwap, lotPrice);

  // await recordVolume(`${id}`, undefined, Number(amountToSwap.toExact()) * lotPrice);
}
