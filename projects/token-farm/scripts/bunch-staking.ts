import { SQL } from "bun";
import { ethers, network } from "hardhat";
import { parseUnits, parseEther } from "ethers";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const provider = new ethers.JsonRpcProvider(process.env.RPC_BSC);
const BSCProvider = new ethers.JsonRpcProvider("https://bsc-dataseed.binance.org/");
const rewardToken = "0xbfe78De7D1c51E0868501D5FA3E88e674C79AcDD";
const stakingContract = "0x5D57341545996Da0A8edf730Eef618689523ed1c";

const publicClient = createPublicClient({
  chain: bsc,
  transport: http("https://bsc-dataseed1.binance.org"),
});

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

const randomSleep = (minMs, maxMs) => {
  const rand = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, rand));
};

const sendAmount = ethers.parseEther("0.000015"); // 보낼 수량
const key = ("0x" + process.env.KEY_BSC) as `0x${string}`;
const account = privateKeyToAccount(key); // ⚠️ 개발용 ONLY!

for (const w of wallets) {
  console.log(w.address, w.id);
  // if (w.id < 54) {
  // continue;
  // }
  if (w.id >= 681) {
    break;
  }
  if (w.staked) {
    continue;
  }

  const bnbBalance = await BSCProvider.getBalance(w.address);

  const gasPrice = await publicClient.getGasPrice();
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  // console.log(`🚀 Sending to ${w.address}`);
  // const signedTx = await account.signTransaction({
  //   chain: bsc,
  //   to: w.address,
  //   value: sendAmount,
  //   gas: 21000n,
  //   gasPrice,
  //   nonce,
  // });

  // const txHash = await publicClient.sendRawTransaction({
  //   serializedTransaction: signedTx,
  // });

  // console.log(`✅ send hash: ${txHash}`);

  // await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log("bnbBalance", ethers.formatUnits(bnbBalance, 18));
  if (Number(bnbBalance) === 0) {
    console.log(`skipped staking, insuffisant BNB Balance: ${bnbBalance} BNB, id: ${w.id}`);
    continue;
  }

  const signer = new ethers.Wallet(w.secret, provider);
  const token = await ethers.getContractAt("LotToken", rewardToken, signer);
  console.log("token awaiting for deployment", w.address);
  await token.waitForDeployment();

  const balance = await token.balanceOf(w.address);
  // const balance = BigInt(1 * 10 ** 18)
  const amount = ethers.formatUnits(balance, 18);
  const staking = await ethers.getContractAt("TimeBasedStaking", stakingContract, signer);
  // const stakeAmount = parseUnits("10", 18);
  console.log("approving token spend", w.address, "amount", balance, amount);
  const approveTx = await token.approve(staking.getAddress(), balance);
  console.log("approved tx:", approveTx.hash);
  await provider.waitForTransaction(approveTx.hash, 3);
  console.log("staking", w.address, balance);
  await staking.stake(balance, 1460);
  console.log("done", w.address);

  await db`UPDATE bnb.keys SET staked = TRUE WHERE address = ${w.address}`;

  // sleep for
  await randomSleep(1000, 10_000); // 1s to 10s
}
