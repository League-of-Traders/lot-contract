const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PortfolioView", function () {
    let PortfolioView, contract;
    let owner, viewer, viewee, other;
    const minPayment = ethers.utils.parseEther("0.000001");
    const viewCooldown = 24 * 60 * 60; // 1 day

    beforeEach(async function () {
        [owner, viewer, viewee, other] = await ethers.getSigners();

        const Contract = await ethers.getContractFactory("PortfolioView");
        contract = await Contract.connect(owner).deploy();
        await contract.deployed();
    });

    it("should allow first time payment and mark view", async function () {
        const tx = await contract.connect(viewer).payToView("user1", viewee.address, { value: minPayment });
        await expect(tx).to.emit(contract, "PaymentSent");
        await expect(tx).to.emit(contract, "PortfolioViewed");

        const timestamp = await contract.views("user1", viewee.address);
        expect(timestamp).to.be.gt(0);
    });

    it("should reject repeated payment within 24 hours", async function () {
        await contract.connect(viewer).payToView("user1", viewee.address, { value: minPayment });

        // try again within 24 hours with payment
        await expect(
            contract.connect(viewer).payToView("user1", viewee.address, { value: minPayment })
        ).to.be.revertedWith("Error: Already paid today. No need to pay again.");
    });

    it("should allow free access within 24 hours", async function () {
        await contract.connect(viewer).payToView("user1", viewee.address, { value: minPayment });

        const tx = await contract.connect(viewer).payToView("user1", viewee.address, { value: 0 });
        await expect(tx).to.emit(contract, "PortfolioViewed");
    });

    it("should allow payment again after 24 hours", async function () {
        await contract.connect(viewer).payToView("user1", viewee.address, { value: minPayment });

        // increase time by 1 day
        await ethers.provider.send("evm_increaseTime", [viewCooldown + 1]);
        await ethers.provider.send("evm_mine");

        const tx = await contract.connect(viewer).payToView("user1", viewee.address, { value: minPayment });
        await expect(tx).to.emit(contract, "PaymentSent");
        await expect(tx).to.emit(contract, "PortfolioViewed");
    });

    it("should prevent self-viewing", async function () {
        await expect(
            contract.connect(viewee).payToView("user1", viewee.address, { value: minPayment })
        ).to.be.revertedWith("Error: Sender cannot view their own portfolio");
    });

    it("should reject payment below minimum", async function () {
        await expect(
            contract.connect(viewer).payToView("user1", viewee.address, { value: ethers.utils.parseEther("0.0000001") })
        ).to.be.revertedWith("Error: Amount below minimum payment");
    });
});
