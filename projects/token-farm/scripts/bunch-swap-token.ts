import {
  createPublicClient,
  http,
  encodeFunctionData, parseUnits, formatUnits, hexToBigInt,
} from 'viem';
import { bsc } from 'viem/chains';
import { lot } from "./chain";
import {
  SmartRouter,
  SMART_ROUTER_ADDRESSES,
  SwapRouter,
} from '@pancakeswap/smart-router';
import { GraphQLClient } from 'graphql-request';
import {
  Native,
  CurrencyAmount,
  ChainId,
  Percent, TradeType,
} from '@pancakeswap/sdk';
import { privateKeyToAccount } from "viem/accounts";
import {SQL} from "bun";
import { ethers } from "hardhat";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// === 기본 설정 ===
const chainId = ChainId.BSC;
const publicClient = createPublicClient({
  chain: bsc,
  transport: http("https://bsc-dataseed.binance.org/"),
});
const provider = new ethers.JsonRpcProvider(process.env.RPC_BSC);
const v2SubgraphClient = new GraphQLClient(
  'https://proxy-worker-api.pancakeswap.com/bsc-exchange'
);
const v3SubgraphClient = new GraphQLClient('https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc')

const rewardToken = "0xbfe78De7D1c51E0868501D5FA3E88e674C79AcDD";

const routerAddress = SMART_ROUTER_ADDRESSES[chainId];
const quoteProvider = SmartRouter.createQuoteProvider({
  onChainProvider: () => publicClient,
})

// === 토큰 설정 ===
const swapFrom = lot
const swapTo = Native.onChain(chainId);

// === 계정 리스트 ===
// const key = '0x' +process.env.KEY_BSC as `0x${string}`
// const account = privateKeyToAccount(key); // ⚠️ 개발용 ONLY!

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


// === V2 풀 준비 ===
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
])

const sendAmount = ethers.parseEther("0.000015"); // 보낼 수량
const mainKey = '0x' +process.env.KEY_BSC as `0x${string}`
const main = privateKeyToAccount(mainKey); // ⚠️ 개발용 ONLY!
// === 계정별 for-of ===
for (const w of wallets) {
  if (w.id > 63){
      break;
  }
  const key = '0x' + w.secret as `0x${string}`
  const account = privateKeyToAccount(key);

  const signer = new ethers.Wallet(w.secret, provider);
  const token = await ethers.getContractAt("LotToken", rewardToken, signer);
  await token.waitForDeployment();
  const balance = await token.balanceOf(account.address);

  console.log(w.id, w.address)
  if (Number(formatUnits(balance, 18)) <= 1){
    console.log('Is less than 0', formatUnits(balance,18))
    continue
  }

  const sendGasPrice = await publicClient.getGasPrice();
  const sendNonce = await publicClient.getTransactionCount({
    address: main.address,
    blockTag: 'pending',
  });

  console.log(`🚀 Sending to ${account.address}`);
  const signedTx = await main.signTransaction({
    chain: bsc,
    to: account.address,
    value: sendAmount,
    gas: 21000n,
    gasPrice:sendGasPrice,
    nonce:sendNonce,
  });

  const txHash = await publicClient.sendRawTransaction({
    serializedTransaction: signedTx,
  });

  console.log(`✅ send hash: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  const amount = CurrencyAmount.fromRawAmount(swapFrom, balance)
  console.log(balance, amount.quotient)

  const trade = await SmartRouter.getBestTrade(amount, swapTo, TradeType.EXACT_INPUT, {
    gasPriceWei: () => publicClient.getGasPrice(),
    maxHops: 2,
    maxSplits: 2,
    poolProvider: SmartRouter.createStaticPoolProvider([...v2Pools, ...v3Pools]),
    quoteProvider,
    quoterOptimization: true,
  })


  const { value, calldata } = SwapRouter.swapCallParameters(trade, {
    recipient: account.address,
    slippageTolerance: new Percent(50, 10000),
    useNative: true
  })

  console.log('Input:', trade.inputAmount.toExact());
  console.log('Output:', trade.outputAmount.toExact());
  console.log('value (should be 0):', value);

// === 5) Approve CAKE ===
// encode ERC20 approve
  const approveData = encodeFunctionData({
    abi: [
      {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'spender', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
    ],
    functionName: 'approve',
    args: [routerAddress, amount.quotient],
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
    blockTag: 'pending',
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

  console.log('✅ Approve Hash:', approveHash);

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
    blockTag: 'pending',
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

  console.log('✅ Swap Hash:', swapHash);
  console.log('BSC TX URL:', `https://bscscan.com/tx/${swapHash}`)
  break;
}
