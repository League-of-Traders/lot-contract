import { ethers } from "hardhat";
import { expect } from "chai";
import { parseUnits } from "ethers";

describe("PortfolioViewV2 - payWithToken()", () => {
  let owner: any, user: any, leader: any;
  let lotToken: any, oracle: any, viewContract: any;

  beforeEach(async () => {
    [owner, user, leader] = await ethers.getSigners();

    // 1. Mock LOT Token (18 decimals)
    const LOT = await ethers.getContractFactory("MockERC20");
    lotToken = await LOT.deploy("LOT", "LOT", 18);
    await lotToken.deployed();

    // 2. Mock Oracle
    const Oracle = await ethers.getContractFactory("MockDexPriceOracle");
    oracle = await Oracle.deploy(parseUnits("0.03", 18), lotToken.address, parseUnits("670", 8)); // 0.03 USD
    await oracle.deployed();

    // 3. Deploy PortfolioViewV2
    const View = await ethers.getContractFactory("PortfolioViewV2");
    viewContract = await View.deploy(lotToken.address, oracle.address);
    await viewContract.deployed();

    // 4. Set priceOneTimeToken to $1.50
    await viewContract.setPrices(
      0,
      0, // BNB
      150_000000, // one-time token price in USD (8 decimals)
      0, // lifetime token
    );

    // 5. Mint LOT tokens to user
    await lotToken.mint(user.address, parseUnits("100", 18));

    // 6. Approve
    await lotToken.connect(user).approve(viewContract.address, parseUnits("100", 18));
  });

  it("should calculate correct LOT amount and transfer tokens", async () => {
    const tokenPrice = await oracle.getTokenPriceInUSD(); // 0.03 USD (18 decimals)
    const requiredTokenAmount = ethers.BigNumber.from("150000000") // $1.50
      .mul(ethers.constants.WeiPerEther)
      .div(tokenPrice); // (priceUsd * 1e18) / tokenPrice

    const fee = requiredTokenAmount.mul(30).div(100);
    const net = requiredTokenAmount.sub(fee);

    const ownerBalanceBefore = await lotToken.balanceOf(owner.address);
    const leaderBalanceBefore = await lotToken.balanceOf(leader.address);

    await expect(viewContract.connect(user).payWithToken(leader.address, false, "6005541a6e3d99a5ae10fcd4"))
      .to.emit(viewContract, "AccessPurchased")
      .withArgs(user.address, leader.address, "6005541a6e3d99a5ae10fcd4", false, true);

    const hasAccess = await viewContract.hasOneTimeAccess(user.address, leader.address);
    expect(hasAccess).to.be.gt(0);

    expect(await lotToken.balanceOf(owner.address)).to.equal(ownerBalanceBefore.add(fee));
    expect(await lotToken.balanceOf(leader.address)).to.equal(leaderBalanceBefore.add(net));
  });
});
