# Security Audit Fixes Design

**Date**: 2026-03-06
**Trigger**: skills.sh Agent Trust Hub flagged xaut-trade as HIGH risk (DATA_EXFILTRATION, REMOTE_CODE_EXECUTION, COMMAND_EXECUTION, EXTERNAL_DOWNLOADS)
**P0 (done)**: Changed `http://xaue.com` → `https://xaue.com` in SKILL.md (commit 5aaef94)

## P1: Post-Trade Registration — Opt-out → Opt-in

### Problem

After each trade, the skill asks the user for a nickname and POSTs wallet address + nickname to `https://xaue.com/api/rankings/participants`. The user can say "skip" (opt-out), but the default behavior is to prompt — flagged as DATA_EXFILTRATION.

### Design

Move the registration decision to the onboarding phase (`setup.sh`). Default to not sending any data.

#### Change 1: `setup.sh` — new Step 8 (Activity Rankings)

Insert after current Step 7 (npm dependencies), before verification:

- Ask: "Would you like to join the XAUT trade activity rankings? This will share your wallet address and nickname with https://xaue.com. You can change this anytime by editing ~/.aurehub/.env"
- Yes → prompt for nickname, write `RANKINGS_OPT_IN=true` and `NICKNAME=<value>` to `~/.aurehub/.env`
- No → write `RANKINGS_OPT_IN=false` to `~/.aurehub/.env`

Current Step 8 (verification) becomes Step 9.

#### Change 2: `SKILL.md` — rewrite Post-Trade Registration

Replace current logic (ask after trade) with:

1. `source ~/.aurehub/.env`
2. If `RANKINGS_OPT_IN` != `"true"` → silent skip, no prompt
3. If `RANKINGS_OPT_IN` == `"true"` and `.registered` file exists → skip
4. If `RANKINGS_OPT_IN` == `"true"` and not registered → use `NICKNAME` from `.env`, call API, write `.registered`

Never ask the user during the trade flow.

#### Change 3: `.env.example` and `onboarding.md`

- `.env.example`: add commented `# RANKINGS_OPT_IN=false` and `# NICKNAME=YourName`
- `onboarding.md`: add manual equivalent of the setup.sh step

## P2: Security & Privacy Disclosure

### Problem

No documentation of external communications. Auditors and users cannot assess what data leaves the machine.

### Design

#### Change 4: `README.md` — new "Security & Privacy" section

Add before FAQ. Table listing all 5 external services:

| Service | When | Data Sent |
|---------|------|-----------|
| foundry.paradigm.xyz | First setup | Downloads/executes Foundry installer (`curl \| bash`) |
| npmjs.com | Limit order setup | Downloads Node.js dependencies |
| Ethereum RPC (configurable) | Every trade | On-chain calls (wallet address, tx data) |
| UniswapX API (api.uniswap.org) | Limit orders | Order data, wallet address |
| xaue.com Rankings API | Opt-in only | Wallet address, nickname |

Plus notes on: Foundry source review recommendation, opt-in rankings, HTTPS-only.

#### Change 5: `SKILL.md` — brief external communications notice

Add between "When to Use" and "Environment Readiness Check":

> This skill connects to external services (Ethereum RPC, UniswapX API, and optionally xaue.com rankings). On first setup, it may install Foundry via `curl | bash`. Inform the user before executing any external communication for the first time. See the README for a full list.

## Files Changed

| File | Change |
|------|--------|
| `skills/xaut-trade/scripts/setup.sh` | New Step 8 (rankings opt-in) |
| `skills/xaut-trade/SKILL.md` | Rewrite Post-Trade Registration + add External Communications notice |
| `skills/xaut-trade/README.md` | Add Security & Privacy section |
| `skills/xaut-trade/.env.example` | Add RANKINGS_OPT_IN and NICKNAME comments |
| `skills/xaut-trade/references/onboarding.md` | Add manual rankings opt-in step |
