global.Promise = require('bluebird');
import Ajv = require('ajv');
import fs = require('fs');
import net = require('net');
import path = require('path');
import {Strings} from './lib/utils';
import * as Web3 from 'web3';
import {address, IContract} from './globals';
import {ISNPCToken, ISNPCPreICO, ISNPCICOStage1, ISNPCICOStage2, ISNPCICOStage3, ICOState} from './contracts';
import {ICliConfig} from './cli.schema';
import {toIcoStateIdToName, tokenGroupToId} from './lib/w3contracts/utils';
import * as BigNumber from 'bignumber.js';
import moment = require('moment');
import readline = require('readline');

type ContractName = 'SNPCToken' | 'SNPCPreICO' | 'SNPCICOStage1' | 'SNPCICOStage2'| 'SNPCICOStage3';

const ctx = {
  contractNames: ['SNPCToken', 'SNPCPreICO', 'SNPCICOStage1', 'SNPCICOStage2', 'SNPCICOStage3'],
  cmdOpts: new Array<string>(),
  verbose: false,
  cfile: 'cli.yml',
  SNPCToken: {},
  SNPCPreICO: {},
  SNPCICOStage1: {},
  SNPCICOStage2: {},
  SNPCICOStage3: {}
} as {
  contractNames: string[];
  cmd: string;
  cmdOpts: string[];
  cfile: string;
  cfg: ICliConfig;
  verbose: boolean;
  web3: Web3;
  provider: Web3.providers.Provider;
  SNPCToken: {
    meta: IContract<ISNPCToken>;
    instance: ISNPCToken;
  };
  SNPCPreICO: {
    meta: IContract<ISNPCPreICO>;
    instance: ISNPCPreICO;
  };
  SNPCICOStage1: {
    meta: IContract<ISNPCICOStage1>;
    instance: ISNPCICOStage1;
  };
  SNPCICOStage2: {
    meta: IContract<ISNPCICOStage2>;
    instance: ISNPCICOStage2;
  };
  SNPCICOStage3: {
    meta: IContract<ISNPCICOStage3>;
    instance: ISNPCICOStage3;
  };
};

const rl = readline.createInterface({
                                      input: process.stdin,
                                      output: process.stdout
                                    });

const handlers = {} as {
  [k: string]: () => Promise<void>;
};

async function setup() {
  const TruffleContract = require('truffle-contract');
  loadConfig(ctx.cfile);
  await setupWeb3();
  await loadDeployedContracts();

  async function loadDeployedContracts() {
    const ecfg = ctx.cfg.ethereum;
    const w3defaults = {
      from: ecfg.from,
      gas: ecfg.gas,
      gasPrice: ecfg.gasPrice
    };
    return Promise.mapSeries(ctx.contractNames, async cn => {
      if (!ecfg[cn]) {
        return;
      }
      const c = ctx as any;
      c[cn].meta = TruffleContract(JSON.parse(fs.readFileSync(ecfg[cn].schema).toString()));
      c[cn].meta.setProvider(ctx.web3.currentProvider);
      c[cn].meta.defaults(w3defaults);
      c[cn].meta.synchronization_timeout = 0;
      const addr = readDeployedContractAddress(cn);
      if (addr) {
        c[cn].instance = await c[cn].meta.at(addr);
        console.log(`Loaded ${cn} instance at: ${addr}`);
      }
    });
  }

  async function setupWeb3() {
    const ecfg = ctx.cfg.ethereum;
    const endpoint = ecfg.endpoint.trim();
    if (endpoint.startsWith('ipc://')) {
      console.log(`Using Web3.providers.IpcProvider for ${endpoint}`);
      ctx.provider = new Web3.providers.IpcProvider(endpoint.substring('ipc://'.length), net);
    } else if (endpoint.startsWith('http')) {
      console.log(`Using Web3.providers.HttpProvider provider for: ${endpoint}`);
      ctx.provider = new Web3.providers.HttpProvider(endpoint);
    } else {
      throw new Error(`Unknown web3 endpoint: '${endpoint}'`);
    }
    ctx.web3 = new Web3(ctx.provider);
    await Promise.fromNode(cb => {
      ctx.web3.version.getNode((err, node) => {
        if (err) {
          cb(err);
          return;
        }
        console.log(`web3 node: ${node}`);
        cb(err, node);
      });
    });
    await Promise.fromNode(cb => {
      ctx.web3.version.getNetwork((err, netId) => {
        if (err) {
          cb(err);
          return;
        }
        switch (netId) {
          case '1':
            console.log('w3 connected to >>>> MAINNET <<<<');
            break;
          case '2':
            console.log('w3 connected to >>>> MORDEN <<<<');
            break;
          case '3':
            console.log('w3 connected to >>>> ROPSTEN <<<<');
            break;
          default:
            console.log('w3 connected to >>>> UNKNOWN <<<<');
        }
        cb(err, netId);
      });
    });
  }

  function loadConfig(cpath: string) {
    const ajv = new Ajv();
    const configSchema = require('./cli.schema.json');
    const yaml = require('js-yaml');
    const subst = {
      home: process.env['HOME'],
      cwd: process.cwd(),
      moduledir: __dirname
    };
    ctx.cfg = yaml.safeLoad(Strings.replaceTemplate(fs.readFileSync(cpath, 'utf8'), subst));
    if (!ajv.validate(configSchema, ctx.cfg)) {
      const msg = `env: Invalid configuration: ${cpath}: `;
      console.error(msg, ajv.errors);
      throw new Error(`Invalid configuration: ${cpath}`);
    }
    if (ctx.verbose) {
      console.log('Configuration ', JSON.stringify(ctx.cfg, null, 2));
    }
  }
}

function readDeployedContractAddress(contract: string): string | null {
  const p = path.join(ctx.cfg.ethereum.lockfilesDir, `${contract}.lock`);
  if (fs.existsSync(p)) {
    return fs.readFileSync(p).toString('utf8');
  } else {
    return null;
  }
}

function writeDeployedContractAddress(contract: string, addr: address) {
  const p = path.join(ctx.cfg.ethereum.lockfilesDir, `${contract}.lock`);
  fs.writeFileSync(p, addr);
}

function failIfDeployed(cname?: ContractName) {
  const c = ctx as any;
  if (cname) {
    if (c[cname].instance) {
      throw new Error(`Contract '${cname}' is already deployed`);
    }
  } else {
    ctx.contractNames.forEach(cn => failIfDeployed(cn as any));
  }
}

function failIfNotDeployed(cname?: ContractName) {
  const c = ctx as any;
  if (cname) {
    if (!c[cname].instance) {
      throw new Error(`Contract '${cname}' is not deployed`);
    }
  } else {
    ctx.contractNames.forEach(cn => failIfNotDeployed(cn as any));
  }
}

function checkEthNetwork(): Promise<void> {
  return new Promise((resolve, reject) => {
    // try synchronous call
    let syncing: boolean | Web3.SyncingResult;
    try {
      syncing = ctx.web3.eth.syncing;
    } catch (err) {
      // async request
      ctx.web3.eth.getSyncing((err: any, sync: boolean | Web3.SyncingResult) => {
        if (err) {
          reject(err);
          return;
        }
        if (sync) {
          reject('Ethereum network client in pending synchronization, try again later');
        } else {
          resolve();
        }
      });
      return;
    }
    if (syncing) {
      reject('Ethereum network client in pending synchronization, try again later');
      return;
    }
    resolve();
  });
}

function confirm(question: string): Promise<void> {
  return new Promise((resolve, reject) => {
    rl.question(question + " (YES/no) ", (answer) => {
      if (answer === 'YES') {
        resolve();
      } else {
        reject();
      }
      rl.close();
    });
  });
}

// -------------------- Operations

/**
 * Deploy
 */
handlers['deploy'] = async () => {
  await checkEthNetwork();
  let icfg = null;
  if (!ctx.SNPCToken.instance) {
    icfg = ctx.cfg.ethereum.SNPCToken;
    console.log(`Deployment: 'SNPCToken' `, icfg);
    ctx.SNPCToken.instance = await ctx.SNPCToken.meta.new(
        icfg.totalSupplyTokens,
        icfg.reservedTeamTokens,
        icfg.reservedBountyTokens,
        icfg.reservedPartnersTokens,
        icfg.reservedReserveTokens,
        {
          from: ctx.cfg.ethereum.from
        }
    );
    console.log(`SNPCToken successfully deployed at: ${ctx.SNPCToken.instance.address}\n\n`);
    writeDeployedContractAddress('SNPCToken', ctx.SNPCToken.instance.address);
  }
  if (!ctx.SNPCPreICO.instance) {
    icfg = ctx.cfg.ethereum.SNPCPreICO;
    console.log(`Deployment: 'SNPCPreICO' `, icfg);
    ctx.SNPCPreICO.instance = await ctx.SNPCPreICO.meta.new(
        ctx.SNPCToken.instance.address,
        icfg.teamWallet,
        icfg.lowCapTokens,
        icfg.hardCapTokens,
        icfg.lowCapTxWei,
        icfg.hardCapWei,
        {
          from: ctx.cfg.ethereum.from
        }
    );
    console.log(`SNPCPreICO successfully deployed at: ${ctx.SNPCPreICO.instance.address}\n\n`);
    writeDeployedContractAddress('SNPCPreICO', ctx.SNPCPreICO.instance.address);
  }
  if (!ctx.SNPCICOStage1.instance) {
    icfg = ctx.cfg.ethereum.SNPCICOStage1;
    if (!!icfg) {
      console.log(`Deployment: 'SNPCICOStage1' `, icfg);
      ctx.SNPCICOStage1.instance = await ctx.SNPCICOStage1.meta.new(
          ctx.SNPCToken.instance.address,
          icfg.teamWallet,
          icfg.lowCapWei,
          icfg.hardCapWei,
          icfg.lowCapTxWei,
          icfg.hardCapWei,
          {
            from: ctx.cfg.ethereum.from
          }
      );
      console.log(`SNPCICOStage1 successfully deployed at: ${ctx.SNPCICOStage1.instance.address}\n\n`);
      writeDeployedContractAddress('SNPCICOStage1', ctx.SNPCICOStage1.instance.address);
    } else {
      console.warn(`SNPCICOStage1 not configured. Skipped`);
    }
  }
  if (!ctx.SNPCICOStage2.instance) {
    icfg = ctx.cfg.ethereum.SNPCICOStage2;
    if (!!icfg) {
      console.log(`Deployment: 'SNPCICOStage2' `, icfg);
      ctx.SNPCICOStage2.instance = await ctx.SNPCICOStage2.meta.new(
          ctx.SNPCToken.instance.address,
          icfg.teamWallet,
          icfg.lowCapWei,
          icfg.hardCapWei,
          icfg.lowCapTxWei,
          icfg.hardCapWei,
          {
            from: ctx.cfg.ethereum.from
          }
      );
      console.log(`SNPCICOStage2 successfully deployed at: ${ctx.SNPCICOStage2.instance.address}\n\n`);
      writeDeployedContractAddress('SNPCICOStage2', ctx.SNPCICOStage2.instance.address);
    } else {
      console.warn(`SNPCICOStage2 not configured. Skipped`);
    }
  }
  if (!ctx.SNPCICOStage3.instance) {
    icfg = ctx.cfg.ethereum.SNPCICOStage3;
    if (!!icfg) {
      console.log(`Deployment: 'SNPCICOStage3' `, icfg);
      ctx.SNPCICOStage3.instance = await ctx.SNPCICOStage3.meta.new(
          ctx.SNPCToken.instance.address,
          icfg.teamWallet,
          icfg.lowCapWei,
          icfg.hardCapWei,
          icfg.lowCapTxWei,
          icfg.hardCapWei,
          {
            from: ctx.cfg.ethereum.from
          }
      );
      console.log(`SNPCICOStage3 successfully deployed at: ${ctx.SNPCICOStage3.instance.address}\n\n`);
      writeDeployedContractAddress('SNPCICOStage3', ctx.SNPCICOStage3.instance.address);
    } else {
      console.warn(`SNPCICOStage3 not configured. Skipped`);
    }
  }
};

/**
 * Show status info
 */
handlers['status'] = async () => {
  await checkEthNetwork();
  failIfNotDeployed('SNPCToken');
  failIfNotDeployed('SNPCPreICO');
  const token = ctx.SNPCToken.instance;
  const preIco = ctx.SNPCPreICO.instance;
  const data = {};
  (<any>data)['token'] = {
    address: token.address,
    owner: await token.owner.call(),
    symbol: await token.symbol.call(),
    totalSupply: await token.totalSupply.call(),
    availableSupply: await token.availableSupply.call(),
    locked: await token.locked.call()
  };
  (<any>data)['pre-ico'] = {
    address: preIco.address,
    owner: await preIco.owner.call(),
    teamWallet: await preIco.teamWallet.call(),
    state: toIcoStateIdToName((await preIco.state.call()) as any),
    weiCollected: await preIco.collectedWei.call(),
    tokensSold: await preIco.tokensSold.call(),
    investorCount: await preIco.investorCount.call(),
    lowCapTokens: await preIco.lowCapTokens.call(),
    hardCapTokens: await preIco.hardCapTokens.call(),
    lowCapTxWei: await preIco.lowCapTxWei.call(),
    hardCapTxWei: await preIco.hardCapTxWei.call()
  };
  const c = ctx as any;
  if (c['SNPCICOStage1'].instance) {
    const ico = ctx.SNPCICOStage1.instance;
    (<any>data)['stage1'] = {
      address: ico.address,
      owner: await ico.owner.call(),
      teamWallet: await ico.teamWallet.call(),
      state: toIcoStateIdToName((await ico.state.call()) as any),
      weiCollected: await ico.collectedWei.call(),
      tokensSold: await ico.tokensSold.call(),
      investorCount: await ico.investorCount.call(),
      lowCapTokens: await ico.lowCapTokens.call(),
      hardCapTokens: await ico.hardCapTokens.call(),
      lowCapTxWei: await ico.lowCapTxWei.call(),
      hardCapTxWei: await ico.hardCapTxWei.call()
    };
  }
  if (c['SNPCICOStage2'].instance) {
    const ico = ctx.SNPCICOStage2.instance;
    (<any>data)['stage2'] = {
      address: ico.address,
      owner: await ico.owner.call(),
      teamWallet: await ico.teamWallet.call(),
      state: toIcoStateIdToName((await ico.state.call()) as any),
      weiCollected: await ico.collectedWei.call(),
      tokensSold: await ico.tokensSold.call(),
      investorCount: await ico.investorCount.call(),
      lowCapTokens: await ico.lowCapTokens.call(),
      hardCapTokens: await ico.hardCapTokens.call(),
      lowCapTxWei: await ico.lowCapTxWei.call(),
      hardCapTxWei: await ico.hardCapTxWei.call()
    };
  }
  if (c['SNPCICOStage3'].instance) {
    const ico = ctx.SNPCICOStage3.instance;
    (<any>data)['stage3'] = {
      address: ico.address,
      owner: await ico.owner.call(),
      teamWallet: await ico.teamWallet.call(),
      state: toIcoStateIdToName((await ico.state.call()) as any),
      weiCollected: await ico.collectedWei.call(),
      tokensSold: await ico.tokensSold.call(),
      investorCount: await ico.investorCount.call(),
      lowCapTokens: await ico.lowCapTokens.call(),
      hardCapTokens: await ico.hardCapTokens.call(),
      lowCapTxWei: await ico.lowCapTxWei.call(),
      hardCapTxWei: await ico.hardCapTxWei.call()
    };
  }
  console.log(JSON.stringify(data, null, 2));
};

/**
 * on Token group operations
 */
handlers['group'] = async () => {
  await checkEthNetwork();
  failIfNotDeployed('SNPCToken');
  const token = ctx.SNPCToken.instance;
  const wcmd = ctx.cmdOpts.shift();
  switch (wcmd) {
    case 'reserve': {
      await token.assignReserved(
          pullCmdArg('address'),
          tokenGroupToId(pullCmdArg('group') as any),
          new BigNumber(pullCmdArg('tokens')).mul('1e18')
      );
      break;
    }
    case 'reserved': {
      const group = pullCmdArg('group');
      const remaining = await token.getReservedTokens.call(tokenGroupToId(group as any));
      console.log(
          JSON.stringify({
                           group,
                           remaining
                         }, null, 2)
      );
      break;
    }
    default:
      throw new Error(`Unknown group sub-command: ${wcmd || ''}`);
  }
};

handlers['ico'] = async () => {
  await checkEthNetwork();
  const stage = ctx.cmdOpts.shift();
  let ico = ctx.SNPCPreICO.instance; // This value is not used, but suppress error noImplicitAny in 'terminate' branch
  let icoName = null;
  let icoPrev = null;
  let icoPrevName = null;
  failIfNotDeployed('SNPCToken');
  switch (stage) {
    case 'pre':
      failIfNotDeployed('SNPCPreICO');
      ico = ctx.SNPCPreICO.instance;
      icoName = 'SNPCPreICO';
      break;
    case 'stage1':
      failIfNotDeployed('SNPCICOStage1');
      ico = ctx.SNPCICOStage1.instance;
      icoName = 'SNPCICOStage1';
      icoPrev = ctx.SNPCPreICO.instance;
      icoPrevName = 'SNPCPreICO';
      break;
    case 'stage2':
      failIfNotDeployed('SNPCICOStage2');
      ico = ctx.SNPCICOStage2.instance;
      icoName = 'SNPCICOStage2';
      icoPrev = ctx.SNPCICOStage1.instance;
      icoPrevName = 'SNPCICOStage1';
      break;
    case 'stage3':
      failIfNotDeployed('SNPCICOStage3');
      ico = ctx.SNPCICOStage3.instance;
      icoName = 'SNPCICOStage3';
      icoPrev = ctx.SNPCICOStage2.instance;
      icoPrevName = 'SNPCICOStage2';
      break;
    default:
      throw new Error(`Unknown ico sub-command: ${stage || ''}`);
  }
  const wcmd = ctx.cmdOpts.shift();
  let end = null;
  switch (wcmd) {
    case 'state':
      console.log({
                    status: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'start':
      !!icoPrevName && failIfNotDeployed(icoPrevName as ContractName);
      end = moment.utc(pullCmdArg('end'));
      if (!end.unix() || end.isBefore(moment().utc())) {
        throw new Error('End date is before current time');
      }
      if (!!icoPrev) {
        const icoAddrCur = await ctx.SNPCToken.instance.ico.call();
        const icoPrevStatus = (new BigNumber(await icoPrev.state.call())).toNumber();
        if (icoAddrCur.toString().toLowerCase() !== icoPrev.address.toString().toLowerCase()) {
          throw new Error(`SNPCToken must use ${icoPrevName} address for deploy ${icoName}`);
        }
        if (icoPrevStatus === ICOState.Active ||
            icoPrevStatus === ICOState.Suspended ||
            icoPrevStatus === ICOState.Terminated) {
          throw new Error(`${icoPrevName} must be in Inactive, NotCompleted or Completed status`);
        }
      }
      console.log('Setting ICO for token...');
      await ctx.SNPCToken.instance.changeICO(ico.address);
      console.log(`Starting ICO. End ts: ${end.unix()} sec`);
      await ico.start(end.unix());
      console.log({
                    state: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'suspend':
      await ico.suspend();
      console.log({
                    state: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'resume':
      await ico.resume();
      console.log({
                    state: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'touch':
      await ico.touch();
      console.log({
                    status: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                  });
      break;
    case 'terminate':
      const icoStatus = (new BigNumber(await ico.state.call())).toNumber();
      if (icoStatus === ICOState.Terminated ||
          icoStatus === ICOState.NotCompleted ||
          icoStatus === ICOState.Completed) {
        throw new Error(`${icoName} must be in Inactive, Active or Suspend status`);
      }
      await confirm(`Terminate ${icoName}. Are you sure?`)
          .then(async () => {
            await ico.terminate();
            console.log({
                          state: toIcoStateIdToName(new BigNumber(await ico.state.call()))
                        });
          });
      break;
    case 'transfer-tokens':
      const fiatInvestor = pullCmdArg('addr');
      const amount = pullCmdArg('amount');
      await ico.transferTokens(fiatInvestor, amount);
      break;
    case 'investments':
      const investor = pullCmdArg('addr');
      const investments = await ico.getInvestments.call(investor);
      console.log({investments});
      break;
    case 'owner':
      await ico.transferOwnership(pullCmdArg('address'));
      break;
    case 'tune':
      end = moment.utc(pullCmdArg('end'));
      const lowcap = pullCmdArg('lowcap');
      const hardcap = pullCmdArg('hardcap');
      if (!end.unix() || end.isBefore(moment().utc())) {
        throw new Error('End date is before current time');
      }
      console.log(`${icoName} end ts: ${end.unix()} sec`);
      await ico.tune(end.unix(), new BigNumber(lowcap), new BigNumber(hardcap), 0, 0);
      const data = {};
      (<any>data)[stage] = {
        address: ico.address,
        owner: await ico.owner.call(),
        teamWallet: await ico.teamWallet.call(),
        state: toIcoStateIdToName((await ico.state.call()) as any),
        weiCollected: await ico.collectedWei.call(),
        lowCapTokens: await ico.lowCapTokens.call(),
        hardCapTokens: await ico.hardCapTokens.call(),
        lowCapTxWei: await ico.lowCapTxWei.call(),
        hardCapTxWei: await ico.hardCapTxWei.call()
      };
      console.log(JSON.stringify(data, null, 2));
      break;
    default:
      throw new Error(`Unknown ico sub-command: ${wcmd || ''}`);
  }
};

handlers['token'] = async () => {
  await checkEthNetwork();
  failIfNotDeployed('SNPCToken');
  const token = ctx.SNPCToken.instance;
  const wcmd = ctx.cmdOpts.shift();
  switch (wcmd) {
    case 'balance': {
      const tokensWithDecimals = await token.balanceOf.call(pullCmdArg('address'));
      const data = {
        tokens: new BigNumber(tokensWithDecimals).divToInt('1e18'),
        tokensWithDecimals
      };
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case 'lock':
      await token.lock();
      console.log({locked: await token.locked.call()});
      break;
    case 'unlock':
      await token.unlock();
      console.log({locked: await token.locked.call()});
      break;
    case 'locked':
      console.log({locked: await token.locked.call()});
      break;
    case 'burn-unsold':
      const icoAddr = await token.ico.call();
      let ico = null;
      let icoName = null;
      if (ctx.SNPCPreICO.instance.address.toString().toLowerCase() === icoAddr.toString().toLowerCase()) {
        ico = ctx.SNPCPreICO.instance;
        icoName = 'SNPCPreICO';
      }
      if (ctx.SNPCICOStage1.instance.address.toString().toLowerCase() === icoAddr.toString().toLowerCase()) {
        ico = ctx.SNPCICOStage1.instance;
        icoName = 'SNPCICOStage1';
      }
      if (ctx.SNPCICOStage2.instance.address.toString().toLowerCase() === icoAddr.toString().toLowerCase()) {
        ico = ctx.SNPCICOStage2.instance;
        icoName = 'SNPCICOStage2';
      }
      if (ctx.SNPCICOStage3.instance.address.toString().toLowerCase() === icoAddr.toString().toLowerCase()) {
        ico = ctx.SNPCICOStage3.instance;
        icoName = 'SNPCICOStage3';
      }
      if (!ico) {
        throw new Error(`SNPCToken use unknown contract address: ${icoAddr || ''}`);
      }
      const icoStatus = (new BigNumber(await ico.state.call())).toNumber();
      if (icoStatus === ICOState.Inactive ||
          icoStatus === ICOState.Active ||
          icoStatus === ICOState.Suspended) {
        throw new Error(`${icoName} must be in Terminated, NotCompleted or Completed status`);
      }
      await confirm("Burning of unsold tokens. Are you sure?")
          .then(async () => {
            await token.burnRemain();
            console.log({
                          totalSupply: await token.totalSupply.call(),
                          availableSupply: await token.availableSupply.call()
                        });
          });
      break;
    case 'ico': {
      const icoaddr = ctx.cmdOpts.shift();
      if (icoaddr) {
        await token.changeICO(icoaddr);
      }
      console.log({ico: await token.ico.call()});
      break;
    }
    default:
      throw new Error(`Unknown token sub-command: ${wcmd || ''}`);
  }
};

handlers['wl'] = async () => {
  await checkEthNetwork();
  const stage = ctx.cmdOpts.shift();
  let ico = null;
  switch (stage) {
    case 'pre':
      failIfNotDeployed('SNPCPreICO');
      ico = ctx.SNPCPreICO.instance;
      break;
    case 'stage1':
      failIfNotDeployed('SNPCICOStage1');
      ico = ctx.SNPCICOStage1.instance;
      break;
    case 'stage2':
      failIfNotDeployed('SNPCICOStage2');
      ico = ctx.SNPCICOStage2.instance;
      break;
    case 'stage3':
      failIfNotDeployed('SNPCICOStage3');
      ico = ctx.SNPCICOStage3.instance;
      break;
    default:
      throw new Error(`Unknown wl sub-command: ${stage || ''}`);
  }
  const wcmd = ctx.cmdOpts.shift();
  switch (wcmd) {
    case 'status': {
      console.log({
                    whitelistEnabled: await ico.whitelistEnabled.call()
                  });
      break;
    }
    case 'add': {
      await ico.whitelist(pullCmdArg('address'));
      console.log('Success');
      break;
    }
    case 'remove': {
      await ico.blacklist(pullCmdArg('address'));
      console.log('Success');
      break;
    }
    case 'disable': {
      await ico.disableWhitelist();
      console.log({
                    whitelistEnabled: await ico.whitelistEnabled.call()
                  });
      break;
    }
    case 'enable': {
      await ico.enableWhitelist();
      console.log({
                    whitelistEnabled: await ico.whitelistEnabled.call()
                  });
      break;
    }
    case 'is': {
      const addr = pullCmdArg('address');
      console.log({
                    address: addr,
                    whitelisted: await ico.whitelisted.call(addr)
                  });
      break;
    }
    default:
      throw new Error(`Unknown whitelist sub-command: ${wcmd || ''}`);
  }
};

// --------------------- Helpers

function pullCmdArg(name: string): address {
  const arg = ctx.cmdOpts.shift();
  if (!arg) {
    throw new Error(`Missing required ${name} argument for command`);
  }
  return arg;
}

// -------------------- Run

// Parse options
(function () {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; ++i) {
    const av = (args[i] = args[i].trim());
    if (av.charAt(0) !== '-') {
      if (ctx.cmd) {
        usage(`Command '${ctx.cmd}' already specified`);
      }
      ctx.cmd = av;
      ctx.cmdOpts = args.slice(i + 1);
      break;
    }
    if (av === '-h' || av === '--help') {
      usage();
    }
    if (av === '-v' || av === '--verbose') {
      ctx.verbose = true;
    }
    if (av === '-c' || av === '--config') {
      ctx.cfile = args[++i] || usage(`Missing '-c|--config' option value`);
    }
  }
  if (!ctx.cmd) {
    usage('No command specified');
  }
  if (!handlers[ctx.cmd]) {
    usage(`Invalid command specified: '${ctx.cmd}'`);
  }
  console.log(`Command: ${ctx.cmd} opts: `, ctx.cmdOpts);
})();

function usage(error?: string): never {
  console.error(
      'Usage: \n\tnode cli.js' +
      '\n\t[-c|--config <config yaml file>]' +
      '\n\t[-v|--verbose]' +
      '\n\t[-h|--help]' +
      '\n\t<command> [command options]' +
      '\nCommands:' +
      '\n\tdeploy                                       - Deploy SNPC token and Pre-ICO/ICO smart contracts' +
      '\n\tstatus                                       - Get contracts status' +
      '\n\tico <stage> state                            - Get ico state' +
      '\n\tico <stage> start <end>                      - Start ICO' +
      '\n\tico <stage> touch                            - Touch ICO. Recalculate ICO state based on current block time.' +
      '\n\tico <stage> suspend                          - Suspend ICO (only if ICO is Active)' +
      '\n\tico <stage> resume                           - Resume ICO (only if ICO is Suspended)' +
      '\n\tico <stage> terminate                        - Terminate ICO (can not be activate)' +
      '\n\tico <stage> transfer-tokens <addr> <amount>  - Transfer tokens to investor (fiat sales)' +
      '\n\tico <stage> investments <addr>               - Total investments from <addr>' +
      '\n\tico <stage> tune <end> <lowcap> <hardcap>    - Set end date/low-cap-tokens/hard-cap-tokens ' +
                                                      'for ICO (Only in suspended state)' +
      '\n\t                                         Eg: node ./cli.js ico pre tune ' +
                                                      '\'2018-03-20\' \'3000e18\' \'30000e18\'' +
      '\n\ttoken balance <addr>                  - Get token balance for address' +
      '\n\ttoken lock                            - Lock token contract (no token transfers are allowed)' +
      '\n\ttoken unlock                          - Unlock token contract' +
      '\n\ttoken locked                          - Get token lock status' +
      '\n\ttoken ico [addr]                      - Change ICO contract for token (if <addr> specified) ' +
                                                      'or view view current ICO contract for token' +
      '\n\ttoken burn-unsold                     - Burning of unsold tokens' +
      '\n\tgroup reserve <addr> <group> <tokens> - Reserve tokens (without decimals) to <addr> for <group>' +
      '\n\tgroup reserved <group>                - Get number of remaining tokens for <group>' +
      '\n\twl <stage> status                     - Check if whitelisting enabled' +
      '\n\twl <stage> add <addr>                 - Add <addr> to ICO whitelist' +
      '\n\twl <stage> remove <addr>              - Remove <addr> from ICO whitelist' +
      '\n\twl <stage> disable                    - Disable address whitelisting for ICO' +
      '\n\twl <stage> enable                     - Enable address whitelisting for ICO' +
      '\n\twl <stage> is <addr>                  - Check if given <addr> in whitelist' +
      '\n' +
      '\n\t\t <stage> - ICO Stage: pre|stage1|stage2|stage3' +
      '\n\t\t <group> - Token reservation group: team|bounty|partners|reserve' +
      '\n\t\t <addr> - Ethereum address' +
      '\n'
  );
  if (error) {
    console.error(error);
    process.exit(1);
  }
  process.exit();
  throw Error();
}

// Start
setup()
    .then(handlers[ctx.cmd])
    .then(() => {
      process.exit(0);
    })
    .catch(err => {
      if (err) {
        console.error(err);
      }
      process.exit(1);
    });
