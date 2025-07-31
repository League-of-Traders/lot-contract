// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IDexPriceOracle {
    /**
     * @notice Get the price of the token in USD with 18 decimals.
     * @return priceUsd18 The price of the token in USD with 18 decimals.
     */
    function getTokenPriceInUSD() external view returns (uint256);
    
    /**
     * @notice Get the address of the token for which the price is being queried.
     * @return tokenAddress The address of the token.
     */
    function getTokenAddress() external view returns (address);

    /**
     * @notice Get the address of the BNB/USD price.
     * @return bnbUsd The address of the BNB/USD price.
     */
    function getBnbUsd() external view returns (uint256);
}