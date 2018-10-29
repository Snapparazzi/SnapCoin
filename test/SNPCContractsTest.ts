import {ItTestFn} from '../globals';
import * as BigNumber from 'bignumber.js';
import {TokenReservation} from '../contracts';
import {assertEvmThrows, assertEvmInvalidOpcode, assertEvmIsNotAContractAddress} from './lib/assert';
import {web3LatestTime, Seconds, web3IncreaseTimeTo, web3IncreaseTime} from './lib/time';

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
    investor3: accounts[cnt++],
    investor4: accounts[cnt++],
    investor5: accounts[cnt++],
    investor6: accounts[cnt++],
    investor7: accounts[cnt++],
    investor8: accounts[cnt++],
    investor9: accounts[cnt++],
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

  it('token unsold burning', async () => {
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

  /*  it('token transfers', async () => {
      const token = await SNPCToken.deployed();

      // check lock
      assert.isTrue(await token.locked.call());
      await token.unlock();
      assert.isFalse(await token.locked.call());

      // check balances
      let balance5 = new BigNumber(await token.balanceOf.call(actors.investor5));

      let balance6 = new BigNumber(await token.balanceOf.call(actors.investor6));

      // check allowed transfer
      const balanceTransfer = balance5.div(new BigNumber(2));
      await token.transfer(actors.investor6, balanceTransfer, {from: actors.investor5});
      balance5 = balance5.sub(balanceTransfer);
      balance6 = balance6.add(balanceTransfer);

      // check balances of sender
      assert.equal((await token.balanceOf.call(actors.investor5)).toString(), balance5.toString());
      // and receiver
      assert.equal((await token.balanceOf.call(actors.investor6)).toString(), balance6.toString());

      // check not approved transferFrom
      await assertEvmThrows(token.transferFrom(actors.investor5, actors.investor6, balanceTransfer,
                                               {from: actors.team1}));
      await token.approve(actors.team1, balanceTransfer, {from: actors.investor5});
      // check approved, but over limit transferFrom
      await assertEvmThrows(token.transferFrom(actors.investor5, actors.investor6,
                                               balanceTransfer.add(new BigNumber(1)), {from: actors.team1}));

      // check allowed and approved transferFrom
      await token.transferFrom(actors.investor5, actors.investor6, balanceTransfer, {from: actors.team1});
      balance5 = balance5.sub(balanceTransfer);
      balance6 = balance6.add(balanceTransfer);

      // check balances of sender
      assert.equal((await token.balanceOf.call(actors.investor5)).toString(), balance5.toString());
      // and receiver
      assert.equal((await token.balanceOf.call(actors.investor6)).toString(), balance6.toString());

      assert.equal(balance5.toString(), '0');

      const reservedBountyUnlockAt = (await token.bountyReservedUnlockAt.call()) as number;
      await web3IncreaseTimeTo(reservedBountyUnlockAt - Seconds.hours(1));

      await web3IncreaseTimeTo(reservedBountyUnlockAt + 1);

      const reservedTeamUnlockAt = (await token.teamReservedUnlockAt.call()) as number;
      await web3IncreaseTimeTo(reservedTeamUnlockAt - Seconds.hours(1));

      await web3IncreaseTimeTo(reservedTeamUnlockAt + 1);
    });*/

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