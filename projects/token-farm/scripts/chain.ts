import { ERC20Token, ChainId } from "@pancakeswap/sdk";
import config from "../config";

let deployedTokenAddress = config.rewardTokenAddress["bsc"] as `0x${string}`;

const chainId = ChainId.BSC;
export const lot = new ERC20Token(
  chainId,
  "0xbfe78De7D1c51E0868501D5FA3E88e674C79AcDD" as `0x${string}`,
  18, // 소수점 자리수
  "LOT", // 심볼
  "League of Traders", // 이름
);
