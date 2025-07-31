import { SQL } from "bun";
import { ethers, network } from "hardhat";
import { parseUnits, parseEther } from "ethers";
import {privateKeyToAccount} from "viem/accounts";
import {createPublicClient, http} from "viem";
import {bsc} from "viem/chains";

const array = [

]

const publicClient = createPublicClient({
    chain: bsc,
    transport: http('https://bsc-dataseed.binance.org/'),
});

const key = '0x' +process.env.KEY_BSC as `0x${string}`
const account = privateKeyToAccount(key); // ⚠️ 개발용 ONLY!

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


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomSleep = (minMs, maxMs) => {
    const rand = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return sleep(rand);
};


const sendAmount = ethers.parseEther("0.00002"); // 보낼 수량

for (const w of wallets) {
    if (w.id > 10){
        break;
    }

    const balance = await publicClient.getBalance({address: w.address})
    console.log(`${w.id}: balance: ${balance}`);
    // if (Number(balance) >= 0){
    //     console.log(`skipped send, BNB Balance: ${balance} BNB, id: ${w.id}`);
    //     continue
    // }

    const gas = await publicClient.estimateGas({
        account: account.address,
        to:w.address,
        value: sendAmount,
    });
    const gasPrice = await publicClient.getGasPrice();
    const nonce = await publicClient.getTransactionCount({
        address: account.address,
        blockTag: 'pending',
    });

    console.log(`🚀 Sending to ${w.address}`);
    const signedTx = await account.signTransaction({
        chain: bsc,
        to:w.address,
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


