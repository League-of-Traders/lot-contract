// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract ClaimPoint  {
    address public admin;
    mapping(address => uint256) public points;
    mapping(address => uint256) public claimed; // 이미 교환한 포인트 기록

    event PointGranted(address indexed user, uint256 amount);
    event PointClaimed(address indexed user, uint256 amount);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function grantPoint(address user, uint256 amount) external onlyAdmin {
        points[user] += amount;
        emit PointGranted(user, amount);
    }

    function claimPoints() external {
        uint256 available = points[msg.sender] - claimed[msg.sender];
        require(available > 0, "No points to claim");

        claimed[msg.sender] += available;

        emit PointClaimed(msg.sender, available);
    }

    function getClaimable(address user) external view returns (uint256) {
        return points[user] - claimed[user];
    }
}