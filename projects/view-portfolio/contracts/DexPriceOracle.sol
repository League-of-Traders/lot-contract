// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IPancakeV3Pool {
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint32  feeProtocol,
        bool unlocked
    );
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IAggregator {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
    function decimals() external view returns (uint8);
}

contract DexPriceOracle {
    IPancakeV3Pool public immutable pool;
    IAggregator public immutable bnbUsdOracle;
    bool public token0IsBase; // true if token0 is the target token

    constructor(
        address _pool,
        address _bnbUsdOracle,
        bool _token0IsBase
    ) {
        pool = IPancakeV3Pool(_pool);
        bnbUsdOracle = IAggregator(_bnbUsdOracle);
        token0IsBase = _token0IsBase;
    }

    /// @notice Get token price in USD with 18 decimals
    function getTokenPriceInUSD() external view returns (uint256 priceUsd18) {
        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        require(sqrtPriceX96 > 0, "Invalid sqrtPriceX96");

        // Get price (token1 per token0) in Q64.96 format: price = sqrt^2 / 2^192
        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        uint256 price18 = priceX192 >> 192; // same as priceX192 / 2**192

        require(price18 > 0, "Derived price is zero");

        // If token0 is the token we care about (e.g., LOT), we need to invert the price to get token0 per BNB
        if (!token0IsBase) {
            price18 = (1e36) / price18; // 1e36 = 1e18 * 1e18, to preserve precision
        }

        // Get BNB/USD price from oracle
        (, int256 bnbUsd8,, uint256 updatedAt,) = bnbUsdOracle.latestRoundData();
        require(bnbUsd8 > 0, "Invalid BNB price");
        require(updatedAt + 1 hours >= block.timestamp, "Stale oracle");

        uint8 decimals = bnbUsdOracle.decimals();

        // Final USD price = (token in BNB) * (BNB in USD) * bnb decimals
        uint256 priceUsd36 = price18 * uint256(bnbUsd8) / 10 ** uint256(decimals);

         if (!token0IsBase) {
            priceUsd18 = priceUsd36 / 1e18; // 1e36 = 1e18 * 1e18, to preserve precision
        }
    }

    function tokenInBNBPrice() external view returns (uint256 price) {
        (uint160 sqrtPriceX96,,,,,,) = pool.slot0();
        require(sqrtPriceX96 > 0, "Invalid sqrtPriceX96");

        // Get price (token1 per token0) in Q64.96 format: price = sqrt^2 / 2^192
        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        price = priceX192 >> 192; // same as priceX192 / 2**192

        require(price > 0, "Derived price is zero");

        // If token0 is the token we care about (e.g., LOT), we need to invert the price to get token0 per BNB
        if (!token0IsBase) {
            price = (1e36) / price; // 1e36 = 1e18 * 1e18, to preserve precision
        }
        price = price / 1e18;
    }

    function getBnbUsd() external view returns (uint256) {
        (, int256 bnbUsd8,, uint256 updatedAt,) = bnbUsdOracle.latestRoundData();
        require(bnbUsd8 > 0, "Invalid BNB price");
        require(updatedAt + 1 hours >= block.timestamp, "Stale oracle");

        return uint256(bnbUsd8);
    }

    function getTokens() external view returns (address, address) {
        return (pool.token0(), pool.token1());
    }

    function getTokenAddress() external view returns (address) {
        return token0IsBase ? pool.token0() : pool.token1();
    }
}