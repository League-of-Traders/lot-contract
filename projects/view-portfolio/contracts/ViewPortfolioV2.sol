// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "bsc-library/contracts/IBEP20.sol";
import "../interface/IDexPriceOracle.sol";

contract PortfolioViewV2 is Ownable2Step, ReentrancyGuard {
    using Address for address payable;

    IBEP20 public paymentToken;
    IDexPriceOracle public dexPriceOracle;

    // Access mapping
    mapping(address => mapping(address => bool)) public hasLifetimeAccess;
    mapping(address => mapping(address => uint256)) public hasOneTimeAccess;

    // Prices
    uint256 public priceOneTimeBNB; // e.g., 100000000 (== $1.00)
    uint256 public priceLifetimeBNB; // e.g., 300000000 (== $3.00)
    uint256 public priceOneTimeToken;
    uint256 public priceLifetimeToken;

    uint256 public constant MAX_FEE_PERCENT = 100;
    uint256 public OWNER_FEE_PERCENT = 30;

    event AccessPurchased(address indexed user, address indexed leader, string parentID, bool isLifetime, uint256 blockNumber);
    event OwnerFeePaid(address indexed owner, uint256 amount);
    event TokenAddressSet(address indexed token);
    event DexPriceOracleSet(address indexed oracle);
    event PricesUpdated(uint256 oneTimeBNB, uint256 lifetimeBNB, uint256 oneTimeToken, uint256 lifetimeToken);
    event OwnerFeeUpdated(uint256 newFeePercent);

    constructor(address _token, address _dexPriceOracle) Ownable(msg.sender) {
        require(_token != address(0), "Invalid token");
        
        paymentToken = IBEP20(_token);
        dexPriceOracle = IDexPriceOracle(_dexPriceOracle);

        require(dexPriceOracle.getTokenAddress() == _token, "Oracle token mismatch");

        emit TokenAddressSet(_token);
        emit DexPriceOracleSet(_dexPriceOracle);
    }

    function setPrices(
        uint256 _oneTimeBNB,
        uint256 _lifetimeBNB,
        uint256 _oneTimeToken,
        uint256 _lifetimeToken
    ) external onlyOwner {
        priceOneTimeBNB = _oneTimeBNB;
        priceLifetimeBNB = _lifetimeBNB;
        priceOneTimeToken = _oneTimeToken;
        priceLifetimeToken = _lifetimeToken;
        emit PricesUpdated(_oneTimeBNB, _lifetimeBNB, _oneTimeToken, _lifetimeToken);
    }

    function setOwnerFee(uint256 feePercent) external onlyOwner {
        require(feePercent <= MAX_FEE_PERCENT, "Fee too high");
        OWNER_FEE_PERCENT = feePercent;
        emit OwnerFeeUpdated(feePercent);
    }

    function payWithBNB(address leader, string memory parentID, bool isLifetime) external payable nonReentrant {
        uint256 priceUsd = isLifetime ? priceLifetimeBNB : priceOneTimeBNB;
        require(priceUsd > 0, "Price must be greater than zero");

        uint256 bnbUsd8 = dexPriceOracle.getBnbUsd(); // e.g., 350_00000000 == $350
        uint256 paymentUsd = (msg.value * bnbUsd8) / 1e18; // Normalize: BNB(1e18) * USD(1e8) / 1e18 = 1e8

        require(paymentUsd >= priceUsd, "BNB value below required USD price");

        uint256 ownerFee = (msg.value * OWNER_FEE_PERCENT) / 100;
        uint256 netAmount = msg.value - ownerFee;

        if (isLifetime) {
            hasLifetimeAccess[msg.sender][leader] = true;
        } else {
            hasOneTimeAccess[msg.sender][leader] = block.timestamp + 3 minutes; 
        }

        payable(owner()).sendValue(ownerFee);
        payable(leader).sendValue(netAmount);

        emit OwnerFeePaid(owner(), ownerFee);
        emit AccessPurchased(msg.sender, leader, parentID, isLifetime, block.number);
    }

    function payWithToken(address leader,  string memory parentID, bool isLifetime) external nonReentrant {
        uint256 priceUsd = isLifetime ? priceLifetimeToken : priceOneTimeToken; // 8 decimals
        require(priceUsd > 0, "Price must be greater than zero");

        uint256 tokenPriceUsd18 = dexPriceOracle.getTokenPriceInUSD();          // 18 decimals
        uint256 requiredTokenAmount = (priceUsd * 1e28) / tokenPriceUsd18;      // 18 decimals

        require(paymentToken.allowance(msg.sender, address(this)) >= requiredTokenAmount, "Token allowance too low");

        uint256 ownerFee = (requiredTokenAmount * OWNER_FEE_PERCENT) / 100;
        uint256 netAmount = requiredTokenAmount - ownerFee;

        paymentToken.transferFrom(msg.sender, owner(), ownerFee);
        paymentToken.transferFrom(msg.sender, leader, netAmount);

        if (isLifetime) {
            hasLifetimeAccess[msg.sender][leader] = true;
        } else {
            hasOneTimeAccess[msg.sender][leader] = block.timestamp + 3 minutes; 
        }

        emit OwnerFeePaid(owner(), ownerFee);
        emit AccessPurchased(msg.sender, leader, parentID, isLifetime, block.number);
    }


    function canAccess(address user) external view returns (bool) {
        return hasLifetimeAccess[msg.sender][user] || hasOneTimeAccess[msg.sender][user] > block.timestamp;
    }

    function getTokenPriceInUSD() external view returns (uint256) {
        return dexPriceOracle.getTokenPriceInUSD();
    }

    function getBnbUsd() external view returns (uint256) {
        return dexPriceOracle.getBnbUsd();
    }

    function currentPaymentTokenAmount(bool isLifetime) external view returns (uint256) {
        uint256 priceUsd = isLifetime ? priceLifetimeToken : priceOneTimeToken; // 8 decimals

        uint256 tokenPriceUsd18 = dexPriceOracle.getTokenPriceInUSD(); // 18 decimals
        return (priceUsd * 1e28) / tokenPriceUsd18; // 18 decimals
    }

    function emergencyWithdrawToken(address _token) external onlyOwner {
        uint256 bal = IBEP20(_token).balanceOf(address(this));
        IBEP20(_token).transfer(owner(), bal);
    }

    function emergencyWithdrawBNB() external onlyOwner {
        payable(owner()).sendValue(address(this).balance);
    }
}
