export default {
  rewardTokenAddress: {
    bsc: "0x834132f6695Aa3CB70C6B3819E4b157548350e4E",
    bsc_testnet: "0x133E50B9efd26853727923eF23e6bd9548Cc9809",
    opbnb: "0x41b149431563bA322e167634e52a075dB42a8C5e",
  },
  stakingAddress: {
    bsc: "0x5A5a07aE8405cBE4c2C2F1Df45C6b737305FEa30",
    opbnb: "0x91736C31E022199f9445A94aaE4C524E62108C86",
  },
  transferAllowTime: () => {
    //TODO Change to TGE timestamp in seconds 1749696814
    return Math.floor(Date.now() / 1000) + 5;
  },
  newOwner: {
    bsc: "0x4308071c90Ad495fd33d539F6826211FE531d549",
    bsc_testnet: "0x4308071c90Ad495fd33d539F6826211FE531d549",
    opbnb: "0x4308071c90Ad495fd33d539F6826211FE531d549",
  },
};
