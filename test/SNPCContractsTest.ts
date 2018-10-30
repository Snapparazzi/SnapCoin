import {ItTestFn} from '../globals';
import * as BigNumber from 'bignumber.js';
import {TokenReservation} from '../contracts';
import {assertEvmThrows, assertEvmIsNotAContractAddress} from './lib/assert';
import {Seconds, web3IncreaseTimeTo} from './lib/time';

const EthUtil = require('ethereumjs-util');

const it = (<any>global).it as ItTestFn;
const assert = (<any>global).assert as Chai.AssertStatic;

const SNPCToken = artifacts.require('./SNPCToken.sol');

const ONE_TOKEN = new BigNumber('1e18');

// this value only for currently specified in run-tests-mnemonic.txt seeds!
const OWNER_PKEY: string = "a9ddbaf8102aa511163e4a3c1e9c148cf8bcd797f51c18668f40e73c50df262a";

function tokens(val: BigNumber.NumberLike): string {
  return new BigNumber(val).times(ONE_TOKEN).toString();
}

function signSelfdestruct(privateKey: string, contractAddress: string, address: string): any {
  const buffer = Buffer.concat([
                                 Buffer.from('Signed for Selfdestruct'),
                                 Buffer.from(contractAddress.replace(/^0x/, ''), 'hex'),
                                 Buffer.from(address.replace(/^0x/, ''), 'hex'),
                               ]);
  const hash = EthUtil.hashPersonalMessage(EthUtil.keccak(buffer));
  const signature = EthUtil.ecsign(hash, Buffer.from(privateKey, 'hex'));
  if (!!signature) {
    return {
      v: signature.v,
      r: '0x' + signature.r.toString('hex'),
      s: '0x' + signature.s.toString('hex')
    };
  } else {
    console.error('\x1b[41m%s\x1b[37m', 'Could not sign message for address:', '\x1b[0m', contractAddress);
  }
  return null;
}

contract('SNPCContracts', function (accounts: string[]) {
  let cnt = 0;
  const actors = {
    owner: accounts[cnt++], // token owner
    someone1: accounts[cnt++],
    someone2: accounts[cnt++],
    team1: accounts[cnt++],
    investor1: accounts[cnt++],
    investor2: accounts[cnt++],
    reserve1: accounts[cnt++],
    reserve2: accounts[cnt++]
  } as { [k: string]: string };
  console.log('Actors: ', actors);
  assert.equal('0x' + EthUtil.pubToAddress(EthUtil.privateToPublic(Buffer.from(OWNER_PKEY, 'hex'))).toString('hex'),
               actors.owner, "Please set correct OWNER_PKEY");

  it('should be correct initial token state', async () => {
    const token = await SNPCToken.deployed();
    // Total supply
    assert.equal(await token.totalSupply.call(), tokens(735e6));
    // Team
    assert.equal(await token.getReservedTokens.call(TokenReservation.Team), tokens(44.1e6));
    // Bounty
    assert.equal(await token.getReservedTokens.call(TokenReservation.Bounty), tokens(36.75e6));
    // Advisors
    assert.equal(await token.getReservedTokens.call(TokenReservation.Advisors), tokens(22.05e6));
    // Reserve
    assert.equal(await token.getReservedTokens.call(TokenReservation.Reserve), tokens(73.5e6));
    // Reserve
    assert.equal(await token.getReservedTokens.call(TokenReservation.StackingBonus), tokens(44.1e6));
    // Owner balance
    assert.equal(await token.balanceOf.call(actors.owner), tokens(514.5e6));
    // Token locked
    assert.equal(await token.locked.call(), true);
    // Token owner
    assert.equal(await token.owner.call(), actors.owner);
    // Token name
    assert.equal(await token.name.call(), 'SnapCoin');
    // Token symbol
    assert.equal(await token.symbol.call(), 'SNPC');
    // Token decimals
    assert.equal(await token.decimals.call(), 18);
  });

  it('should be ownable token', async () => {
    const token = await SNPCToken.deployed();
    // Token owner
    assert.equal(await token.owner.call(), actors.owner);
    // transferOwnership allowed only for owner
    await assertEvmThrows(token.transferOwnership(actors.someone2, {from: actors.someone1}));
    await token.transferOwnership(actors.someone1, {from: actors.owner});
    assert.equal(await token.pendingOwner.call(), actors.someone1);
    // claimOwnership allowed only for pending owner
    await assertEvmThrows(token.claimOwnership({from: actors.someone2}));
    let txres = await token.claimOwnership({from: actors.someone1});
    assert.equal(txres.logs[0].event, 'OwnershipTransferred');
    assert.equal(txres.logs[0].args.previousOwner, actors.owner);
    assert.equal(txres.logs[0].args.newOwner, actors.someone1);

    // Change token owner
    assert.equal(await token.pendingOwner.call(), '0x0000000000000000000000000000000000000000');
    assert.equal(await token.owner.call(), actors.someone1);
    await assertEvmThrows(token.unlock({from: actors.owner}));

    // Check access
    await assertEvmThrows(token.transferOwnership(actors.someone2, {from: actors.owner}));

    // Return ownership
    await token.transferOwnership(actors.owner, {from: actors.someone1});
    assert.equal(await token.pendingOwner.call(), actors.owner);
    txres = await token.claimOwnership({from: actors.owner});
    assert.equal(txres.logs[0].event, 'OwnershipTransferred');
    assert.equal(txres.logs[0].args.previousOwner, actors.someone1);
    assert.equal(txres.logs[0].args.newOwner, actors.owner);
    assert.equal(await token.pendingOwner.call(), '0x0000000000000000000000000000000000000000');
  });

  it('should be not be payable token', async () => {
    const token = await SNPCToken.deployed();
    await assertEvmThrows(token.sendTransaction({value: tokens(1), from: actors.owner}));
    await assertEvmThrows(token.sendTransaction({value: tokens(1), from: actors.someone1}));
  });

  it('should allow private token distribution', async () => {
    const token = await SNPCToken.deployed();
    assert.equal(await token.getReservedTokens.call(TokenReservation.Team), tokens(44.1e6));
    assert.equal(await token.getReservedTokens.call(TokenReservation.Bounty), tokens(36.75e6));
    assert.equal(await token.getReservedTokens.call(TokenReservation.Advisors), tokens(22.05e6));
    assert.equal(await token.getReservedTokens.call(TokenReservation.Reserve), tokens(73.5e6));
    assert.equal(await token.getReservedTokens.call(TokenReservation.StackingBonus), tokens(44.1e6));

    // Reserve tokens from bounty group
    let txres = await token.assignReserved(actors.someone1, TokenReservation.Bounty, tokens(10e6), {
      from: actors.owner
    });
    assert.equal(txres.logs[0].event, 'ReservedTokensDistributed');
    assert.equal(txres.logs[0].args.to, actors.someone1);
    assert.equal(txres.logs[0].args.amount.toString(), tokens(10e6));

    assert.equal(await token.balanceOf.call(actors.someone1), tokens(10e6));

    // check reserved tokens
    assert.equal(await token.getReservedTokens.call(TokenReservation.Bounty), tokens(26.75e6)); // 36.75e6 - 10e6
    // Do not allow reserve more than allowed tokens
    await assertEvmThrows(
        token.assignReserved(actors.reserve1, TokenReservation.Bounty, tokens(26.75e6 + 1), {from: actors.owner})
    );
    // Do not allow token reservation from others
    await assertEvmThrows(
        token.assignReserved(actors.team1, TokenReservation.Bounty, tokens(1e6), {from: actors.someone1})
    );

    // Reserve tokens for team member
    txres = await token.assignReserved(actors.team1, TokenReservation.Team, tokens(5e6), {from: actors.owner});
    assert.equal(txres.logs[0].event, 'ReservedTokensDistributed');
    assert.equal(txres.logs[0].args.to, actors.team1);
    assert.equal(txres.logs[0].args.amount, tokens(5e6));

    assert.equal(await token.balanceOf.call(actors.team1), tokens(5e6));
    // check reserved tokens for team
    assert.equal(await token.getReservedTokens.call(TokenReservation.Team), tokens(39.1e6)); // 44.1e6 - 5e6

    // Do not allow reserve more than allowed tokens
    await assertEvmThrows(
        token.assignReserved(actors.reserve1, TokenReservation.Team, tokens(39.1e6 + 1), {from: actors.owner})
    );
    // Do not allow token reservation from others
    await assertEvmThrows(
        token.assignReserved(actors.team1, TokenReservation.Team, tokens(1e6), {from: actors.someone1})
    );

    // Reserve tokens from advisors group
    txres = await token.assignReserved(actors.someone2, TokenReservation.Advisors, tokens(2e6), {
      from: actors.owner
    });
    assert.equal(txres.logs[0].event, 'ReservedTokensDistributed');
    assert.equal(txres.logs[0].args.to, actors.someone2);
    assert.equal(txres.logs[0].args.amount.toString(), tokens(2e6));

    assert.equal(await token.balanceOf.call(actors.someone2), tokens(2e6));

    // check reserved tokens
    assert.equal(await token.getReservedTokens.call(TokenReservation.Advisors), tokens(20.05e6)); // 22.05e6 - 2e6
    // Do not allow reserve more than allowed tokens
    await assertEvmThrows(
        token.assignReserved(actors.reserve1, TokenReservation.Advisors, tokens(20.05e6 + 1), {from: actors.owner})
    );
    // Do not allow token reservation from others
    await assertEvmThrows(
        token.assignReserved(actors.team1, TokenReservation.Advisors, tokens(1e6), {from: actors.someone1})
    );

    // Reserve tokens from reserve group
    txres = await token.assignReserved(actors.reserve1, TokenReservation.Reserve, tokens(10e6), {
      from: actors.owner
    });
    assert.equal(txres.logs[0].event, 'ReservedTokensDistributed');
    assert.equal(txres.logs[0].args.to, actors.reserve1);
    assert.equal(txres.logs[0].args.amount.toString(), tokens(10e6));

    assert.equal(await token.balanceOf.call(actors.reserve1), tokens(10e6));

    // check reserved tokens
    assert.equal(await token.getReservedTokens.call(TokenReservation.Reserve), tokens(63.5e6)); // 73.5e6 - 10e6
    // Do not allow reserve more than allowed tokens
    await assertEvmThrows(
        token.assignReserved(actors.reserve1, TokenReservation.Reserve, tokens(63.5e6 + 1), {from: actors.owner})
    );

    // Do not allow token reservation from others
    await assertEvmThrows(
        token.assignReserved(actors.team1, TokenReservation.Reserve, tokens(1e6), {from: actors.someone1})
    );

    // Reserve tokens from stacking bonus group
    txres = await token.assignReserved(actors.reserve2, TokenReservation.StackingBonus, tokens(10e6), {
      from: actors.owner
    });
    assert.equal(txres.logs[0].event, 'ReservedTokensDistributed');
    assert.equal(txres.logs[0].args.to, actors.reserve2);
    assert.equal(txres.logs[0].args.amount.toString(), tokens(10e6));

    assert.equal(await token.balanceOf.call(actors.reserve2), tokens(10e6));

    // check reserved tokens
    assert.equal(await token.getReservedTokens.call(TokenReservation.StackingBonus), tokens(34.1e6)); // 44.1e6 - 10e6
    // Do not allow reserve more than allowed tokens
    await assertEvmThrows(
        token.assignReserved(actors.reserve1, TokenReservation.StackingBonus, tokens(34.1e6 + 1), {from: actors.owner})
    );

    // Do not allow token reservation from others
    await assertEvmThrows(
        token.assignReserved(actors.team1, TokenReservation.StackingBonus, tokens(1e6), {from: actors.someone1})
    );
  });

  it('token burning', async () => {
    const token = await SNPCToken.deployed();

    const ownerBalance = new BigNumber(await token.balanceOf.call(actors.owner));
    const ownerBurn = ownerBalance.div(10);

    // Do not allow burn more than allowed tokens
    await assertEvmThrows(token.burnTokens(ownerBalance.add(1), {from: actors.owner}));
    let txres = await token.burnTokens(ownerBurn, {from: actors.owner});

    assert.equal(txres.logs[0].event, 'TokensBurned');
    assert.equal(txres.logs[0].args.amount, ownerBurn.toString());

    assert.equal((await token.balanceOf.call(actors.owner)).toString(), ownerBalance.sub(ownerBurn).toString());
    assert.equal((await token.totalSupply.call()).toString(),
                 new BigNumber(tokens(735e6)).sub(ownerBurn).toString());

    const someone1Balance = new BigNumber(await token.balanceOf.call(actors.someone1));
    const someone1Burn = someone1Balance.div(2);

    // Do not allow burn more than allowed tokens
    await assertEvmThrows(token.burnTokens(someone1Balance.add(1), {from: actors.someone1}));
    txres = await token.burnTokens(someone1Burn, {from: actors.someone1});

    assert.equal(txres.logs[0].event, 'TokensBurned');
    assert.equal(txres.logs[0].args.amount, someone1Burn.toString());

    assert.equal((await token.balanceOf.call(actors.someone1)).toString(),
                 someone1Balance.sub(someone1Burn).toString());
    assert.equal((await token.totalSupply.call()).toString(),
                 new BigNumber(tokens(735e6)).sub(ownerBurn).sub(someone1Burn).toString());

    // burn once more
    txres = await token.burnTokens(someone1Burn, {from: actors.someone1});

    assert.equal(txres.logs[0].event, 'TokensBurned');
    assert.equal(txres.logs[0].args.amount, someone1Burn.toString());

    assert.equal((await token.balanceOf.call(actors.someone1)).toString(), new BigNumber(0).toString());
    assert.equal((await token.totalSupply.call()).toString(),
                 new BigNumber(tokens(735e6)).sub(ownerBurn).sub(someone1Balance).toString());
  });

  it('token transfers', async () => {
    const token = await SNPCToken.deployed();

    // check lock
    assert.isTrue(await token.locked.call());
    await token.unlock();
    assert.isFalse(await token.locked.call());

    // initial state for investor1
    await token.assignReserved(actors.investor1, TokenReservation.Bounty, tokens(10e6), {from: actors.owner});
    await token.assignReserved(actors.investor1, TokenReservation.Team, tokens(5e6), {from: actors.owner});
    const txres = await token.transfer(actors.investor1, tokens(20e6), {from: actors.owner});
    assert.equal(txres.logs[0].event, 'Transfer');
    assert.equal(txres.logs[0].args.from, actors.owner);
    assert.equal(txres.logs[0].args.to, actors.investor1);
    assert.equal(txres.logs[0].args.value, tokens(20e6));
    // initial state for investor2
    await token.assignReserved(actors.investor2, TokenReservation.Bounty, tokens(10e6), {from: actors.owner});
    await token.assignReserved(actors.investor2, TokenReservation.Team, tokens(5e6), {from: actors.owner});
    await token.transfer(actors.investor2, tokens(20e6), {from: actors.owner});

    const reservedBountyUnlockAt = new BigNumber(await token.bountyReservedUnlockAt.call());
    await web3IncreaseTimeTo(reservedBountyUnlockAt.sub(Seconds.hours(1)).toNumber());

    // check transfer from 1 to 2 (bounty and team reserved tokens)
    // check balances
    let balance1 = new BigNumber(await token.balanceOf.call(actors.investor1));
    const balance1BountyReserved = new BigNumber(await token.bountyReservedBalanceOf.call(actors.investor1));
    const balance1TeamReserved = new BigNumber(await token.teamReservedBalanceOf.call(actors.investor1));
    let balance1Allowed = new BigNumber(await token.getAllowedForTransferTokens.call(actors.investor1));
    // before bounty reserve unlock date - without all bonuses
    assert.equal(balance1.sub(balance1BountyReserved).sub(balance1TeamReserved).toString(), balance1Allowed.toString());

    let balance2 = new BigNumber(await token.balanceOf.call(actors.investor2));
    const balance2BountyReserved = new BigNumber(await token.bountyReservedBalanceOf.call(actors.investor2));
    const balance2TeamReserved = new BigNumber(await token.teamReservedBalanceOf.call(actors.investor2));
    let balance2Allowed = new BigNumber(await token.getAllowedForTransferTokens.call(actors.investor2));
    // before bounty reserve unlock date - without all bonuses
    assert.equal(balance2.sub(balance2BountyReserved).sub(balance2TeamReserved).toString(), balance2Allowed.toString());

    // check more than allowed transfer
    await assertEvmThrows(token.transfer(actors.investor2, balance1Allowed.add(new BigNumber(1)),
                                         {from: actors.investor1}));

    // check allowed transfer
    const balanceTransfer = balance1Allowed.div(new BigNumber(2));
    await token.transfer(actors.investor2, balanceTransfer, {from: actors.investor1});
    balance1 = balance1.sub(balanceTransfer);
    balance2 = balance2.add(balanceTransfer);
    balance2Allowed = balance2Allowed.add(balanceTransfer);
    balance1Allowed = balance1Allowed.sub(balanceTransfer);

    // check balances of sender
    assert.equal((await token.balanceOf.call(actors.investor1)).toString(), balance1.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor1)).toString(),
                 balance1Allowed.toString());
    assert.equal((await token.bountyReservedBalanceOf.call(actors.investor1)).toString(),
                 balance1BountyReserved.toString());
    // and receiver
    assert.equal((await token.balanceOf.call(actors.investor2)).toString(), balance2.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor2)).toString(),
                 balance2Allowed.toString());
    assert.equal((await token.bountyReservedBalanceOf.call(actors.investor2)).toString(),
                 balance2BountyReserved.toString());

    // check not approved transferFrom
    await assertEvmThrows(token.transferFrom(actors.investor1, actors.investor2, balanceTransfer,
                                             {from: actors.team1}));
    await token.approve(actors.team1, balanceTransfer, {from: actors.investor1});
    // check approved, but over limit transferFrom
    await assertEvmThrows(token.transferFrom(actors.investor1, actors.investor2,
                                             balanceTransfer.add(new BigNumber(1)), {from: actors.team1}));

    // check allowed and approved transferFrom
    await token.transferFrom(actors.investor1, actors.investor2, balanceTransfer, {from: actors.team1});
    balance1 = balance1.sub(balanceTransfer);
    balance2 = balance2.add(balanceTransfer);
    balance2Allowed = balance2Allowed.add(balanceTransfer);
    balance1Allowed = balance1Allowed.sub(balanceTransfer);
    assert.equal(balance1Allowed.toString(), '0');

    // check balances of sender
    assert.equal((await token.balanceOf.call(actors.investor1)).toString(), balance1.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor1)).toString(),
                 balance1Allowed.toString());
    // and receiver
    assert.equal((await token.balanceOf.call(actors.investor2)).toString(), balance2.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor2)).toString(),
                 balance2Allowed.toString());

    await web3IncreaseTimeTo(reservedBountyUnlockAt.add(1).toNumber());

    // bounty tokens unlocked
    balance2Allowed = balance2Allowed.add(balance2BountyReserved);
    balance1Allowed = balance1Allowed.add(balance1BountyReserved);

    // check balances of sender
    assert.equal((await token.balanceOf.call(actors.investor1)).toString(), balance1.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor1)).toString(),
                 balance1Allowed.toString());
    // and receiver
    assert.equal((await token.balanceOf.call(actors.investor2)).toString(), balance2.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor2)).toString(),
                 balance2Allowed.toString());

    const reservedTeamUnlockAt = new BigNumber(await token.teamReservedUnlockAt.call());
    await web3IncreaseTimeTo(reservedTeamUnlockAt.sub(Seconds.hours(1)).toNumber());

    // nothing changed
    // check balances of sender
    assert.equal((await token.balanceOf.call(actors.investor1)).toString(), balance1.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor1)).toString(),
                 balance1Allowed.toString());
    // and receiver
    assert.equal((await token.balanceOf.call(actors.investor2)).toString(), balance2.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor2)).toString(),
                 balance2Allowed.toString());

    await web3IncreaseTimeTo(reservedTeamUnlockAt.add(1).toNumber());

    // team tokens unlocked
    balance2Allowed = balance2Allowed.add(balance2TeamReserved);
    balance1Allowed = balance1Allowed.add(balance1TeamReserved);

    // check balances of sender
    assert.equal((await token.balanceOf.call(actors.investor1)).toString(), balance1.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor1)).toString(),
                 balance1Allowed.toString());
    // and receiver
    assert.equal((await token.balanceOf.call(actors.investor2)).toString(), balance2.toString());
    assert.equal((await token.getAllowedForTransferTokens.call(actors.investor2)).toString(),
                 balance2Allowed.toString());
  });

  it('withdraw stuck tokens', async () => {
    const token = await SNPCToken.deployed();

    assert.isFalse(await token.locked.call());

    assert.equal((await token.balanceOf.call(token.address)).toString(), '0');
    await token.transfer(token.address, tokens(20e6), {from: actors.owner});
    assert.equal((await token.balanceOf.call(token.address)).toString(), tokens(20e6));

    // withdraw only for owner
    await assertEvmThrows(token.withdraw({from: actors.someone1}));
    await token.withdraw({from: actors.owner});

    // withdrawTokens only for owner
    await assertEvmThrows(token.withdrawTokens(token.address, {from: actors.someone1}));
    const txres = await token.withdrawTokens(token.address, {from: actors.owner});

    assert.equal(txres.logs[0].event, 'Transfer');
    assert.equal(txres.logs[0].args.from, token.address);
    assert.equal(txres.logs[0].args.to, actors.owner);
    assert.equal(txres.logs[0].args.value, tokens(20e6));
    assert.equal((await token.balanceOf.call(token.address)).toString(), '0');
  });

  it('token must be destructible', async () => {
    const token = await SNPCToken.deployed();

    // Sign selfdestruct request by owner pkey for: wrong contract address and wrong sender address
    let vrs = signSelfdestruct(OWNER_PKEY, actors.owner, actors.someone1);
    await assertEvmThrows(token.selfDestruct(vrs.v, vrs.r, vrs.s, {from: actors.owner}));

    // Sign selfdestruct request by owner pkey for: contract address and wrong sender address
    vrs = signSelfdestruct(OWNER_PKEY, token.address, actors.someone1);
    await assertEvmThrows(token.selfDestruct(vrs.v, vrs.r, vrs.s, {from: actors.owner}));

    // Sign selfdestruct request by owner pkey for: contract address and owner address
    vrs = signSelfdestruct(OWNER_PKEY, token.address, actors.owner);
    // only for owner
    await assertEvmThrows(token.selfDestruct(vrs.v, vrs.r, vrs.s, {from: actors.someone1}));

    await token.selfDestruct(vrs.v, vrs.r, vrs.s, {from: actors.owner});
    await assertEvmIsNotAContractAddress(token.owner.call());
  });
});