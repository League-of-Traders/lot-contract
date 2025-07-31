import { SQL } from "bun";
import { formatUnits, id } from "ethers";
import { ethers } from "hardhat";
import { privateKeyToAccount } from "viem/accounts";
import { lot } from "./chain";
import { createData, createVolumeData, findAndUpdate, notion } from "./notion-db";

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

const provider = new ethers.JsonRpcProvider(process.env.RPC_BSC);

export async function getBNBPrice() {
  const res = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT");
  const data = await res.json();
  return data.price as number;
}

export async function getLOTPrice() {
  const res = await fetch(
    "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/token/full/info?chainId=56&contractAddress=0xbfe78de7d1c51e0868501d5fa3e88e674c79acdd",
  );
  const data = await res.json();
  return data?.data?.priceInfo?.price as number;
}

export async function recordVolume(id: string, buyVolume?: number, sellVolume?: number) {
  await findAndUpdate({ id, buyVolume, sellVolume });
}

async function checkBalance(id: string, secret: string, bnbPrice: number, lotPrice: number) {
  const key = ("0x" + secret) as `0x${string}`;
  const account = privateKeyToAccount(key);

  const signer = new ethers.Wallet(secret, provider);
  const token = await ethers.getContractAt("LotToken", lot.address, signer);
  await token.waitForDeployment();

  const bnbBalance = await provider.getBalance(account.address);
  const lotBalance = await token.balanceOf(account.address);

  const bnbUsd = Number(formatUnits(bnbBalance, 18)) * bnbPrice;
  const lotUsd = Number(formatUnits(lotBalance, 18)) * lotPrice;

  const data = await createData({
    id: `${id}`,
    address: account.address,
    bnb: formatUnits(bnbBalance, 18),
    bnbUsd: bnbUsd.toFixed(2),
    lot: formatUnits(lotBalance, 18),
    lotUsd: lotUsd.toFixed(2),
  });

  await notion.pages.create(data);
}

async function main() {
  const bnbPrice = await getBNBPrice();
  const lotPrice = await getLOTPrice();

  for (const w of wallets) {
    if (w.id <= 680) {
      continue;
    }
    if (w.id >= 1081) {
      break;
    }
    checkBalance(w.id, w.secret, bnbPrice, lotPrice);
  }
}

// main().catch(console.error);
