export default {
  rewardTokenAddress: {
    bsc: "0xbfe78De7D1c51E0868501D5FA3E88e674C79AcDD",
    bsc_testnet: "",
    opbnb: "",
  },
  stakingAddress: {
    bsc: "0x5D57341545996Da0A8edf730Eef618689523ed1c",
    opbnb: "",
  },
  transferAllowTime: () => {
    //TODO Change to TGE timestamp in seconds 1749696814
    return Math.floor(Date.now() / 1000) + 5;
  },
  newOwner: {
    bsc: "0xb3b4577DCC5f95890a5E16A9Ac181f6B7bB00f4e",
    bsc_testnet: "",
    opbnb: "",
  },
};
