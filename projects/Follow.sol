// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract Follow is ReentrancyGuard {
    address public owner; 

    struct Followers {
        address[] followerList;
    }

    mapping(address => Followers) private followers;

    constructor() {
        owner = msg.sender;
    }
    event Followed(address indexed follower, address followee);
        
    function FollowOtherPortfolio(address follower, address followee) external payable {
        require(follower != address(0), "Error: Invalid address ");
        require(followee != address(0), "Error: Invalid address ");

        Followers storage following = followers[msg.sender];
            
        for (uint256 i = 0; i < following.followerList.length; i++) {
            if (following.followerList[i] == followee) return;
        }
        
        following.followerList.push(followee);
        uint256 ownerFee = msg.value;

        (bool successOwner, ) = payable(address(this)).call{value: ownerFee}("");
        require(successOwner, "Error: Failed to send payment to owner");

        emit Followed(follower, followee);
    }

    function UnFollowOtherPortfolio(address follower, address followee) external {
        require(follower != address(0), "Error: Invalid address ");
        require(followee != address(0), "Error: Invalid address ");

        Followers storage following = followers[msg.sender];

        for (uint256 i = 0; i < following.followerList.length; i++) {
            if (following.followerList[i] == followee) {
                following.followerList[i] = following.followerList[following.followerList.length - 1];
                following.followerList.pop();
            }
        }
    }
}