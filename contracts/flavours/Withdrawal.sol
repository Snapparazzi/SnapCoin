pragma solidity 0.4.24;

import "./Ownable.sol";
import "../interface/ERC20Token.sol";


/**
 * @title Withdrawal
 * @dev The Withdrawal contract has an owner address, and provides method for withdraw funds and tokens, if any
 */
contract Withdrawal is Ownable {

    // withdraw funds, if any, only for owner
    function withdraw() public onlyOwner {
        owner.transfer(address(this).balance);
    }

    // withdraw stuck tokens, if any, only for owner
    function withdrawTokens(address _someToken) public onlyOwner {
        ERC20Token someToken = ERC20Token(_someToken);
        uint balance = someToken.balanceOf(address(this));
        someToken.transfer(owner, balance);
    }
}
