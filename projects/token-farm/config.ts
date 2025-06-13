export default {
  rewardTokenAddress: {
    bsc: "0xA49365E6BE33537C10655df82b921C6c88602fb1",
    bsc_testnet: "0x133E50B9efd26853727923eF23e6bd9548Cc9809",
    opbnb: "0x41b149431563bA322e167634e52a075dB42a8C5e",
  },
  stakingAddress: {
    bsc: "0x5A5a07aE8405cBE4c2C2F1Df45C6b737305FEa30",
    opbnb: "0x91736C31E022199f9445A94aaE4C524E62108C86",
  },
  transferAllowTime: () => {
    //TODO Change to TGE timestamp in seconds 1749696814
    return Math.floor(Date.now() / 1000) + 86400;
  },
  newOwner: {
    bsc: "0x4308071c90Ad495fd33d539F6826211FE531d549",
    bsc_testnet: "0x4308071c90Ad495fd33d539F6826211FE531d549",
    opbnb: "0x4308071c90Ad495fd33d539F6826211FE531d549",
  },
};

/*
MINT ACCOUNTS

Multisig: 0x063D7B495A3794e3d275c926bf027bd35512FfE5
Amount: 850000000

IDO CA: 0xC9b5707679b84Cb71a6AEE39163E859457c76Ea6
Amount: 20000000

Binance Marketing: 0xF9230cb86Fbd21a85eAac723ACBABDBC3EE34A5D
Amount: 10000000

MM: 0x56b3343cF1Ec0232C6f056BC9c1b9eC88B9b4B6D
Amount: 6000000
*/

/*
Staking Pool:
Amount:
*/
