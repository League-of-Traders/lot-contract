import { SQL } from "bun";
import { buildSellLOT } from "./swap-token-universal-sell";
import { buildBuyLOT } from "./swap-token-universal";
import { getBNBPrice, getLOTPrice } from "./record";

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
const list = [701, 702, 716];
async function main() {
  const bnbPrice = await getBNBPrice();
  const lotPrice = await getLOTPrice();

  for (const w of wallets) {
    // if (!list.includes(w.id)) {
    //   continue;
    // }
    if (w.id <= 680) {
      continue;
    }
    if (w.id >= 731) {
      break;
    }
    console.log("=================================================");
    console.log(w.id, w.address);

    await buildSellLOT(w.id, w.secret, lotPrice);
    await buildBuyLOT(w.id, w.secret, bnbPrice);
    // break;
  }
}

main().catch(console.error);
