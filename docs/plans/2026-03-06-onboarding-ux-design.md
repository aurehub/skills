# Onboarding UX Improvement Design

Date: 2026-03-06

## Problem

When the environment is not ready, the agent falls into agent-guided onboarding without clearly
offering the setup.sh option first. setup.sh provides a better interactive experience but is not
prominently surfaced.

## Goals

- Surface setup.sh as the recommended onboarding path when environment checks fail
- Simplify the wallet creation flow (new wallet only, no "open new terminal" interruption)
- Automate as much of setup.sh as possible, minimizing manual steps

## Solution: Option A only — modify SKILL.md + setup.sh + onboarding.md

Minimal change set: no new files, no new abstractions.

---

## Design

### 1. SKILL.md — Environment Check Failure Branch

**Current behavior**: when any environment check fails, immediately run setup.sh.

**New behavior**: present two options and wait for user choice.

```
Environment not ready ([specific failing items]).

Please choose:

  A) Recommended: run setup.sh manually
     bash "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts/setup.sh"

  B) Let the Agent guide you through setup step by step

Once you finish option A, let me know and I'll continue your original request ([original intent summary]).
```

**After user completes setup.sh and replies**:
- Re-run all environment checks
- Pass → continue original intent
- Fail → report specific failing item, show options again

**If user chooses Option B**:
- Continue with existing `references/onboarding.md` flow (updated per section 3 below)

---

### 2. setup.sh — Changes

#### 2a. Password file handling (new, before wallet creation)

Check `~/.aurehub/.wallet.password` before wallet creation:
- Does not exist → `touch ~/.aurehub/.wallet.password && chmod 600` (create empty placeholder)
- Exists but empty → print error, exit with instructions to fill it
- Exists and non-empty → proceed

Prompt for password interactively (hidden input), write to file:
```bash
read -rsp "Enter keystore password: " WALLET_PASSWORD
echo
printf '%s' "$WALLET_PASSWORD" > ~/.aurehub/.wallet.password
chmod 600 ~/.aurehub/.wallet.password
unset WALLET_PASSWORD
```

#### 2b. Wallet creation — simplified

Remove the 4-option menu (import / generate / already done / skip).

New behavior when `aurehub-wallet` does not exist:
- Use password file to create wallet in one command (no new terminal required):
```bash
cast wallet new ~/.foundry/keystores aurehub-wallet \
  --unsafe-password "$(cat ~/.aurehub/.wallet.password)"
```
- Display the generated private key output and remind user to save it (shown only once)

When `aurehub-wallet` already exists → skip.

All existing files skip-if-exists behavior is preserved (`.env`, `config.yaml`, password file).

#### 2c. npm dependencies — automatic

Remove the `[y/N]` prompt. Auto-install based on Node.js availability:

- Node.js >= 18 found → `npm install` silently, then prompt for UniswapX API Key
- Node.js not found or version < 18 → detect platform, show install command, ask to run it:
  ```
  Node.js >= 18 not found. Limit orders require Node.js.

  Detected: macOS with Homebrew
  Suggested install command:
    brew install node

  Run it now? [Y/n]:
  ```
  Platform detection:
  - macOS + Homebrew → `brew install node`
  - Ubuntu/Debian → `sudo apt install nodejs`
  - Fedora/RHEL → `sudo dnf install nodejs`
  - Other → link to https://nodejs.org

  User selects Y → auto-run; N → skip with note "limit orders unavailable"

#### 2d. UniswapX API Key — prompt inline with npm step

After npm install succeeds, immediately prompt:
```
  Get your UniswapX API Key (free, ~5 min):
    https://developers.uniswap.org/dashboard
  Enter API Key (or press Enter to skip):
```
If provided → append `UNISWAPX_API_KEY=<key>` to `~/.aurehub/.env`.
If skipped → no-op; runtime hard-stop will prompt when limit order is attempted.

#### 2e. PATH refresh notice — removed

Foundry installer already writes to `~/.zshrc`/`~/.bashrc`. New terminal sessions pick it up
automatically. The agent uses new subprocesses each time so it's unaffected. No manual step needed.

---

### 3. references/onboarding.md — Wallet Section Update

**Current**: Case A (import existing key) + Case B (generate new wallet), both requiring a new terminal window.

**New**:
- Remove Case A (import existing key)
- Single path: create new wallet using password file
- Password file step comes before wallet creation

**Agent-guided password handling** (Option B in SKILL.md):

Agent cannot do hidden interactive input. Instead, agent instructs user to run in terminal:
```bash
read -rsp "Keystore password: " p && \
printf '%s' "$p" > ~/.aurehub/.wallet.password && \
chmod 600 ~/.aurehub/.wallet.password
```
Agent waits for user confirmation, then proceeds.

**Wallet creation command** (same for both setup.sh and agent-guided):
```bash
cast wallet new ~/.foundry/keystores aurehub-wallet \
  --unsafe-password "$(cat ~/.aurehub/.wallet.password)"
```

---

## Remaining Manual Steps (cannot be automated)

| Step | Reason |
|------|--------|
| Enter keystore password | Credential — must come from user |
| Enter UniswapX API Key | Requires visiting Uniswap developer portal |
| Fund wallet with ETH | On-chain transfer — agent cannot move funds |
| Fund wallet with USDT/XAUT | On-chain transfer — agent cannot move funds |

---

## Files Changed

| File | Change |
|------|--------|
| `skills/xaut-trade/SKILL.md` | Environment check failure → show options A/B, resume original intent after user confirms |
| `skills/xaut-trade/scripts/setup.sh` | Password file check, simplified wallet creation, auto npm install + Node.js detection, inline API key prompt, remove PATH notice |
| `skills/xaut-trade/references/onboarding.md` | Remove import-key option, add password file step, use new `cast wallet new` command, add agent-guided password instruction |
