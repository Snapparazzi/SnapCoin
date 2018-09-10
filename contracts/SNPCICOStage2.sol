pragma solidity 0.4.24;

import "./SNPCBaseICO.sol";


/**
 * @title SNPC tokens ICO Stage 2 contract.
 */
contract SNPCICOStage2 is SNPCBaseICO {

    /// @dev 1e18 WEI == 1ETH == 1345 tokens
    uint public constant ETH_TOKEN_EXCHANGE_RATIO = 1345;

    /// @dev ICO stage
    uint8 public constant ICO_STAGE = STAGE_ICO_2;

    constructor(address icoToken_,
        address teamWallet_,
        uint lowCapTokens_,
        uint hardCapTokens_,
        uint lowCapTxWei_,
        uint hardCapTxWei_) public SNPCBaseICO(icoToken_, teamWallet_, lowCapTokens_, hardCapTokens_, lowCapTxWei_, hardCapTxWei_) {
    }

    function getEthTokenExchangeRatio() public pure returns (uint) {
        return ETH_TOKEN_EXCHANGE_RATIO;
    }

    function getICOStage() internal pure returns (uint8) {
        return ICO_STAGE;
    }
}
