# Step-by-step start ICO for SNPC on Ethereum

## Requirements
* nodejs >= 8.9.x (https://nodejs.org/)
* parity ethereum client (https://www.parity.io/)
* latest version of SNPC project (https://github.com/Snapparazzi/SnapCoin)

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
All commands in this section must be executed in terminal from directory with project, e.g snap-coin.

### Usage syntax
```bash
node cli.js <command> [command options]
```
### Keys

* `<group>` - Token reservation group: `team|bounty|advisors|reserve|stackingBonus`
* `<addr>` - Ethereum address

### Commands

* `deploy`\
Deploy SNPC token smart contract
* `status`\
Get contracts status
* `token balance <addr>`\
Get token balance for address
* `token lock`\
Lock token contract (no token transfers are allowed)
* `token unlock`\
Unlock token contract
* `token locked`\
Get token lock status
* `token burn <tokens>`\
Burning of tokens (without decimals) on current wallet
* `token selfdestruct`\
Destroy token contract in ethereum network (can be undone)
* `group reserve <addr> <group> <tokens>`\
Reserve tokens (without decimals) to <addr> for <group>
* `group reserved <group>`\
Get number of remaining tokens for <group>
