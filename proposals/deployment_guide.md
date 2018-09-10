# Step-by-step start ICO for SNPC on Ethereum

## Requirements
* nodejs >= 8.9.x (https://nodejs.org/)
* yarn package manager (https://yarnpkg.com)
* parity ethereum client (https://www.parity.io/)
* latest version of SNPC project (https://github.com/Softmotions/SnapCoin)

# Precautions

All commands on server, especially parity, **MUST** be executed in screen session.
Connect to existent screen session:
```bash
screen -x
```
Create new screen session, if previous command say "There is no screen to be attached.":
```bash
screen
```

##Screen hotkeys

* Ctrl-a c - create new console
* Ctrl-a d - detach from screen session
* Ctrl-a n - switch screen session to next console, if any
* Ctrl-a p - switch screen session to previous console, if any

## Starting parity 

* Create owner account (the owner account and teamWallet must be different, for security reason)
```bash
:~$ parity account new
```
```
Please note that password is NOT RECOVERABLE.
Type password: 
Repeat password: 
...
```
Password **MUST** be unique. \
In last line command return created owner address
* Save typed password to the file \
(for exit press: 1) Ctrl-x 2) symbol 'y' 3) Enter)
```bash
:~$ nano ~/.owner.pass
```
* Restrict permissions for password file:
```bash
:~$ chmod 400 ~/.owner.pass
```
This part is common and required for execution commands for ICO.

Start `parity` in terminal and wait until sync complete
```bash
:~$ parity --geth --unlock <owner> --password ~/.owner.pass
```

## SNPC commands manual
All commands in this section must be executed in terminal from directory with project, e.g snap-coin-token.

### Usage syntax
```bash
node cli.js <command> [command options]
```
### Keys

* `<stage>` - ICO Stage: `pre|stage1|stage2|stage3`
* `<group>` - Token reservation group: `team|bounty|partners|reserve`
* `<addr>` - Ethereum address

### Commands

* `deploy`\
Deploy SNPC token and Pre-ICO/ICO smart contracts
* `status`\
Get contracts status
* `ico <stage> state`\
Get ico state
* `ico <stage> start <end>`\
Start ICO
* `ico <stage> touch`\
Touch ICO. Recalculate ICO state based on current block time.
* `ico <stage> suspend`\
Suspend ICO (only if ICO is Active)
* `ico <stage> resume`\
Resume ICO (only if ICO is Suspended)
* `ico <stage> terminate`\
Terminate ICO (can not be activate)
* `ico <stage> transfer-tokens <addr> <amount>`\
Transfer <amount> tokens to fiat-investor <addr>
* `ico <stage> investments <addr>`\
Total investments from <addr>
* `ico <stage> tune <end> <lowcap> <hardcap>`\
Set end date/low-cap/hard-cap for ICO (Only in suspended state).\
Eg: node ./cli.js ico pre tune '2018-09-20' '50e6' '500e6''
* `token balance <addr>`\
Get token balance for address
* `token lock`\
Lock token contract (no token transfers are allowed)
* `token unlock`\
Unlock token contract
* `token locked`\
Get token lock status
* `token ico [addr]`\
Change ICO contract for token (if addr specified) or view view current ICO contract for token
* `token burn-unsold`\
Burning of unsold tokens
* `group reserve <addr> <group> <tokens>`\
Reserve tokens (without decimals) to <addr> for <group>
* `group reserved <group>`\
Get number of remaining tokens for <group>
* `wl <stage> status`\
Check if whitelisting enabled
* `wl <stage> add <addr>`\
Add <addr> to ICO whitelist
* `wl <stage> remove <addr>`\
Remove <addr> from ICO whitelist
* `wl <stage> disable`\
Disable address whitelisting for ICO
* `wl <stage> enable`\
Enable address whitelisting for ICO
* `wl <stage> is <addr>`\
Check if given <addr> in whitelist
