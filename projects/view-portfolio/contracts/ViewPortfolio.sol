// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title PortfolioView
 * @notice Users pay to view other portfolios, with a cooldown to avoid repeated access.
 */
contract PortfolioView is Ownable2Step, ReentrancyGuard {
    using Address for address payable;

    mapping(string => mapping(address => uint256)) public views;

    uint256 public constant MAX_FEE_PERCENT = 100;
    uint256 public OWNER_FEE_PERCENT = 30;
    uint256 public minPayment = 0.000001 ether;
    uint256 public viewCooldown = 1 days;
    uint256 public lastWithdrawalTime;
    uint256 public withdrawalCooldown = 1 days;

    event PortfolioViewed(string viewer, address indexed viewee, uint256 timestamp);
    event PaymentSent(address indexed from, address indexed to, uint256 amount);
    event OwnerFeePaid(address indexed owner, uint256 amount);
    event Withdrawal(address indexed owner, uint256 amount);
    event Refund(address indexed user, uint256 amount);
    event AdminTransferred(address previousAdmin, address newAdmin);
    event OwnerFeeUpdated(uint256 newFeePercent);
    event MinPaymentUpdated(uint256 newMinPayment);
    event CooldownUpdated(uint256 newCooldown);

    modifier onlyValidPayment() {
        require(msg.value >= minPayment, "Error: Below min payment");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Zero address not allowed");
        transferOwnership(newAdmin);
        emit AdminTransferred(msg.sender, newAdmin);
    }

    function setOwnerFee(uint256 feePercent) external onlyOwner {
        require(feePercent <= MAX_FEE_PERCENT, "Fee too high");
        OWNER_FEE_PERCENT = feePercent;
        emit OwnerFeeUpdated(feePercent);
    }

    function setMinPayment(uint256 newMin) external onlyOwner {
        minPayment = newMin;
        emit MinPaymentUpdated(newMin);
    }

    function setViewCooldown(uint256 seconds_) external onlyOwner {
        viewCooldown = seconds_;
        emit CooldownUpdated(seconds_);
    }

    /**
     * @notice View restriction: checks if user has already viewed the target in the last cooldown period
     */
    function isCooldownActive(string memory viewerID, address viewee) public view returns (bool) {
        return views[viewerID][viewee] + viewCooldown > block.timestamp;
    }

    function payToView(string memory viewerID, address viewee)
        external
        payable
        onlyValidPayment
        nonReentrant
    {
        require(viewee != msg.sender, "Self view denied");
        require(viewee != address(0), "Invalid viewee");
        require(!isCooldownActive(viewerID, viewee), "Cooldown not expired");

        uint256 ownerFee = (msg.value * OWNER_FEE_PERCENT) / 100;
        uint256 vieweeAmount = msg.value - ownerFee;

        views[viewerID][viewee] = block.timestamp;

        payable(viewee).sendValue(vieweeAmount);
        payable(owner()).sendValue(ownerFee);

        emit PaymentSent(msg.sender, viewee, vieweeAmount);
        emit OwnerFeePaid(owner(), ownerFee);
        emit PortfolioViewed(viewerID, viewee, block.timestamp);
    }

    function withdrawFunds(uint256 amount)
        external
        onlyOwner
        nonReentrant
    {
        require(block.timestamp >= lastWithdrawalTime + withdrawalCooldown, "Cooldown active");
        require(address(this).balance >= amount, "Insufficient balance");

        lastWithdrawalTime = block.timestamp;
        payable(owner()).sendValue(amount);
        emit Withdrawal(owner(), amount);
    }

    receive() external payable {
        emit Refund(msg.sender, msg.value);
    }

    fallback() external payable {
        emit Refund(msg.sender, msg.value);
    }
}
