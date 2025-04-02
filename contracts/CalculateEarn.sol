// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract CalculateEarn is ReentrancyGuard {
    address public owner;
    uint256 public minPayment = 0.00001 ether; 
    mapping(address => DailyStat) public earns;

    struct DailyStat {
        uint256 balance;
        uint256 earn;
        uint256 today;
        bool isNegative;
    }

    modifier onlyValidPayment() {
        require(msg.value >= minPayment, "Error: Amount below minimum payment");
        _;
    }

    event DailyCalculate(address indexed _user, uint256 lastBalance, uint256 initBalance, uint256 withdraw,  uint256 deposit);
    event Refund(address indexed _user, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    function Calculate(
        address _user, 
        uint256 lastBalance, 
        uint256 initBalance, 
        uint256 withdraw,  
        uint256 deposit
    ) external payable {
        require(_user != address(0), "Error: Invalid user");
        require(initBalance != 0, "Error: Invalid last balance");
        require(msg.value >= minPayment, "Error: Amount below minimum payment");

        uint256 initAndDepositBalance = initBalance + deposit;
        uint256 lastAndWithdraw = lastBalance + withdraw;
        uint256 earn;
        bool isNegative;
        
        if (initAndDepositBalance > lastAndWithdraw) {
            earn = initAndDepositBalance - lastAndWithdraw;
            isNegative = true;  
        } else {
            earn = lastAndWithdraw - initAndDepositBalance;
            isNegative = false; 
        }

        earns[_user].balance = lastBalance;
        earns[_user].today = block.timestamp; 
        earns[_user].earn = earn;
        earns[_user].isNegative = isNegative;

        (bool successOwner, ) = payable(owner).call{value: msg.value}("");
        require(successOwner, "Error: Failed to send payment to owner");

        emit DailyCalculate(_user, lastBalance, initBalance, withdraw, deposit);
    }

    fallback() external payable {
        emit Refund(msg.sender, msg.value);
    }

    receive() external payable {
        emit Refund(msg.sender, msg.value);
    }
}
