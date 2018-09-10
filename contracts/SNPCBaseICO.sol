pragma solidity 0.4.24;

import "./commons/SafeMath.sol";
import "./base/BaseICO.sol";


/**
 * @title SNPC tokens base ICO contract.
 */
contract SNPCBaseICO is BaseICO {
    using SafeMath for uint;

    /// @dev 18 decimals for token
    uint internal constant ONE_TOKEN = 1e18;

    /// @dev investors count
    uint public investorCount;

    // @dev investments distribution
    mapping(address => uint) public investments;

    event ICOTokensTransfer(address indexed investor, uint tokens);

    constructor(address icoToken_,
        address teamWallet_,
        uint lowCapTokens_,
        uint hardCapTokens_,
        uint lowCapTxWei_,
        uint hardCapTxWei_) public BaseICO(icoToken_, teamWallet_, lowCapTokens_, hardCapTokens_, lowCapTxWei_, hardCapTxWei_) {
    }

    uint8 public constant STAGE_PRE_ICO = 0x1;

    uint8 public constant STAGE_ICO_1 = 0x2;

    uint8 public constant STAGE_ICO_2 = 0x4;

    uint8 public constant STAGE_ICO_3 = 0x8;

    /**
     * Accept direct payments
     */
    function() external payable {
        buyTokens();
    }

    /**
     * @dev Recalculate ICO state based on current block time.
     * Should be called periodically by ICO owner.
     */
    function touch() public {
        if (state != State.Active && state != State.Suspended) {
            return;
        }
        if (tokensSold >= hardCapTokens) {
            state = State.Completed;
            endAt = block.timestamp;
            emit ICOCompleted(tokensSold);
        } else if (block.timestamp >= endAt) {
            if (tokensSold < lowCapTokens) {
                state = State.NotCompleted;
                emit ICONotCompleted();
            } else {
                state = State.Completed;
                emit ICOCompleted(tokensSold);
            }
        }
    }

    function buyTokens() public onlyWhitelisted payable {
        require(state == State.Active &&
            block.timestamp <= endAt &&
            msg.value >= lowCapTxWei &&
            msg.value <= hardCapTxWei);

        uint amountWei = msg.value;
        uint itokens = amountWei.mul(getEthTokenExchangeRatio());
        require(tokensSold + itokens <= hardCapTokens);

        // Transfer tokens to investor
        token.icoInvestment(msg.sender, itokens);
        collectedWei = collectedWei.add(amountWei);
        tokensSold = tokensSold.add(itokens);

        if (investments[msg.sender] == 0) {
            // new investor
            investorCount++;

        }
        investments[msg.sender] = investments[msg.sender].add(amountWei);

        emit ICOInvestment(msg.sender, amountWei, itokens);

        forwardFunds();
        touch();
    }

    function transferTokens(address investor, uint amount) public onlyOwner {
        require(investor != address(0) &&
            state == State.Active &&
            block.timestamp <= endAt &&
            tokensSold + amount <= hardCapTokens);

        // Transfer tokens to investor
        token.icoInvestment(investor, amount);
        tokensSold = tokensSold.add(amount);

        emit ICOTokensTransfer(investor, amount);

        touch();
    }

    function getInvestments(address investor) public view returns (uint) {
        return investments[investor];
    }

    function getEthTokenExchangeRatio() public pure returns (uint);
}
