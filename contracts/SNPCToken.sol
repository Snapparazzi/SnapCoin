pragma solidity 0.4.24;

import "./commons/SafeMath.sol";
import "./base/BaseICOToken.sol";


/**
 * @title SNPC token contract.
 */
contract SNPCToken is BaseICOToken {
    using SafeMath for uint;

    string public constant name = "SnapCoin";

    string public constant symbol = "SNPC";

    uint8 public constant decimals = 18;

    uint internal constant ONE_TOKEN = 1e18;

    uint public reservedTeamUnlockAt;

    /// @dev Fired some tokens distributed to someone from staff,business
    event ReservedTokensDistributed(address indexed to, uint8 group, uint amount);

    event TokensBurned(uint amount);

    constructor(uint totalSupplyTokens_,
            uint teamTokens_,
            uint bountyTokens_,
            uint partnersTokens_,
            uint reserveTokens_) public BaseICOToken(totalSupplyTokens_ * ONE_TOKEN) {

        require(availableSupply == totalSupply);
        availableSupply = availableSupply
            .sub(teamTokens_ * ONE_TOKEN)
            .sub(bountyTokens_ * ONE_TOKEN)
            .sub(reserveTokens_ * ONE_TOKEN)
            .sub(partnersTokens_ * ONE_TOKEN);
        reserved[RESERVED_TEAM_GROUP] = teamTokens_ * ONE_TOKEN;
        reserved[RESERVED_BOUNTY_GROUP] = bountyTokens_ * ONE_TOKEN;
        reserved[RESERVED_PARTNERS_GROUP] = partnersTokens_ * ONE_TOKEN;
        reserved[RESERVED_RESERVE_GROUP] = reserveTokens_ * ONE_TOKEN;
        reservedTeamUnlockAt = block.timestamp + 365 days;
        // 1 year
    }

    // Disable direct payments
    function() external payable {
        revert();
    }

    function burnRemain() public onlyOwner {
        require(availableSupply > 0);
        uint burned = availableSupply;
        totalSupply = totalSupply.sub(burned);
        availableSupply = 0;

        emit TokensBurned(burned);
    }

    // --------------- Reserve specific
    uint8 public constant RESERVED_TEAM_GROUP = 0x1;

    uint8 public constant RESERVED_BOUNTY_GROUP = 0x2;

    uint8 public constant RESERVED_PARTNERS_GROUP = 0x4;

    uint8 public constant RESERVED_RESERVE_GROUP = 0x8;

    /// @dev Token reservation mapping: key(RESERVED_X) => value(number of tokens)
    mapping(uint8 => uint) public reserved;

    /**
     * @dev Get reserved tokens for specific group
     */
    function getReservedTokens(uint8 group_) public view returns (uint) {
        return reserved[group_];
    }

    /**
     * @dev Assign `amount_` of privately distributed tokens
     *      to someone identified with `to_` address.
     * @param to_   Tokens owner
     * @param group_ Group identifier of privately distributed tokens
     * @param amount_ Number of tokens distributed with decimals part
     */
    function assignReserved(address to_, uint8 group_, uint amount_) public onlyOwner {
        require(to_ != address(0) && (group_ & 0xF) != 0);
        require(group_ != RESERVED_TEAM_GROUP || block.timestamp >= reservedTeamUnlockAt);

        // SafeMath will check reserved[group_] >= amount
        reserved[group_] = reserved[group_].sub(amount_);
        balances[to_] = balances[to_].add(amount_);
        emit ReservedTokensDistributed(to_, group_, amount_);
    }
}