import { SQL } from "bun";
import { ethers, network } from "hardhat";
import { parseUnits, parseEther } from "ethers";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";
import { bsc } from "viem/chains";

const array = []; // done 200

const publicClient = createPublicClient({
  chain: bsc,
  transport: http("https://bsc-dataseed.binance.org/"),
});

const key = ("0x" + process.env.KEY_BSC) as `0x${string}`;
const account = privateKeyToAccount(key); // ⚠️ 개발용 ONLY!

const sendAmount = ethers.parseEther("0.00001"); // 보낼 수량

for (const to of array) {
  // if (w.id <= 10){
  //     continue
  // }
  // if (w.id > 15){
  //     break;
  // }

  //   const balance = await publicClient.getBalance({ address: to });
  //   console.log(`${to}: balance: ${balance}`);
  //   if (Number(balance) >= 10000000000000) {
  //     console.log(`skipped send, BNB Balance: ${balance} BNB, id: ${to}`);
  //     continue;
  //   }

  const gas = await publicClient.estimateGas({
    account: account.address,
    to,
    value: sendAmount,
  });
  const gasPrice = await publicClient.getGasPrice();
  const nonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });

  console.log(`🚀 Sending to ${to}...`);
  const signedTx = await account.signTransaction({
    chain: bsc,
    to,
    value: sendAmount,
    gas: 21000n,
    gasPrice,
    nonce,
  });

  const txHash = await publicClient.sendRawTransaction({
    serializedTransaction: signedTx,
  });

  console.log(`✅ send hash: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
}
