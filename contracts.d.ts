import 'web3-typed/callback/web3';
import * as Web3 from 'web3';
import {IContractInstance, ISimpleCallable, address, IContract, ITXResult} from './globals';
import {NumberLike} from 'bignumber.js';

interface Artifacts {
  require(name: './SNPCToken.sol'): IContract<ISNPCToken>;

  require(name: './Migrations.sol'): IContract<IContractInstance>;
}

declare global {
  const artifacts: Artifacts;
}

declare type TokenGroup = 'team' | 'bounty' | 'advisors' | 'reserve' | 'stackingBonus';

declare const enum TokenReservation {
  Team = 0x1,
  Bounty = 0x2,
  Advisors = 0x4,
  Reserve = 0x8,
  StackingBonus = 0x10,
}

/**
 * The Ownable contract has an owner address, and provides basic authorization control
 * functions, this simplifies the implementation of "user permissions".
 */
interface IOwnable {
  owner: ISimpleCallable<address>;

  pendingOwner: ISimpleCallable<address>;

  transferOwnership(newOwner: address, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  claimOwnership(tr?: Web3.TransactionRequest): Promise<ITXResult>;
}

/**
 * Base contract which allows children to
 * implement main operations locking mechanism.
 */
interface ILockable extends IOwnable {
  locked: ISimpleCallable<boolean>;

  lock(tr?: Web3.TransactionRequest): Promise<ITXResult>;

  unlock(tr?: Web3.TransactionRequest): Promise<ITXResult>;
}

/**
 * @dev Base selfdestruct smart contract
 */
interface ISelfDestructible extends IContractInstance, IOwnable {

  /**
   * Call selfdestruct on contract if the public key from elliptic curve signature matches contract owner
   * @param v
   * @param r
   * @param s
   */
  selfDestruct(v: NumberLike, r: NumberLike, s: NumberLike, tr?: Web3.TransactionRequest): Promise<ITXResult>;
}

/**
 * @dev Base withdrawal smart contract
 */
interface IWithdrawal extends IContractInstance, IOwnable {

  /**
   * Withdraw all funds from contract, if any. Only for owner
   */
  withdraw(tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Withdraw all tokens from contract, if any. Only for owner
   */
  withdrawTokens(token: address, tr?: Web3.TransactionRequest): Promise<ITXResult>;
}

interface IBaseFixedERC20Token extends IContractInstance, ILockable {
  // ERC20 Total supply
  totalSupply: ISimpleCallable<NumberLike>;

  /**
   * Gets the balance of the specified address.
   * @param owner The address to query the the balance of.
   * @return An uint representing the amount owned by the passed address.
   */
  balanceOf: {
    call(owner: address, tr?: Web3.TransactionRequest): Promise<NumberLike>;
  };

  /**
   * Transfer token for a specified address
   * @param to The address to transfer to.
   * @param value The amount to be transferred.
   */
  transfer(to: address, value: NumberLike, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * @dev Transfer tokens from one address to another
   * @param from address The address which you want to send tokens from
   * @param to address The address which you want to transfer to
   * @param value uint the amount of tokens to be transferred
   */
  transferFrom(from: address, to: address, value: NumberLike, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
   *
   * Beware that changing an allowance with this method brings the risk that someone may use both the old
   * and the new allowance by unfortunate transaction ordering.
   *
   * To change the approve amount you first have to reduce the addresses
   * allowance to zero by calling `approve(spender, 0)` if it is not
   * already 0 to mitigate the race condition described in:
   * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
   *
   * @param spender The address which will spend the funds.
   * @param value The amount of tokens to be spent.
   */
  approve(spender: address, value: NumberLike, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  /**
   * Function to check the amount of tokens that an owner allowed to a spender.
   * @param owner address The address which owns the funds.
   * @param spender address The address which will spend the funds.
   * @return A uint specifying the amount of tokens still available for the spender.
   */
  allowance: {
    call(owner: address, spender: address, tr?: Web3.TransactionRequest): Promise<NumberLike>;
  };
}

/**
 * ERC20 SNPC Token
 */
interface ISNPCToken extends IBaseFixedERC20Token, IWithdrawal, ISelfDestructible {
  // Token name
  name: ISimpleCallable<string>;

  // Token symbol
  symbol: ISimpleCallable<string>;

  // Token decimals
  decimals: ISimpleCallable<NumberLike>;

  // Timestamp when team reserved tokens will be unlocked
  teamReservedUnlockAt: ISimpleCallable<NumberLike>;

  // Timestamp when bounty reserved tokens will be unlocked
  bountyReservedUnlockAt: ISimpleCallable<NumberLike>;

  /**
   * Burn some tokens
   */
  burnTokens(amount: NumberLike, tr?: Web3.TransactionRequest): Promise<ITXResult>;

  getReservedTokens: {
    call(side: TokenReservation, tr?: Web3.TransactionRequest): Promise<NumberLike>;
  };

  /**
   * Assign `amount` of privately distributed tokens
   *      to someone identified with `to` address.
   * @param to   Tokens owner
   * @param side Group identifier of privately distributed tokens
   * @param amount Number of tokens distributed
   */
  assignReserved(
      to: address,
      side: TokenReservation,
      amount: NumberLike,
      tr?: Web3.TransactionRequest
  ): Promise<ITXResult>;

  /**
   * Gets the balance of team reserved tokens the specified address.
   * @param owner The address to query the the balance of.
   */
  teamReservedBalanceOf: {
    call(owner: address, tr?: Web3.TransactionRequest): Promise<NumberLike>;
  };

  /**
   * Gets the balance of bounty reserved tokens the specified address.
   * @param owner The address to query the the balance of.
   */
  bountyReservedBalanceOf: {
    call(owner: address, tr?: Web3.TransactionRequest): Promise<NumberLike>;
  };

  /**
   * Get amount of bonus allowed for transfers from `from` address
   * @param from Investor address
   */
  getAllowedForTransferTokens: {
    call(from: address, tr?: Web3.TransactionRequest): Promise<NumberLike>;
  };
}
