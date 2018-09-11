import {ItTestFn} from '../globals';
import * as BigNumber from 'bignumber.js';
import {
    ISNPCPreICO, TokenReservation, ICOState, ISNPCICOStage1, ISNPCICOStage2, ISNPCICOStage3
} from '../contracts';
import {assertEvmThrows, assertEvmInvalidOpcode} from './lib/assert';
import {web3LatestTime, Seconds, web3IncreaseTimeTo, web3IncreaseTime} from './lib/time';

const it = (<any>global).it as ItTestFn;
const assert = (<any>global).assert as Chai.AssertStatic;

const SNPCToken = artifacts.require('./SNPCToken.sol');
const SNPCPreICO = artifacts.require('./SNPCPreICO.sol');
const SNPCICOStage1 = artifacts.require('./SNPCICOStage1.sol');
const SNPCICOStage2 = artifacts.require('./SNPCICOStage2.sol');
const SNPCICOStage3 = artifacts.require('./SNPCICOStage3.sol');

const ONE_TOKEN = new BigNumber('1e18');
const PREICO_ETH_TOKEN_EXCHANGE_RATIO = 1700;
const ICOSTAGE1_ETH_TOKEN_EXCHANGE_RATIO = 1500;
const ICOSTAGE2_ETH_TOKEN_EXCHANGE_RATIO = 1345;
const ICOSTAGE3_ETH_TOKEN_EXCHANGE_RATIO = 1280;

function tokens(val: BigNumber.NumberLike): string {
    return new BigNumber(val).times(ONE_TOKEN).toString();
}

function tokens2wei(val: BigNumber.NumberLike, exchangeRatio: number): string {
    return new BigNumber(val)
        .mul(ONE_TOKEN)
        .divToInt(exchangeRatio)
        .toString();
}

function wei2rawtokens(val: BigNumber.NumberLike, exchangeRatio: number): string {
    return new BigNumber(val)
        .mul(exchangeRatio)
        .toString();
}

// PreICO Instance
let preIco: ISNPCPreICO | null;
// ICO Stage 1 Instance
let icoStage1: ISNPCICOStage1 | null;
// ICO Stage 2 Instance
let icoStage2: ISNPCICOStage2 | null;

const state = {
    availableTokens: new BigNumber(0),
    teamWalletBalance: new BigNumber(0),
    teamWalletInitialBalance: new BigNumber(0),
    sentWei: new BigNumber(0),
    investor1Wei: new BigNumber(0),
    investor2Wei: new BigNumber(0),
    investor3Wei: new BigNumber(0),
    investor4Wei: new BigNumber(0),
    investor5Wei: new BigNumber(0),
    investor6Wei: new BigNumber(0),
    investor7Wei: new BigNumber(0),
    investor8Wei: new BigNumber(0),
    investor9Wei: new BigNumber(0)
};

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
        teamWallet: accounts[cnt++]
    } as { [k: string]: string };
    console.log('Actors: ', actors);

    it('should be correct initial token state', async () => {
        const token = await SNPCToken.deployed();
        // Total supply
        assert.equal(await token.totalSupply.call(), tokens(735e6));
        state.availableTokens = new BigNumber(await token.availableSupply.call());
        // Team
        assert.equal(await token.getReservedTokens.call(TokenReservation.Team), tokens(66.15e6));
        // Bounty
        assert.equal(await token.getReservedTokens.call(TokenReservation.Bounty), tokens(36.75e6));
        // Partners
        assert.equal(await token.getReservedTokens.call(TokenReservation.Partners), tokens(44.1e6));
        // Reserve
        assert.equal(await token.getReservedTokens.call(TokenReservation.Reserve), tokens(73.5e6));
        // Available supply
        assert.equal(
            await token.availableSupply.call(),
            new BigNumber(tokens(514.5e6)).toString()
        );
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

    it('should allow private token distribution', async () => {
        const token = await SNPCToken.deployed();
        assert.equal(await token.getReservedTokens.call(TokenReservation.Team), tokens(66.15e6));
        assert.equal(await token.getReservedTokens.call(TokenReservation.Bounty), tokens(36.75e6));
        assert.equal(await token.getReservedTokens.call(TokenReservation.Partners), tokens(44.1e6));
        assert.equal(await token.getReservedTokens.call(TokenReservation.Reserve), tokens(73.5e6));

        const reservedTeamUnlockAt = (await token.reservedTeamUnlockAt.call()) as number;
        await web3IncreaseTimeTo(reservedTeamUnlockAt - Seconds.hours(1));
        // Do not allow token reservation from reserve before unlock date
        await assertEvmThrows(
            token.assignReserved(actors.team1, TokenReservation.Team, tokens(1e6), {from: actors.owner})
        );

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
        await assertEvmInvalidOpcode(
            token.assignReserved(actors.reserve1, TokenReservation.Bounty, tokens(26.75e6 + 1), {from: actors.owner})
        );
        // Do not allow token reservation from others
        await assertEvmThrows(
            token.assignReserved(actors.team1, TokenReservation.Bounty, tokens(1e6), {from: actors.someone1})
        );

        await web3IncreaseTimeTo(reservedTeamUnlockAt + 1);
        // Reserve tokens for team member
        txres = await token.assignReserved(actors.team1, TokenReservation.Team, tokens(5e6), {from: actors.owner});
        assert.equal(txres.logs[0].event, 'ReservedTokensDistributed');
        assert.equal(txres.logs[0].args.to, actors.team1);
        assert.equal(txres.logs[0].args.amount, tokens(5e6));

        assert.equal(await token.balanceOf.call(actors.team1), tokens(5e6));
        // check reserved tokens for team
        assert.equal(await token.getReservedTokens.call(TokenReservation.Team), tokens(61.15e6)); // 66.15e6 - 5e6

        // Do not allow reserve more than allowed tokens
        await assertEvmInvalidOpcode(
            token.assignReserved(actors.reserve1, TokenReservation.Team, tokens(61.15e6 + 1), {from: actors.owner})
        );
        // Do not allow token reservation from others
        await assertEvmThrows(
            token.assignReserved(actors.team1, TokenReservation.Team, tokens(1e6), {from: actors.someone1})
        );

        // Reserve tokens from partners group
        txres = await token.assignReserved(actors.someone2, TokenReservation.Partners, tokens(2e6), {
            from: actors.owner
        });
        assert.equal(txres.logs[0].event, 'ReservedTokensDistributed');
        assert.equal(txres.logs[0].args.to, actors.someone2);
        assert.equal(txres.logs[0].args.amount.toString(), tokens(2e6));

        assert.equal(await token.balanceOf.call(actors.someone2), tokens(2e6));

        // check reserved tokens
        assert.equal(await token.getReservedTokens.call(TokenReservation.Partners), tokens(42.1e6)); // 44.1e6 - 2e6
        // Do not allow reserve more than allowed tokens
        await assertEvmInvalidOpcode(
            token.assignReserved(actors.reserve1, TokenReservation.Partners, tokens(42.1e6 + 1), {from: actors.owner})
        );
        // Do not allow token reservation from others
        await assertEvmThrows(
            token.assignReserved(actors.team1, TokenReservation.Partners, tokens(1e6), {from: actors.someone1})
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
        await assertEvmInvalidOpcode(
            token.assignReserved(actors.reserve1, TokenReservation.Reserve, tokens(63.5e6 + 1), {from: actors.owner})
        );

        // Do not allow token reservation from others
        await assertEvmThrows(
            token.assignReserved(actors.team1, TokenReservation.Reserve, tokens(1e6), {from: actors.someone1})
        );
    });

    it('should public token operations be locked during ICO', async () => {
        // try transfer some tokens from team1 to someone1
        const token = await SNPCToken.deployed();
        await assertEvmThrows(token.transfer(actors.someone1, 1, {from: actors.team1}));
    });

    it('should pre-ico contract deployed', async () => {
        const token = await SNPCToken.deployed();
        preIco = await SNPCPreICO.new(
            token.address,
            actors.teamWallet,
            new BigNumber('0'), // low cap tokens
            new BigNumber('153e24'), // hard cap tokens
            new BigNumber('1e16'), // min tx cap 0.01 eth
            new BigNumber('125e20'), // hard tx cap
            {
                from: actors.owner
            }
        );
        state.teamWalletBalance = state.teamWalletInitialBalance = await web3.eth.getBalance(actors.teamWallet);
        assert.equal(await preIco.token.call(), token.address);
        assert.equal(await preIco.teamWallet.call(), actors.teamWallet);
        assert.equal((await preIco.lowCapTokens.call()).toString(), new BigNumber('0').toString());
        assert.equal((await preIco.hardCapTokens.call()).toString(), new BigNumber('153e24').toString());
        assert.equal((await preIco.lowCapTxWei.call()).toString(), new BigNumber('1e16').toString());
        assert.equal((await preIco.hardCapTxWei.call()).toString(), new BigNumber('125e20').toString());

        // Token is not controlled by any ICO
        assert.equal(await token.ico.call(), '0x0000000000000000000000000000000000000000');
        // Assign ICO controller contract
        const txres = await token.changeICO(preIco.address, {from: actors.owner});
        assert.equal(txres.logs[0].event, 'ICOChanged');
        assert.equal(await token.ico.call(), preIco.address);
        // Ensure no others can check ICO contract for token
        await assertEvmThrows(token.changeICO(preIco.address, {from: actors.someone1}));

        // Check ico state
        assert.equal(await preIco.state.call(), ICOState.Inactive);
    });

    it('check whitelist access', async () => {
        assert.isTrue(preIco != null);
        const ico = preIco!!;

        await assertEvmThrows(ico.disableWhitelist({from: actors.someone1}));
        await assertEvmThrows(ico.whitelist(actors.someone1, {from: actors.someone1}));
        await ico.disableWhitelist({from: actors.owner});
        await ico.enableWhitelist({from: actors.owner});
    });

    it('preICO lifecycle: start', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(preIco != null);
        const ico = preIco!!;
        assert.equal(await ico.state.call(), ICOState.Inactive);

        // ICO will end in 2 weeks
        const endAt = web3LatestTime() + Seconds.weeks(2);
        await ico.start(endAt, {from: actors.owner});
        assert.equal(await ico.state.call(), ICOState.Active);
        assert.equal(await ico.endAt.call(), endAt);

        // Check link
        assert.equal(await token.ico.call(), ico.address);
        assert.equal(await ico.token.call(), token.address);
        assert.equal(await ico.teamWallet.call(), actors.teamWallet);
    });

    it('preICO lifecycle: transfer-tokens', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(preIco != null);
        const ico = preIco!!;

        assert.equal(await ico.state.call(), ICOState.Active);

        let investor9Tokens = new BigNumber(0);
        assert.equal(await token.balanceOf.call(actors.investor9), investor9Tokens.toString());

        assert.equal(web3.eth.getBalance(actors.investor9).toString(), new BigNumber('100e18').toString());

        await assertEvmThrows(ico.transferTokens(actors.investor9, tokens(5000), {from: actors.someone1}));

        state.availableTokens = state.availableTokens.sub(tokens(5000));
        const txres = await ico.transferTokens(actors.investor9, tokens(5000));

        assert.equal(txres.logs[0].event, 'ICOTokensTransfer');
        assert.equal(txres.logs[0].args.investor, actors.investor9);
        assert.equal(txres.logs[0].args.tokens, tokens(5000).toString());

        investor9Tokens = investor9Tokens.add(txres.logs[0].args.tokens);
        assert.equal(await token.balanceOf.call(actors.investor9), txres.logs[0].args.tokens.toString());
        assert.equal(await token.balanceOf.call(actors.investor9), investor9Tokens.toString());
        assert.equal((await token.availableSupply.call()).toString(), state.availableTokens.toString());
        assert.equal((await ico.getInvestments.call(actors.investor9)).toString(), state.investor9Wei.toString()); // not changed

        assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
        assert.equal(web3.eth.getBalance(actors.investor9).toString(), new BigNumber('100e18').toString());
    });

    it('preICO lifecycle: invest', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(preIco != null);
        const ico = preIco!!;

        assert.equal(await ico.state.call(), ICOState.Active);

        // Check link
        assert.equal(await token.ico.call(), ico.address);
        assert.equal(await ico.token.call(), token.address);

        // Perform investments (investor1)
        let investor1Tokens = new BigNumber(0);
        const balance = web3.eth.getBalance(actors.investor1);
        assert.equal(balance.toString(), new BigNumber('100e18').toString());

        // Check deny not white-listed addresses
        const invest1 = tokens2wei(6800, PREICO_ETH_TOKEN_EXCHANGE_RATIO);
        await assertEvmThrows(
            ico.sendTransaction({
                value: invest1,
                from: actors.investor1
            })
        );

        // Add investor1 to white-list
        await ico.whitelist(actors.investor1);
        // Now it can buy tokens
        state.availableTokens = state.availableTokens.sub(tokens(6800));
        let txres = await ico.sendTransaction({
            value: invest1,
            from: actors.investor1
        });

        state.sentWei = state.sentWei.add(invest1);
        state.investor1Wei = state.investor1Wei.add(invest1);
        assert.equal(txres.logs[0].event, 'ICOInvestment');
        assert.equal(txres.logs[0].args.investedWei, invest1.toString());
        assert.equal(
            txres.logs[0].args.tokens,
            wei2rawtokens(txres.logs[0].args.investedWei, PREICO_ETH_TOKEN_EXCHANGE_RATIO).toString()
        );
        investor1Tokens = investor1Tokens.add(txres.logs[0].args.tokens);
        assert.equal(await token.balanceOf.call(actors.investor1), txres.logs[0].args.tokens.toString());
        assert.equal(await token.balanceOf.call(actors.investor1), investor1Tokens.toString());
        assert.equal((await token.availableSupply.call()).toString(), state.availableTokens.toString());
        assert.equal((await ico.getInvestments.call(actors.investor1)).toString(), state.investor1Wei.toString());

        state.teamWalletBalance = state.teamWalletBalance.add(invest1);
        assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());

        // Add investor2 to white-list
        await ico.whitelist(actors.investor2);
        state.availableTokens = state.availableTokens.sub(tokens(13600));
        const invest2 = tokens2wei(13600, PREICO_ETH_TOKEN_EXCHANGE_RATIO);
        txres = await ico.buyTokens({
            value: invest2,
            from: actors.investor2
        });
        state.sentWei = state.sentWei.add(invest2);
        state.investor2Wei = state.investor2Wei.add(invest2);
        assert.equal(txres.logs[0].event, 'ICOInvestment');
        assert.equal(txres.logs[0].args.investedWei, invest2.toString());
        assert.equal(
            txres.logs[0].args.tokens,
            wei2rawtokens(txres.logs[0].args.investedWei, PREICO_ETH_TOKEN_EXCHANGE_RATIO).toString()
        );
        assert.equal(await token.balanceOf.call(actors.investor2), txres.logs[0].args.tokens.toString());
        assert.equal((await token.availableSupply.call()).toString(), state.availableTokens.toString());
        assert.equal((await ico.getInvestments.call(actors.investor2)).toString(), state.investor2Wei.toString());

        state.teamWalletBalance = state.teamWalletBalance.add(invest2);
        assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    });

    it('preICO lifecycle: complete', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(preIco != null);
        const ico = preIco!!;

        assert.equal(await ico.state.call(), ICOState.Active);

        // tuning ICO: set low soft capacity to make available to fill it
        await ico.suspend({from: actors.owner});
        assert.equal(await ico.state.call(), ICOState.Suspended);

        // only owner can tune
        await assertEvmThrows(ico.tune(0, 0, 0, 0, 0, {from: actors.someone1}));
        await ico.tune(0, 0, 0, 0, 0, {from: actors.owner});

        // check that only low cap changed
        assert.equal(await ico.token.call(), token.address);
        assert.equal(await ico.teamWallet.call(), actors.teamWallet);
        assert.equal((await ico.lowCapTokens.call()).toString(), new BigNumber('0').toString());
        assert.equal((await ico.hardCapTokens.call()).toString(), new BigNumber('153e24').toString());
        assert.equal((await ico.lowCapTxWei.call()).toString(), new BigNumber('1e16').toString());
        assert.equal((await ico.hardCapTxWei.call()).toString(), new BigNumber('125e20').toString());

        assert.equal(await ico.state.call(), ICOState.Suspended);

        await ico.resume({from: actors.owner});
        assert.equal(await ico.state.call(), ICOState.Active);

        assert.equal((await ico.collectedWei.call()).toString(), state.sentWei.toString());
        assert.equal(await ico.state.call(), ICOState.Active);
        const endAt = await ico.endAt.call();

        await web3IncreaseTimeTo(new BigNumber(endAt).toNumber() + 1);
        await ico.touch({from: actors.someone1});
        assert.equal(await ico.state.call(), ICOState.Completed);
    });

    it('should ico stage 1 contract deployed', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(preIco != null);

        icoStage1 = await SNPCICOStage1.new(
            token.address,
            actors.teamWallet,
            new BigNumber('100e21'), // low cap tokens
            new BigNumber('90e24'), // hard cap tokens
            new BigNumber('1e16'), // min tx cap 0.01 eth
            new BigNumber('150e21'), // hard tx cap
            {
                from: actors.owner
            }
        );
        // state.refundVaultBalance = await web3.eth.getBalance(vault.address);
        assert.equal(await icoStage1.token.call(), token.address);
        assert.equal(await icoStage1.teamWallet.call(), actors.teamWallet);
        assert.equal((await icoStage1.lowCapTokens.call()).toString(), new BigNumber('100e21').toString());
        assert.equal((await icoStage1.hardCapTokens.call()).toString(), new BigNumber('90e24').toString());
        assert.equal((await icoStage1.lowCapTxWei.call()).toString(), new BigNumber('1e16').toString());
        assert.equal((await icoStage1.hardCapTxWei.call()).toString(), new BigNumber('150e21').toString());

        // Token is controlled by pre-ICO
        assert.equal(await token.ico.call(), preIco!!.address);
        assert.equal(await preIco!!.state.call(), ICOState.Completed);

        // Assign ICO controller contract
        const txres = await token.changeICO(icoStage1.address, {from: actors.owner});
        assert.equal(txres.logs[0].event, 'ICOChanged');
        assert.equal(await token.ico.call(), icoStage1.address);
        // Ensure no others can check ICO contract fot token
        await assertEvmThrows(token.changeICO(icoStage1.address, {from: actors.someone1}));

        // Check ico state
        assert.equal(await icoStage1.state.call(), ICOState.Inactive);
    });

    it('ICO Stage 1 lifecycle: start', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(icoStage1 != null);
        const ico = icoStage1!!;

        assert.equal(await ico.state.call(), ICOState.Inactive);

        // ICO will end in 4 weeks
        const endAt = web3LatestTime() + Seconds.weeks(4);
        await ico.start(endAt, {from: actors.owner});
        assert.equal(await ico.state.call(), ICOState.Active);
        assert.equal(await ico.endAt.call(), endAt);

        // Check link
        assert.equal(await token.ico.call(), ico.address);
        assert.equal(await ico.token.call(), token.address);
    });

    it('ICO Stage 1 lifecycle: invest', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(icoStage1 != null);
        const ico = icoStage1!!;

        assert.equal(await ico.state.call(), ICOState.Active);

        // Check link
        assert.equal(await token.ico.call(), ico.address);
        assert.equal(await ico.token.call(), token.address);

        // Perform investments (investor1)
        let investor4Tokens = new BigNumber(0);
        assert.equal(web3.eth.getBalance(actors.investor4).toString(), new BigNumber('100e18').toString());

        // Check deny not white-listed addresses
        const invest4 = tokens2wei(10500, ICOSTAGE1_ETH_TOKEN_EXCHANGE_RATIO);
        await assertEvmThrows(
            ico.sendTransaction({
                value: invest4,
                from: actors.investor4
            })
        );

        // Add investor4 to white-list
        await ico.whitelist(actors.investor4);
        // Now it can buy tokens
        state.availableTokens = state.availableTokens.sub(tokens(10500));
        let txres = await ico.sendTransaction({
            value: invest4,
            from: actors.investor4
        });
        state.sentWei = state.sentWei.add(invest4);
        state.investor4Wei = state.investor4Wei.add(invest4);
        assert.equal(txres.logs[0].event, 'ICOInvestment');
        assert.equal(txres.logs[0].args.investedWei, invest4.toString());
        assert.equal((await token.availableSupply.call()).toString(), state.availableTokens.toString());
        assert.equal(
            txres.logs[0].args.tokens,
            wei2rawtokens(txres.logs[0].args.investedWei, ICOSTAGE1_ETH_TOKEN_EXCHANGE_RATIO).toString()
        );
        investor4Tokens = investor4Tokens.add(txres.logs[0].args.tokens);
        assert.equal(await token.balanceOf.call(actors.investor4), txres.logs[0].args.tokens.toString());
        assert.equal(await token.balanceOf.call(actors.investor4), investor4Tokens.toString());
        assert.equal((await ico.getInvestments.call(actors.investor4)).toString(), state.investor4Wei.toString());

        state.teamWalletBalance = state.teamWalletBalance.add(invest4);
        assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());

        // Perform investments (investor5)
        let investor5Tokens = new BigNumber(0);
        assert.equal(web3.eth.getBalance(actors.investor5).toString(), new BigNumber('100e18').toString());

        // Check deny not white-listed addresses
        const invest5 = tokens2wei(9000, ICOSTAGE1_ETH_TOKEN_EXCHANGE_RATIO);
        await assertEvmThrows(
            ico.sendTransaction({
                value: invest5,
                from: actors.investor5
            })
        );

        // Add investor5 to white-list
        await ico.whitelist(actors.investor5);
        // Now it can buy tokens
        state.availableTokens = state.availableTokens.sub(tokens(9000));
        txres = await ico.sendTransaction({
            value: invest5,
            from: actors.investor5
        });
        state.sentWei = state.sentWei.add(invest5);
        state.investor5Wei = state.investor5Wei.add(invest5);
        assert.equal(txres.logs[0].event, 'ICOInvestment');
        assert.equal(txres.logs[0].args.investedWei, invest5.toString());
        assert.equal((await token.availableSupply.call()).toString(), state.availableTokens.toString());
        assert.equal(
            txres.logs[0].args.tokens,
            wei2rawtokens(txres.logs[0].args.investedWei, ICOSTAGE1_ETH_TOKEN_EXCHANGE_RATIO).toString()
        );
        investor5Tokens = investor5Tokens.add(txres.logs[0].args.tokens);
        assert.equal(await token.balanceOf.call(actors.investor5), txres.logs[0].args.tokens.toString());
        assert.equal(await token.balanceOf.call(actors.investor5), investor5Tokens.toString());
        assert.equal((await ico.getInvestments.call(actors.investor5)).toString(), state.investor5Wei.toString());

        state.teamWalletBalance = state.teamWalletBalance.add(invest5);
        assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    });

    it('ICO Stage 1 lifecycle: complete', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(icoStage1 != null);
        const ico = icoStage1!!;

        assert.equal(await ico.state.call(), ICOState.Active);

        // tuning ICO: set low soft capacity to make available to fill it
        await ico.suspend({from: actors.owner});
        assert.equal(await ico.state.call(), ICOState.Suspended);

        // only owner can tune
        await assertEvmThrows(ico.tune(0, new BigNumber('75e21'), 0, 0, 0, {from: actors.someone1}));
        await ico.tune(0, new BigNumber('75e21'), 0, 0, 0, {from: actors.owner});

        // check that only low cap changed
        assert.equal(await ico.token.call(), token.address);
        assert.equal(await ico.teamWallet.call(), actors.teamWallet);
        assert.equal((await ico.lowCapTokens.call()).toString(), new BigNumber('75e21').toString());
        assert.equal((await ico.hardCapTokens.call()).toString(), new BigNumber('90e24').toString());
        assert.equal((await ico.lowCapTxWei.call()).toString(), new BigNumber('1e16').toString());
        assert.equal((await ico.hardCapTxWei.call()).toString(), new BigNumber('150e21').toString());

        assert.equal(await ico.state.call(), ICOState.Suspended);

        await ico.resume({from: actors.owner});
        assert.equal(await ico.state.call(), ICOState.Active);

        let requiredTokens = new BigNumber(await ico.lowCapTokens.call());
        requiredTokens = requiredTokens.sub(await ico.tokensSold.call());

        let requiredWei = requiredTokens.divToInt(ICOSTAGE1_ETH_TOKEN_EXCHANGE_RATIO);
        while (requiredWei.mul(ICOSTAGE1_ETH_TOKEN_EXCHANGE_RATIO) < requiredTokens) {
            requiredWei = requiredWei.add(ONE_TOKEN);
        }

        await ico.whitelist(actors.investor6);
        state.availableTokens = state.availableTokens.sub(wei2rawtokens(requiredWei, ICOSTAGE1_ETH_TOKEN_EXCHANGE_RATIO));
        const txres = await ico.sendTransaction({
            value: requiredWei,
            from: actors.investor6
        });

        state.sentWei = state.sentWei.add(requiredWei);
        state.investor6Wei = state.investor6Wei.add(requiredWei);
        assert.equal(txres.logs[0].event, 'ICOInvestment');
        assert.equal(txres.logs[0].args.investedWei, requiredWei.toString());
        assert.equal((await token.availableSupply.call()).toString(), state.availableTokens.toString());
        assert.equal((await ico.getInvestments.call(actors.investor6)).toString(), state.investor6Wei.toString());

        state.teamWalletBalance = state.teamWalletBalance.add(requiredWei);
        assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());

        assert.equal(new BigNumber(await ico.collectedWei.call())
            .add(await preIco!!.collectedWei.call()).toString(), state.sentWei.toString());
        assert.equal(await ico.state.call(), ICOState.Active);
        const endAt = await ico.endAt.call();

        await web3IncreaseTimeTo(new BigNumber(endAt).toNumber() + 1);
        await ico.touch({from: actors.someone1});
        assert.equal(await ico.state.call(), ICOState.Completed);
    });

    it('should ico stage 2 contract deployed', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(preIco != null);

        icoStage2 = await SNPCICOStage2.new(
            token.address,
            actors.teamWallet,
            new BigNumber('100e21'), // low cap tokens
            new BigNumber('90e24'), // hard cap tokens
            new BigNumber('1e16'), // min tx cap 0.01 eth
            new BigNumber('150e21'), // hard tx cap
            {
                from: actors.owner
            }
        );
        assert.equal(await icoStage2.token.call(), token.address);
        assert.equal(await icoStage2.teamWallet.call(), actors.teamWallet);
        assert.equal((await icoStage2.lowCapTokens.call()).toString(), new BigNumber('100e21').toString());
        assert.equal((await icoStage2.hardCapTokens.call()).toString(), new BigNumber('90e24').toString());
        assert.equal((await icoStage2.lowCapTxWei.call()).toString(), new BigNumber('1e16').toString());
        assert.equal((await icoStage2.hardCapTxWei.call()).toString(), new BigNumber('150e21').toString());

        // Token is controlled by ICO Stage 1
        assert.equal(await token.ico.call(), icoStage1!!.address);
        assert.equal(await icoStage1!!.state.call(), ICOState.Completed);

        // Assign ICO controller contract
        const txres = await token.changeICO(icoStage2.address, {from: actors.owner});
        assert.equal(txres.logs[0].event, 'ICOChanged');
        assert.equal(await token.ico.call(), icoStage2.address);
        // Ensure no others can check ICO contract fot token
        await assertEvmThrows(token.changeICO(icoStage2.address, {from: actors.someone1}));

        // Check ico state
        assert.equal(await icoStage2.state.call(), ICOState.Inactive);
    });

    it('ICO Stage 2 lifecycle: start', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(icoStage2 != null);
        const ico = icoStage2!!;

        assert.equal(await ico.state.call(), ICOState.Inactive);

        // ICO will end in 4 weeks
        const endAt = web3LatestTime() + Seconds.weeks(4);
        await ico.start(endAt, {from: actors.owner});
        assert.equal(await ico.state.call(), ICOState.Active);
        assert.equal(await ico.endAt.call(), endAt);

        // Check link
        assert.equal(await token.ico.call(), ico.address);
        assert.equal(await ico.token.call(), token.address);
    });

    it('ICO Stage 2 lifecycle: invest', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(icoStage2 != null);
        const ico = icoStage2!!;

        assert.equal(await ico.state.call(), ICOState.Active);

        // Check link
        assert.equal(await token.ico.call(), ico.address);
        assert.equal(await ico.token.call(), token.address);

        // Perform investments (investor1)
        let investor7Tokens = new BigNumber(0);
        assert.equal(web3.eth.getBalance(actors.investor7).toString(), new BigNumber('100e18').toString());

        // Check deny not white-listed addresses
        const invest7 = tokens2wei(6725, ICOSTAGE2_ETH_TOKEN_EXCHANGE_RATIO);
        await assertEvmThrows(
            ico.sendTransaction({
                value: invest7,
                from: actors.investor7
            })
        );

        // Add investor7 to white-list
        await ico.whitelist(actors.investor7);
        // Now it can buy tokens
        state.availableTokens = state.availableTokens.sub(tokens(6725));
        let txres = await ico.sendTransaction({
            value: invest7,
            from: actors.investor7
        });
        state.sentWei = state.sentWei.add(invest7);
        state.investor7Wei = state.investor7Wei.add(invest7);
        assert.equal(txres.logs[0].event, 'ICOInvestment');
        assert.equal(txres.logs[0].args.investedWei, invest7.toString());
        assert.equal((await token.availableSupply.call()).toString(), state.availableTokens.toString());
        assert.equal(
            txres.logs[0].args.tokens,
            wei2rawtokens(txres.logs[0].args.investedWei, ICOSTAGE2_ETH_TOKEN_EXCHANGE_RATIO).toString()
        );
        investor7Tokens = investor7Tokens.add(txres.logs[0].args.tokens);
        assert.equal(await token.balanceOf.call(actors.investor7), txres.logs[0].args.tokens.toString());
        assert.equal(await token.balanceOf.call(actors.investor7), investor7Tokens.toString());
        assert.equal((await ico.getInvestments.call(actors.investor7)).toString(), state.investor7Wei.toString());

        state.teamWalletBalance = state.teamWalletBalance.add(invest7);
        assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());

        // Perform investments (investor8)
        let investor8Tokens = new BigNumber(0);
        assert.equal(web3.eth.getBalance(actors.investor8).toString(), new BigNumber('100e18').toString());

        // Check deny not white-listed addresses
        const invest8 = tokens2wei(9415, ICOSTAGE2_ETH_TOKEN_EXCHANGE_RATIO);
        await assertEvmThrows(
            ico.sendTransaction({
                value: invest8,
                from: actors.investor8
            })
        );

        // Add investor8 to white-list
        await ico.whitelist(actors.investor8);
        // Now it can buy tokens
        state.availableTokens = state.availableTokens.sub(tokens(9415));
        txres = await ico.sendTransaction({
            value: invest8,
            from: actors.investor8
        });
        state.sentWei = state.sentWei.add(invest8);
        state.investor8Wei = state.investor8Wei.add(invest8);
        assert.equal(txres.logs[0].event, 'ICOInvestment');
        assert.equal(txres.logs[0].args.investedWei, invest8.toString());
        assert.equal((await token.availableSupply.call()).toString(), state.availableTokens.toString());
        assert.equal(
            txres.logs[0].args.tokens,
            wei2rawtokens(txres.logs[0].args.investedWei, ICOSTAGE2_ETH_TOKEN_EXCHANGE_RATIO).toString()
        );
        investor8Tokens = investor8Tokens.add(txres.logs[0].args.tokens);
        assert.equal(await token.balanceOf.call(actors.investor8), txres.logs[0].args.tokens.toString());
        assert.equal(await token.balanceOf.call(actors.investor8), investor8Tokens.toString());
        assert.equal((await ico.getInvestments.call(actors.investor8)).toString(), state.investor8Wei.toString());

        state.teamWalletBalance = state.teamWalletBalance.add(invest8);
        assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());
    });

    it('ICO Stage 2 lifecycle: not complete', async () => {
        const token = await SNPCToken.deployed();
        assert.isTrue(icoStage2 != null);
        const ico = icoStage2!!;

        assert.equal(await ico.state.call(), ICOState.Active);

        // tuning ICO: set low soft capacity to make available to fill it
        await ico.suspend({from: actors.owner});
        assert.equal(await ico.state.call(), ICOState.Suspended);

        // only owner can tune
        await assertEvmThrows(ico.tune(0, new BigNumber('75e21'), 0, 0, 0, {from: actors.someone1}));
        await ico.tune(0, new BigNumber('75e21'), 0, 0, 0, {from: actors.owner});

        // check that only low cap changed
        assert.equal(await ico.token.call(), token.address);
        assert.equal(await ico.teamWallet.call(), actors.teamWallet);
        assert.equal((await ico.lowCapTokens.call()).toString(), new BigNumber('75e21').toString());
        assert.equal((await ico.hardCapTokens.call()).toString(), new BigNumber('90e24').toString());
        assert.equal((await ico.lowCapTxWei.call()).toString(), new BigNumber('1e16').toString());
        assert.equal((await ico.hardCapTxWei.call()).toString(), new BigNumber('150e21').toString());

        assert.equal(await ico.state.call(), ICOState.Suspended);

        await ico.resume({from: actors.owner});
        assert.equal(await ico.state.call(), ICOState.Active);

        assert.equal(web3.eth.getBalance(actors.teamWallet).toString(), state.teamWalletBalance.toString());

        const endAt = await ico.endAt.call();

        await web3IncreaseTimeTo(new BigNumber(endAt).toNumber() + 1);
        await ico.touch({from: actors.someone1});
        assert.equal(await ico.state.call(), ICOState.NotCompleted);
    });

    it('should team wallet match invested funds after pre-ico & ico', async () => {
        assert.equal(
            new BigNumber(web3.eth.getBalance(actors.teamWallet)).sub(state.teamWalletInitialBalance).toString(),
            state.sentWei.toString()
        );

        assert.equal(state.investor1Wei
            .add(state.investor2Wei)
            .add(state.investor3Wei)
            .add(state.investor4Wei)
            .add(state.investor5Wei)
            .add(state.investor6Wei)
            .add(state.investor7Wei)
            .add(state.investor8Wei).toString(), state.sentWei.toString());
    });

    it('token unsold burning', async () => {
        const token = await SNPCToken.deployed();

        const availableTokens = new BigNumber(await token.availableSupply.call());
        assert.notEqual(availableTokens.toString(), new BigNumber(0).toString());

        await assertEvmThrows(token.burnRemain({from: actors.someone1}));
        const txres = await token.burnRemain({from: actors.owner});

        assert.equal(txres.logs[0].event, 'TokensBurned');
        assert.equal(txres.logs[0].args.amount, availableTokens.toString());

        assert.equal((await token.availableSupply.call()).toString(), new BigNumber(0).toString());
        assert.equal((await token.totalSupply.call()).toString(),
            new BigNumber(tokens(735e6)).sub(availableTokens).toString());
    });

    it('token transfers', async () => {
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
    });
});