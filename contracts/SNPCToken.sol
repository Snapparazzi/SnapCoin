pragma solidity 0.4.24;

import "./commons/SafeMath.sol";
import "./base/BaseFixedERC20Token.sol";
import "./flavours/SelfDestructible.sol";
import "./flavours/Withdrawal.sol";


/**
 * @title SNPC token contract.
 */
contract SNPCToken is BaseFixedERC20Token, SelfDestructible, Withdrawal {
    using SafeMath for uint;

    string public constant name = "SnapCoin";

    string public constant symbol = "SNPC";

    uint8 public constant decimals = 18;

    uint internal constant ONE_TOKEN = 1e18;

    /// @dev team reserved balances
    mapping(address => uint) public teamReservedBalances;

    uint public teamReservedUnlockAt;

    /// @dev bounty reserved balances
    mapping(address => uint) public bountyReservedBalances;

    uint public bountyReservedUnlockAt;

    /// @dev Fired some tokens distributed to someone from staff,business
    event ReservedTokensDistributed(address indexed to, uint8 group, uint amount);

    event TokensBurned(uint amount);

    constructor(uint totalSupplyTokens_,
            uint teamTokens_,
            uint bountyTokens_,
            uint advisorsTokens_,
            uint reserveTokens_,
            uint stackingBonusTokens_) public {
        locked = true;
        totalSupply = totalSupplyTokens_.mul(ONE_TOKEN);
        uint availableSupply = totalSupply;

        reserved[RESERVED_TEAM_GROUP] = teamTokens_.mul(ONE_TOKEN);
        reserved[RESERVED_BOUNTY_GROUP] = bountyTokens_.mul(ONE_TOKEN);
        reserved[RESERVED_ADVISORS_GROUP] = advisorsTokens_.mul(ONE_TOKEN);
        reserved[RESERVED_RESERVE_GROUP] = reserveTokens_.mul(ONE_TOKEN);
        reserved[RESERVED_STACKING_BONUS_GROUP] = stackingBonusTokens_.mul(ONE_TOKEN);
        availableSupply = availableSupply
            .sub(reserved[RESERVED_TEAM_GROUP])
            .sub(reserved[RESERVED_BOUNTY_GROUP])
            .sub(reserved[RESERVED_ADVISORS_GROUP])
            .sub(reserved[RESERVED_RESERVE_GROUP])
            .sub(reserved[RESERVED_STACKING_BONUS_GROUP]);
        teamReservedUnlockAt = block.timestamp + 365 days; // 1 year
        bountyReservedUnlockAt = block.timestamp + 91 days; // 3 month

        balances[owner] = availableSupply;
        emit Transfer(0, address(this), availableSupply);
        emit Transfer(address(this), owner, balances[owner]);
    }

    // Disable direct payments
    function() external payable {
        revert();
    }

    function burnTokens(uint amount) public {
        require(balances[msg.sender] >= amount);
        totalSupply = totalSupply.sub(amount);
        balances[msg.sender] = balances[msg.sender].sub(amount);

        emit TokensBurned(amount);
    }

    // --------------- Reserve specific
    uint8 public constant RESERVED_TEAM_GROUP = 0x1;

    uint8 public constant RESERVED_BOUNTY_GROUP = 0x2;

    uint8 public constant RESERVED_ADVISORS_GROUP = 0x4;

    uint8 public constant RESERVED_RESERVE_GROUP = 0x8;

    uint8 public constant RESERVED_STACKING_BONUS_GROUP = 0x10;

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
        require(to_ != address(0) && (group_ & 0x1F) != 0);

        // SafeMath will check reserved[group_] >= amount
        reserved[group_] = reserved[group_].sub(amount_);
        balances[to_] = balances[to_].add(amount_);
        if (group_ == RESERVED_TEAM_GROUP) {
            teamReservedBalances[to_] = teamReservedBalances[to_].add(amount_);
        } else if (group_ == RESERVED_BOUNTY_GROUP) {
            bountyReservedBalances[to_] = bountyReservedBalances[to_].add(amount_);
        }
        emit ReservedTokensDistributed(to_, group_, amount_);
    }

    /**
     * @dev Gets the balance of team reserved tokens the specified address.
     * @param owner_ The address to query the the balance of.
     * @return An uint representing the amount owned by the passed address.
     */
    function teamReservedBalanceOf(address owner_) public view returns (uint) {
        return teamReservedBalances[owner_];
    }

    /**
     * @dev Gets the balance of bounty reserved tokens the specified address.
     * @param owner_ The address to query the the balance of.
     * @return An uint representing the amount owned by the passed address.
     */
    function bountyReservedBalanceOf(address owner_) public view returns (uint) {
        return bountyReservedBalances[owner_];
    }

    function getAllowedForTransferTokens(address from_) public view returns (uint) {
        uint allowed = balances[from_];

        if (teamReservedBalances[from_] > 0) {
            if (block.timestamp < teamReservedUnlockAt) {
                allowed = allowed.sub(teamReservedBalances[from_]);
            }
        }

        if (bountyReservedBalances[from_] > 0) {
            if (block.timestamp < bountyReservedUnlockAt) {
                allowed = allowed.sub(bountyReservedBalances[from_]);
            }
        }

        return allowed;
    }

    function transfer(address to_, uint value_) public whenNotLocked returns (bool) {
        require(value_ <= getAllowedForTransferTokens(msg.sender));
        return super.transfer(to_, value_);
    }

    function transferFrom(address from_, address to_, uint value_) public whenNotLocked returns (bool) {
        require(value_ <= getAllowedForTransferTokens(from_));
        return super.transferFrom(from_, to_, value_);
    }

}