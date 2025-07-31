import { SQL } from "bun";
import { buildSellLOT } from "./swap-token-universal-sell";
import { buildBuyLOT } from "./swap-token-universal";
import { getBNBPrice, getLOTPrice } from "./record";
import { privateKeyToAccount } from "viem/accounts";
import { ethers } from "hardhat";
import { lot } from "./chain";
import { formatUnits } from "ethers";

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
async function getBnbBalance(secret: string) {
  const key = ("0x" + secret) as `0x${string}`;
  const account = privateKeyToAccount(key);

  return await provider.getBalance(account.address);
}
async function getLotBalance(secret: string) {
  const key = ("0x" + secret) as `0x${string}`;
  const account = privateKeyToAccount(key);

  const signer = new ethers.Wallet(secret, provider);
  const token = await ethers.getContractAt("LotToken", lot.address, signer);
  await token.waitForDeployment();

  return await token.balanceOf(account.address);
}

const list = [701, 702, 716];
async function main() {
  // const bnbPrice = await getBNBPrice();
  // const lotPrice = await getLOTPrice();

  for (const w of wallets) {
    // if (!list.includes(w.id)) {
    //   continue;
    // }
    if (w.id <= 680) {
      continue;
    }
    if (w.id >= 1081) {
      break;
    }

    console.log("=================================================");
    console.log(w.id, w.address);

    try {
      const lotBalance = await getLotBalance(w.secret);
      console.log("LOT balance: ", lotBalance, formatUnits(lotBalance, 18));
      if (lotBalance <= 0n) {
        await buildBuyLOT(w.id, w.secret, lotBalance);
        const newBalance = await getLotBalance(w.secret);
        console.log("LOT newBalance: ", newBalance, formatUnits(newBalance, 18));
        await buildSellLOT(w.id, w.secret, newBalance);
      } else {
        await buildSellLOT(w.id, w.secret, lotBalance);
        await buildBuyLOT(w.id, w.secret, lotBalance);
      }
    } catch (e) {
      console.log(e);
      continue;
    }

    // break;
  }
}

main().catch(console.error);
