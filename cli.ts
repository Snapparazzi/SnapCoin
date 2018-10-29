global.Promise = require('bluebird');
import Ajv = require('ajv');
import fs = require('fs');
import net = require('net');
import path = require('path');
import {Strings} from './lib/utils';
import * as Web3 from 'web3';
import {address, IContract} from './globals';
import {ISNPCToken} from './contracts';
import {ICliConfig} from './cli.schema';
import {tokenGroupToId} from './lib/w3contracts/utils';
import * as BigNumber from 'bignumber.js';
import readline = require('readline');

type ContractName = 'SNPCToken';

const ctx = {
  contractNames: ['SNPCToken'],
  cmdOpts: new Array<string>(),
  verbose: false,
  cfile: 'cli.yml',
  SNPCToken: {},
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

function deleteDeployedContractAddress(contract: string) {
  const p = path.join(ctx.cfg.ethereum.lockfilesDir, `${contract}.lock`);
  fs.unlinkSync(p);
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

function confirm(question: string, validAnswer: string): Promise<void> {
  return new Promise((resolve, reject) => {
    rl.question(question, (answer) => {
      if (answer === validAnswer) {
        resolve();
      } else {
        reject();
      }
      rl.close();
    });
  });
}

function signSelfdestruct(contractAddress: string): Promise<any> {
  return new Promise(function (res, rej) {
    const message = Buffer.from('Signed for Selfdestruct').toString('hex') // convert to hex
                    + contractAddress.replace(/^0x/, '')
                    + ctx.cfg.ethereum.from.replace(/^0x/, '');

    const hash = ctx.web3.sha3(message, {encoding: 'hex'});
    const signature = ctx.web3.eth.sign(ctx.cfg.ethereum.from, hash).slice(2);
    if (!!signature) {
      res({
            v: Number(signature.substring(128, 130)) + 27,
            r: '0x' + signature.substring(0, 64),
            s: '0x' + signature.substring(64, 128),
          });
    } else {
      console.error('\x1b[41m%s\x1b[37m', 'Could not sign message for address:', '\x1b[0m', contractAddress);
    }
    rej(null);
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
        icfg.reservedAdvisorsTokens,
        icfg.reservedReserveTokens,
        icfg.reservedStackingBonusTokens,
        {
          from: ctx.cfg.ethereum.from
        }
    );
    console.log(`SNPCToken successfully deployed at: ${ctx.SNPCToken.instance.address}\n\n`);
    writeDeployedContractAddress('SNPCToken', ctx.SNPCToken.instance.address);
  }
};

/**
 * Show status info
 */
handlers['status'] = async () => {
  await checkEthNetwork();
  failIfNotDeployed('SNPCToken');
  const token = ctx.SNPCToken.instance;
  const data = {};
  (<any>data)['token'] = {
    address: token.address,
    owner: await token.owner.call(),
    symbol: await token.symbol.call(),
    totalSupply: await token.totalSupply.call(),
    locked: await token.locked.call()
  };
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
    case 'burn':
      await confirm("Burning of unsold tokens. Are you sure? (yes/no)", "yes")
          .then(async () => {
            await token.burnTokens(new BigNumber(pullCmdArg('tokens')).mul('1e18'));
            console.log({
                          totalSupply: await token.totalSupply.call(),
                          balance: await token.balanceOf.call(ctx.cfg.ethereum.from)
                        });
          });
      break;
    case 'selfdestruct':
      await confirm("This action start selfdestruct on token contract. " +
                    "Are you sure? (YES, I want to destroy token contract/no) ",
                    "YES, I want to destroy token contract")
          .then(async () => {
            const vrs = await signSelfdestruct(token.address);
            if (vrs != null) {
              await token.selfDestruct(vrs.v, vrs.r, vrs.s);
              deleteDeployedContractAddress('ENCNToken');
            }
          });
      break;
    default:
      throw new Error(`Unknown token sub-command: ${wcmd || ''}`);
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
      '\n\tdeploy                                       - Deploy SNPC token smart contract' +
      '\n\tstatus                                       - Get contracts status' +
      '\n\ttoken balance <addr>                  - Get token balance for address' +
      '\n\ttoken lock                            - Lock token contract (no token transfers are allowed)' +
      '\n\ttoken unlock                          - Unlock token contract' +
      '\n\ttoken locked                          - Get token lock status' +
      '\n\ttoken burn <tokens>                   - Burning of tokens (without decimals) on current wallet' +
      '\n\ttoken selfdestruct                    - Destroy token contract in ethereum network (can be undone)' +
      '\n\tgroup reserve <addr> <group> <tokens> - Reserve tokens (without decimals) to <addr> for <group>' +
      '\n\tgroup reserved <group>                - Get number of remaining tokens for <group>' +
      '\n' +
      '\n\t\t <group> - Token reservation group: team|bounty|advisors|reserve|stackingBonus' +
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
