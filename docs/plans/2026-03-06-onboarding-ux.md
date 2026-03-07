# Onboarding UX Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve first-time user journey by surfacing setup.sh as the recommended onboarding path, simplifying wallet creation, and automating npm/Node.js setup.

**Architecture:** Three files modified — SKILL.md (agent prompt logic), setup.sh (interactive flow), references/onboarding.md (agent-guided fallback). No new files, no new dependencies.

**Tech Stack:** Bash, Foundry `cast`, SKILL.md agent instructions

**Design doc:** `docs/plans/2026-03-06-onboarding-ux-design.md`

---

## Task 1: SKILL.md — Replace environment check failure branch

**Files:**
- Modify: `skills/xaut-trade/SKILL.md` lines 46–53

Current text to replace:
```
If **any fail**: do not continue with the original intent — run the setup script first:

```bash
bash "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts/setup.sh"
```

If `git rev-parse` fails, fall back to [references/onboarding.md](references/onboarding.md) for manual steps. After setup completes, re-run the original intent.
```

**Step 1: Edit SKILL.md**

Replace the "If any fail" block (lines 46–53) with:

```markdown
If **any fail**: do not continue with the original intent. Note which checks failed, then present the following options to the user (fill in [original intent] with a one-sentence summary of what the user originally asked for):

---
Environment not ready ([specific failing items]).

Please choose:

  **A) Recommended: run setup.sh manually**
  ```bash
  bash "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts/setup.sh"
  ```
  (If `git rev-parse` fails, use: `bash "$(find ~ -name "setup.sh" -path "*/xaut-trade/scripts/*" -maxdepth 8 2>/dev/null | head -1)"`)

  **B) Let the Agent guide you through setup step by step**

Once you finish option A, let me know and I'll continue your original request ([original intent]).

---

Wait for the user's reply:
- User chooses **A** or completes setup.sh and reports back → re-run all environment checks (steps 0–3); if all pass, continue original intent; if any still fail, report the specific item and show the options again
- User chooses **B** → load [references/onboarding.md](references/onboarding.md) and follow the agent-guided steps
```

**Step 2: Verify the edit looks correct**

Read lines 44–58 of SKILL.md and confirm the new block is in place and no surrounding text was disrupted.

**Step 3: Commit**

```bash
git add skills/xaut-trade/SKILL.md
git commit -m "feat(skill): show setup.sh option when environment check fails"
```

---

## Task 2: setup.sh — Password file handling before wallet creation

**Files:**
- Modify: `skills/xaut-trade/scripts/setup.sh`

This task moves password file creation to BEFORE wallet creation, and changes it from "skip if exists" to an interactive prompt with empty-file detection.

**Step 1: Locate the current password file step**

Read setup.sh lines 175–193. Note the current Step 4 logic.

**Step 2: Add password file handling as a new step before the wallet step**

Insert the following block AFTER the `step "Create global config directory"` section (after line 77 `ok "~/.aurehub ready"`) and BEFORE `step "Configure wallet keystore"` (line 79):

```bash
# ── Step 3: Keystore password file ─────────────────────────────────────────────
step "Prepare keystore password file"

if [ -f ~/.aurehub/.wallet.password ] && [ -s ~/.aurehub/.wallet.password ]; then
  ok "Password file already exists and is non-empty, skipping"
else
  if [ ! -f ~/.aurehub/.wallet.password ]; then
    touch ~/.aurehub/.wallet.password
    chmod 600 ~/.aurehub/.wallet.password
    ok "Password file created: ~/.aurehub/.wallet.password (permissions: 600)"
  else
    warn "Password file exists but is empty: ~/.aurehub/.wallet.password"
  fi

  echo -e "  ${BLUE}Why this is needed:${NC} The Agent signs transactions using your Foundry"
  echo -e "  keystore. The password is stored in a protected file (chmod 600) so the"
  echo -e "  Agent can unlock the keystore without the password appearing in shell history."
  echo -e "  Password will be saved to: ${BOLD}~/.aurehub/.wallet.password${NC}"
  echo
  read -rsp "  Enter your desired keystore password: " WALLET_PASSWORD
  echo
  if [ -z "$WALLET_PASSWORD" ]; then
    echo -e "  ${RED}❌ Password cannot be empty.${NC}"; exit 1
  fi
  printf '%s' "$WALLET_PASSWORD" > ~/.aurehub/.wallet.password
  chmod 600 ~/.aurehub/.wallet.password
  unset WALLET_PASSWORD
  ok "Password saved to ~/.aurehub/.wallet.password (permissions: 600)"
fi
```

**Step 3: Verify**

Read the modified section of setup.sh and confirm the new step appears in the right place between `~/.aurehub` creation and wallet creation. Step numbers in echo messages will be off — that's fine for now, fixed in Task 5.

**Step 4: Commit**

```bash
git add skills/xaut-trade/scripts/setup.sh
git commit -m "feat(setup): add password file preparation step before wallet creation"
```

---

## Task 3: setup.sh — Simplify wallet creation

**Files:**
- Modify: `skills/xaut-trade/scripts/setup.sh` (wallet step, currently Step 3, lines 79–173)

Replace the 4-option menu with a single path: create new wallet using the password file.

**Step 1: Read the current wallet block**

Read setup.sh lines 79–173. Note the full `if/else` block.

**Step 2: Replace the wallet creation else-branch**

Keep the outer `if cast wallet list ... already exists` check. Replace the entire `else` block (lines 85–172) with:

```bash
else
  echo -e "  No keystore account '${BOLD}$ACCOUNT_NAME${NC}' found. Generating a new wallet..."
  echo -e "  ${YELLOW}⚠ The private key will be displayed once. Save it to a secure location (e.g. password manager).${NC}"
  echo

  cast wallet new ~/.foundry/keystores "$ACCOUNT_NAME" \
    --unsafe-password "$(cat ~/.aurehub/.wallet.password)"

  ok "Keystore account '$ACCOUNT_NAME' created"
fi
```

**Step 3: Remove the old Step 4 (password file) block**

The old password file step (lines 175–193 in the original file, now shifted) is now handled in Task 2. Delete it entirely:
- Remove from `# ── Step 4: Password file` through `ok "Password file created: ~/.aurehub/.wallet.password (permissions: 600)"` (the fi closing the block).

**Step 4: Verify**

Run a quick syntax check:
```bash
bash -n skills/xaut-trade/scripts/setup.sh
```
Expected: no output (no syntax errors).

**Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/setup.sh
git commit -m "feat(setup): simplify wallet creation to single new-wallet path"
```

---

## Task 4: setup.sh — Auto npm install with Node.js detection and API key prompt

**Files:**
- Modify: `skills/xaut-trade/scripts/setup.sh` (npm/limit orders step, currently Step 7)

**Step 1: Read the current npm step**

Read the `step "Limit order dependencies"` block in setup.sh.

**Step 2: Replace the npm step**

Replace the entire block from `step "Limit order dependencies"` through the closing `fi` with:

```bash
# ── Step N: Limit order dependencies (npm + UniswapX API Key) ─────────────────
step "Limit order dependencies (npm + UniswapX API Key)"

_install_nodejs() {
  local suggestion=""
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &>/dev/null; then
      suggestion="brew install node"
    else
      suggestion="# Install Homebrew first: https://brew.sh\nbrew install node"
    fi
  elif command -v apt-get &>/dev/null; then
    suggestion="sudo apt install nodejs npm"
  elif command -v dnf &>/dev/null; then
    suggestion="sudo dnf install nodejs"
  elif command -v yum &>/dev/null; then
    suggestion="sudo yum install nodejs"
  else
    echo -e "  ${YELLOW}Could not detect package manager. Install Node.js >= 18 from: https://nodejs.org${NC}"
    return 1
  fi

  echo -e "  Node.js >= 18 is required for limit orders."
  echo -e "  Suggested install command:"
  echo -e "    ${BOLD}$(echo -e "$suggestion")${NC}"
  echo
  read -rp "  Run it now? [Y/n]: " RUN_NODE_INSTALL
  if [[ "${RUN_NODE_INSTALL:-}" =~ ^[Nn]$ ]]; then
    echo -e "  ${YELLOW}Skipped. Limit orders will not be available until Node.js >= 18 is installed.${NC}"
    return 1
  fi
  eval "$suggestion"
}

# Check Node.js
NODE_OK=false
if command -v node &>/dev/null; then
  NODE_MAJOR=$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')
  if [ "$NODE_MAJOR" -ge 18 ]; then
    ok "Node.js $(node --version)"
    NODE_OK=true
  else
    warn "Node.js version too old: $(node --version) (requires >= 18)"
    if _install_nodejs; then
      NODE_OK=true
    fi
  fi
else
  warn "Node.js not found"
  if _install_nodejs; then
    NODE_OK=true
  fi
fi

if [ "$NODE_OK" = true ]; then
  echo "  Installing npm packages..."
  cd "$SCRIPT_DIR" && npm install --silent
  ok "npm packages installed"

  # Prompt for UniswapX API Key inline
  echo
  echo -e "  ${BOLD}UniswapX API Key${NC} (required for limit orders, not needed for market orders)"
  echo -e "  Get one free (~5 min): ${BOLD}https://developers.uniswap.org/dashboard${NC}"
  echo -e "  Sign in with Google/GitHub → Generate Token (Free tier)"
  echo
  read -rp "  Enter API Key (or press Enter to skip): " UNISWAPX_KEY
  if [ -n "$UNISWAPX_KEY" ]; then
    # Remove any existing UNISWAPX_API_KEY line then append
    grep -v '^UNISWAPX_API_KEY=' ~/.aurehub/.env > /tmp/.env.tmp && mv /tmp/.env.tmp ~/.aurehub/.env || true
    echo "UNISWAPX_API_KEY=$UNISWAPX_KEY" >> ~/.aurehub/.env
    unset UNISWAPX_KEY
    ok "UNISWAPX_API_KEY saved to ~/.aurehub/.env"
  else
    ok "Skipped (add UNISWAPX_API_KEY to ~/.aurehub/.env later if needed)"
  fi
else
  warn "Limit orders unavailable (Node.js not installed). Re-run setup.sh after installing Node.js >= 18."
fi
```

**Step 3: Syntax check**

```bash
bash -n skills/xaut-trade/scripts/setup.sh
```
Expected: no output.

**Step 4: Commit**

```bash
git add skills/xaut-trade/scripts/setup.sh
git commit -m "feat(setup): auto-install npm deps, detect Node.js, prompt for UniswapX API key"
```

---

## Task 5: setup.sh — Fix step numbering and remove PATH notice from manual summary

**Files:**
- Modify: `skills/xaut-trade/scripts/setup.sh` (step labels and completion summary)

**Step 1: Read the current step labels and completion summary**

Read the full setup.sh to see the current step numbers and the manual steps summary at the end.

**Step 2: Renumber steps**

After Tasks 2–4, the steps are:
1. Check Foundry
2. Create ~/.aurehub
3. Prepare password file *(new)*
4. Configure wallet keystore
5. Read wallet address
6. Generate config files
7. Limit order dependencies *(changed)*
8. Activity rankings
9. Verify environment

Update the `step "..."` echo labels to match. The STEP counter is auto-incremented, so only the label strings need updating if they reference a step number explicitly.

**Step 3: Remove PATH refresh from manual steps summary**

In the completion summary section, remove the block:
```bash
echo -e "\n  ${BOLD}4. Refresh your terminal (only if Foundry was installed in this session)${NC}"
...
echo -e "     Or open a new terminal window."
```
Renumber the remaining items (1. Fund ETH, 2. Fund trading capital, 3. UniswapX API Key).

Also update item 3 (UniswapX API Key) to note it may already be done if user entered it during setup:
```bash
echo -e "\n  ${BOLD}3. Get a UniswapX API Key (limit orders only — skip if you already entered one above)${NC}"
```

**Step 4: Syntax check**

```bash
bash -n skills/xaut-trade/scripts/setup.sh
```

**Step 5: Commit**

```bash
git add skills/xaut-trade/scripts/setup.sh
git commit -m "fix(setup): renumber steps, remove PATH refresh from manual summary"
```

---

## Task 6: references/onboarding.md — Update wallet section for agent-guided flow

**Files:**
- Modify: `skills/xaut-trade/references/onboarding.md`

**Step 1: Read the current onboarding.md**

Read `skills/xaut-trade/references/onboarding.md` in full.

**Step 2: Replace Step 2 (Wallet Setup)**

Replace the entire `## Step 2: Wallet Setup` section with:

```markdown
## Step 2: Prepare Password File

Before creating the wallet, the password file must exist and have content.

Check if `~/.aurehub/.wallet.password` exists and is non-empty:

```bash
[ -s ~/.aurehub/.wallet.password ] && echo "ready" || echo "missing or empty"
```

If missing or empty, instruct the user to run in their terminal (password will not appear in chat):

```
Please run the following in your terminal (input is hidden):

  read -rsp "Keystore password: " p && \
  printf '%s' "$p" > ~/.aurehub/.wallet.password && \
  chmod 600 ~/.aurehub/.wallet.password

Tell me when done.
```

Wait for user confirmation, then verify:

```bash
[ -s ~/.aurehub/.wallet.password ] && echo "ready" || echo "still empty"
```

If still empty → repeat the prompt.

---

## Step 3: Wallet Setup

**Auto-detect**: if `aurehub-wallet` already exists in the keystore, skip this step.

```bash
cast wallet list 2>/dev/null | grep -qF "aurehub-wallet" && echo "exists" || echo "missing"
```

If missing, create a new wallet using the password file:

```bash
cast wallet new ~/.foundry/keystores aurehub-wallet \
  --unsafe-password "$(cat ~/.aurehub/.wallet.password)"
```

> ⚠️ The private key is shown only once. Ask the user to save it to a secure location before continuing.

**Auto-fetch wallet address**:

```bash
source ~/.aurehub/.env
WALLET_ADDRESS=$(cast wallet address --account aurehub-wallet --password-file ~/.aurehub/.wallet.password)
echo "Wallet address: $WALLET_ADDRESS"
```
```

**Step 3: Update step numbers for the remaining sections**

The original Step 2 was Wallet Setup, which is now Steps 2–3. Renumber:
- Old Step 3 (Generate Config Files) → Step 4
- Old Step 4 (Verify) → Step 5

Update the `## Step N:` headings accordingly.

**Step 4: Commit**

```bash
git add skills/xaut-trade/references/onboarding.md
git commit -m "feat(onboarding): update wallet flow — password file first, single new-wallet path"
```

---

## Task 7: Manual smoke test

No automated tests exist for shell scripts or agent instruction files. Verify manually:

**Scenario A: setup.sh fresh run (no existing config)**

```bash
# In a temp environment or by temporarily moving ~/.aurehub aside
mv ~/.aurehub ~/.aurehub.bak
bash skills/xaut-trade/scripts/setup.sh
```

Expected flow:
1. Foundry check passes (or installs)
2. `~/.aurehub` created
3. Prompted for keystore password → enters password → file created at `~/.aurehub/.wallet.password`
4. Wallet created, private key displayed
5. `.env` generated with RPC prompt
6. `config.yaml` copied
7. Node.js check → npm install → UniswapX API key prompt
8. Activity rankings prompt
9. Verification passes
10. Summary shows 3 manual steps (ETH, trading capital, API key if skipped)

```bash
# Restore
mv ~/.aurehub.bak ~/.aurehub
```

**Scenario B: setup.sh re-run (all config exists)**

```bash
bash skills/xaut-trade/scripts/setup.sh
```

Expected: all steps show `✓ ... already exists, skipping`. No prompts except npm/API key if node_modules missing.

**Scenario C: SKILL.md — environment check failure prompt**

Temporarily rename `~/.aurehub/.env` to simulate failure:
```bash
mv ~/.aurehub/.env ~/.aurehub/.env.bak
```

Send any trade intent to the agent (e.g. "buy XAUT with 100 USDT").

Expected: agent outputs the two-option prompt (A/B) mentioning the original intent. Does NOT try to run setup.sh automatically.

```bash
mv ~/.aurehub/.env.bak ~/.aurehub/.env
```

**Step: Commit if any fixes were needed**

```bash
git add -p
git commit -m "fix(onboarding): smoke test corrections"
```
