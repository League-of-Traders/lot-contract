// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PortfolioView is Ownable, ReentrancyGuard {
    mapping(string => mapping(address => bool)) public views;

    uint256 public OWNER_FEE_PERCENT = 30;
    uint256 public minPayment = 0.00001 ether;

    event PortfolioViewed(string viewer, address indexed viewee);
    event PaymentSent(address indexed from, address indexed to, uint256 amount);
    event OwnerFeePaid(address indexed owner, uint256 amount);
    event Withdrawal(address indexed owner, uint256 amount);
    event Refund(address indexed user, uint256 amount);

    uint256 public lastWithdrawalTime;
    uint256 public withdrawalCooldown = 1 days;

    modifier onlyValidPayment() {
        require(msg.value >= minPayment, "Error: Amount below minimum payment");
        _;
    }

    constructor() Ownable(msg.sender) {
        transferOwnership(msg.sender);
    }


    function setAdmin(address _adminAddress) public onlyOwner {
        require(msg.sender == owner(), "Error: Only owner can set admin");

        transferOwnership(_adminAddress);
    }

    function setOwnerFee( uint256 FeePercent ) public onlyOwner {
        require(FeePercent < 100, "Error: Invalid fee percentage");

        OWNER_FEE_PERCENT = FeePercent;
    }

    function payToView(string memory _viewerID, address _viewee)
    external
    payable
    onlyValidPayment
    nonReentrant
    {
        require(_viewee != msg.sender, "Error: Sender cannot view their own portfolio");
        mapping(address => bool) storage viewed = views[_viewerID];
        require(!viewed[_viewee], "Error: Already viewed this viewportfolio before");

        viewed[_viewee] = true;

        uint256 ownerFee = (msg.value * OWNER_FEE_PERCENT) / 100;
        uint256 vieweeAmount = msg.value - ownerFee;

        (bool successViewee, ) = payable(_viewee).call{value: vieweeAmount}("");
        require(successViewee, "Error: Failed to send payment to viewee");

        (bool successOwner, ) = payable(this).call{value: ownerFee}("");
        require(successOwner, "Error: Failed to send payment to owner");

        emit PaymentSent(msg.sender, _viewee, vieweeAmount);
        emit OwnerFeePaid(owner(), ownerFee);
        emit PortfolioViewed(_viewerID, _viewee);
    }

    function withdrawFunds(uint256 _amount) external onlyOwner nonReentrant {
        require(block.timestamp >= lastWithdrawalTime + withdrawalCooldown, "Error: Withdrawal cooldown in effect");
        require(address(this).balance >= _amount, "Error: Insufficient contract balance");

        lastWithdrawalTime = block.timestamp;

        (bool success, ) = payable(owner()).call{value: _amount}("");
        require(success, "Error: Withdrawal failed");

        emit Withdrawal(owner(), _amount);
    }

    fallback() external payable {
        emit Refund(msg.sender, msg.value);
    }

    receive() external payable {
        emit Refund(msg.sender, msg.value);
    }
}
