// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockDexPriceOracle {
    uint256 public priceUsd18; // Price in USD with 18 decimals
    address public tokenAddress; // Address of the token
    uint256 public bnbUsd; // BNB/USD price with 18 decimals

    constructor(uint256 _priceUsd18, address _tokenAddress, uint256 _bnbUsd) {
        priceUsd18 = _priceUsd18;
        tokenAddress = _tokenAddress;
        bnbUsd = _bnbUsd;
    }

    function getTokenPriceInUSD() external view returns (uint256) {
        return priceUsd18;
    }

    function getTokenAddress() external view returns (address) {
        return tokenAddress;
    }

    function getBnbUsd() external view returns (uint256) {
        return bnbUsd;
    }
}