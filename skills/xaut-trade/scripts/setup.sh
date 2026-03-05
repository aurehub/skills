#!/usr/bin/env bash
# xaut-trade environment setup
# Usage: bash skills/xaut-trade/scripts/setup.sh
#
# Exit codes:
#   0 — all automated steps complete; check the manual steps summary at the end
#   1 — a step failed; error message printed, see references/onboarding.md
#   2 — environment prerequisite missing (e.g. Node.js not installed); re-run after fixing

set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

STEP=0

step()   { STEP=$((STEP+1)); echo -e "\n${BLUE}${BOLD}[${STEP}] $1${NC}"; }
ok()     { echo -e "  ${GREEN}✓ $1${NC}"; }
warn()   { echo -e "  ${YELLOW}⚠ $1${NC}"; }
manual() {
  echo -e "\n  ${YELLOW}${BOLD}┌─ Manual action required ────────────────────────────────┐${NC}"
  while IFS= read -r line; do
    echo -e "  ${YELLOW}│${NC} $line"
  done <<< "$1"
  echo -e "  ${YELLOW}${BOLD}└─────────────────────────────────────────────────────────┘${NC}\n"
}

trap 'echo -e "\n${RED}❌ Step ${STEP} failed.${NC}\nSee references/onboarding.md for manual instructions, then re-run this script."; exit 1' ERR

# ── Locate skill directory from the script's own path ──────────────────────────
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SKILL_DIR=$(dirname "$SCRIPT_DIR")    # skills/xaut-trade/
ACCOUNT_NAME="aurehub-wallet"

echo -e "\n${BOLD}xaut-trade environment setup${NC}"
echo "Skill directory: $SKILL_DIR"

# ── Step 1: Foundry ────────────────────────────────────────────────────────────
step "Check Foundry (cast)"

if command -v cast &>/dev/null; then
  ok "Foundry already installed: $(cast --version | head -1)"
else
  # S1: disclose what is about to run before executing curl|bash
  echo -e "\n  ${YELLOW}Foundry (cast) is not installed.${NC}"
  echo -e "  About to download and run the official Foundry installer from foundry.paradigm.xyz"
  echo -e "  Source: https://github.com/foundry-rs/foundry"
  echo
  read -rp "  Proceed with installation? [Y/n]: " CONFIRM_FOUNDRY
  if [[ "${CONFIRM_FOUNDRY:-}" =~ ^[Nn]$ ]]; then
    echo -e "  Skipped. Install Foundry manually: https://book.getfoundry.sh/getting-started/installation"
    exit 1
  fi
  echo "  Installing Foundry..."
  curl -L https://foundry.paradigm.xyz | bash

  # foundryup may not be in PATH yet; add it temporarily for this session
  export PATH="$HOME/.foundry/bin:$PATH"
  foundryup

  manual "Reason: Foundry writes itself to ~/.foundry/bin and appends to ~/.zshrc
(or ~/.bashrc), but the current terminal's PATH is not refreshed automatically.
The script has temporarily added Foundry to this session's PATH so setup can
continue without interruption.

After setup finishes, refresh your shell so 'cast' works in new terminals:
  $ source ~/.zshrc    # zsh users
  $ source ~/.bashrc   # bash users
Or open a new terminal window."
fi

# ── Step 2: Global config directory ───────────────────────────────────────────
step "Create global config directory ~/.aurehub"
mkdir -p ~/.aurehub
ok "~/.aurehub ready"

# ── Step 3: Wallet keystore ────────────────────────────────────────────────────
step "Configure wallet keystore"

if cast wallet list 2>/dev/null | grep -qF "$ACCOUNT_NAME"; then
  ok "Keystore account '$ACCOUNT_NAME' already exists, skipping"
else
  echo -e "  No keystore account '$ACCOUNT_NAME' found. Choose an option:"
  echo -e "    ${BOLD}1)${NC} Import an existing private key"
  echo -e "    ${BOLD}2)${NC} Generate a brand-new wallet"
  echo -e "    ${BOLD}3)${NC} I already ran 'cast wallet import $ACCOUNT_NAME' (just verify)"
  read -rp "  Enter 1, 2, or 3: " WALLET_CHOICE

  case "$WALLET_CHOICE" in
    1)
      # U2/U3: explicit "open a new terminal" + PATH reminder
      manual "Security reason: private keys must not be passed as command-line arguments —
they get stored in shell history (~/.zsh_history / ~/.bash_history).
Using --interactive mode, the key is entered without echo and never logged.

Open a NEW terminal tab or window, then run:

  # If 'cast' is not found, first run:
  source ~/.zshrc       # zsh users
  source ~/.bashrc      # bash users

  $ cast wallet import $ACCOUNT_NAME --interactive
    → Paste your private key when prompted (input is hidden)
    → Set a keystore password and remember it — needed in the next step

Return to this terminal when done."

      # U4: retry loop — keep checking until account actually exists
      while ! cast wallet list 2>/dev/null | grep -qF "$ACCOUNT_NAME"; do
        echo -e "  ${YELLOW}Account '$ACCOUNT_NAME' not found yet.${NC}"
        read -rp "  Press Enter to check again, or type 'abort' to exit: " RETRY_INPUT
        if [[ "${RETRY_INPUT:-}" == "abort" ]]; then
          echo -e "  ${RED}Aborted.${NC}"; exit 1
        fi
      done
      ;;
    2)
      manual "Security reason: the private key appears only once and must be saved by you
(a password manager is recommended). The script must not store or log it.

Open a NEW terminal tab or window, then run these two commands in order:

  # If 'cast' is not found, first run:
  source ~/.zshrc       # zsh users
  source ~/.bashrc      # bash users

  $ cast wallet new                                  # note down the private key output
  $ cast wallet import $ACCOUNT_NAME --interactive   # import it and set a password
    → Remember the password — it is needed in the next step

Return to this terminal when done."

      # U4: retry loop
      while ! cast wallet list 2>/dev/null | grep -qF "$ACCOUNT_NAME"; do
        echo -e "  ${YELLOW}Account '$ACCOUNT_NAME' not found yet.${NC}"
        read -rp "  Press Enter to check again, or type 'abort' to exit: " RETRY_INPUT
        if [[ "${RETRY_INPUT:-}" == "abort" ]]; then
          echo -e "  ${RED}Aborted.${NC}"; exit 1
        fi
      done
      ;;
    3)
      # User claims it is already done — verify
      if ! cast wallet list 2>/dev/null | grep -qF "$ACCOUNT_NAME"; then
        echo -e "  ${RED}❌ Account '$ACCOUNT_NAME' not found.${NC}"
        echo -e "  Run 'cast wallet list' to confirm. If the account is missing, re-run"
        echo -e "  this script and choose option 1 or 2."
        exit 1
      fi
      ;;
    *)
      echo -e "  ${RED}Invalid choice, exiting.${NC}"; exit 1
      ;;
  esac

  ok "Keystore account '$ACCOUNT_NAME' is ready"
fi

# ── Step 4: Password file ──────────────────────────────────────────────────────
step "Create keystore password file"

if [ -f ~/.aurehub/.wallet.password ]; then
  ok "Password file already exists, skipping"
else
  # U5: explain why the password file is needed
  echo -e "  ${BLUE}Why this is needed:${NC} The Agent signs transactions using your Foundry"
  echo -e "  keystore. Storing the password in a protected file (chmod 600) lets the"
  echo -e "  Agent unlock the keystore automatically — the password never appears in"
  echo -e "  shell history or any log file."
  echo
  read -rsp "  Enter the keystore password you set during 'cast wallet import': " WALLET_PASSWORD
  echo
  printf '%s' "$WALLET_PASSWORD" > ~/.aurehub/.wallet.password
  chmod 600 ~/.aurehub/.wallet.password
  unset WALLET_PASSWORD
  ok "Password file created: ~/.aurehub/.wallet.password (permissions: 600)"
fi

# ── Step 5: Read wallet address ────────────────────────────────────────────────
step "Read wallet address"

# U6: distinguish wrong password vs other errors
WALLET_ADDRESS=""
if ! WALLET_ADDRESS=$(cast wallet address \
    --account "$ACCOUNT_NAME" \
    --password-file ~/.aurehub/.wallet.password 2>/tmp/xaut_cast_err); then
  CAST_ERR=$(cat /tmp/xaut_cast_err 2>/dev/null || true)
  echo -e "  ${RED}❌ Could not read wallet address.${NC}"
  if echo "$CAST_ERR" | grep -qiE "password|decrypt|mac mismatch|invalid|wrong"; then
    echo -e "  Likely cause: the password in ~/.aurehub/.wallet.password does not match"
    echo -e "  the password set during 'cast wallet import'."
    echo -e "  To fix: delete the password file and re-run this script to enter the correct one."
    echo -e "    \$ rm ~/.aurehub/.wallet.password && bash \"$0\""
  elif echo "$CAST_ERR" | grep -qiE "not found|no such file|keystore"; then
    echo -e "  Likely cause: keystore file for '$ACCOUNT_NAME' is missing."
    echo -e "  Run 'cast wallet list' to check available accounts."
  else
    echo -e "  Details: $CAST_ERR"
    echo -e "  Run 'cast wallet list' to confirm the account exists."
  fi
  exit 1
fi
ok "Wallet address: $WALLET_ADDRESS"

# ── Step 6: Generate config files ─────────────────────────────────────────────
step "Generate config files"

if [ -f ~/.aurehub/.env ]; then
  ok ".env already exists, skipping (delete it and re-run to reset)"
else
  DEFAULT_RPC="https://eth.llamarpc.com"
  echo -e "  Ethereum RPC URL (press Enter to use the free public node):"
  echo -e "  Default: ${BOLD}$DEFAULT_RPC${NC}"
  echo -e "  Tip: Alchemy or Infura private nodes are more reliable. You can change"
  echo -e "  ETH_RPC_URL at any time by editing ~/.aurehub/.env"
  read -rp "  ETH_RPC_URL: " INPUT_RPC
  ETH_RPC_URL="${INPUT_RPC:-$DEFAULT_RPC}"

  cat > ~/.aurehub/.env << EOF
ETH_RPC_URL=$ETH_RPC_URL
FOUNDRY_ACCOUNT=$ACCOUNT_NAME
KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password
WALLET_ADDRESS=$WALLET_ADDRESS
# Required for limit orders only:
# UNISWAPX_API_KEY=your_api_key_here
# Optional — set automatically on first trade if omitted:
# NICKNAME=YourName
EOF
  ok ".env generated (RPC: $ETH_RPC_URL)"
fi

if [ -f ~/.aurehub/config.yaml ]; then
  ok "config.yaml already exists, skipping"
else
  cp "$SKILL_DIR/config.example.yaml" ~/.aurehub/config.yaml
  ok "config.yaml generated (defaults are ready to use)"
fi

# ── Step 7: npm dependencies (limit orders, optional) ─────────────────────────
step "Limit order dependencies (optional — not needed for market buy/sell)"

read -rp "  Install npm packages for limit order support? [y/N]: " INSTALL_LIMIT
if [[ "${INSTALL_LIMIT:-}" =~ ^[Yy]$ ]]; then
  if ! command -v node &>/dev/null; then
    manual "Node.js (>= 18) is required for limit orders.
Install it, then re-run this script:
  macOS:  brew install node
  Linux:  https://nodejs.org/en/download/package-manager"
    exit 2
  fi

  NODE_MAJOR=$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')
  if [ "$NODE_MAJOR" -lt 18 ]; then
    warn "Node.js version too old: $(node --version) (requires >= 18)"
    manual "Upgrade Node.js, then re-run this script:
  https://nodejs.org/en/download/package-manager"
    exit 2
  fi

  ok "Node.js $(node --version)"
  echo "  Installing npm packages..."
  cd "$SCRIPT_DIR" && npm install --silent
  ok "npm packages installed"
else
  echo "  Skipped"
fi

# ── Step 8: Verification ───────────────────────────────────────────────────────
step "Verify environment"

# shellcheck source=/dev/null
source ~/.aurehub/.env

cast --version | head -1 | xargs -I{} echo "  ✓ {}"

# U8: make RPC failure a hard stop instead of a warning
if BLOCK=$(cast block-number --rpc-url "$ETH_RPC_URL" 2>/dev/null); then
  ok "RPC reachable (latest block #$BLOCK)"
else
  echo -e "  ${RED}❌ RPC check failed — ETH_RPC_URL is unreachable: $ETH_RPC_URL${NC}"
  echo -e "  Fix: edit ~/.aurehub/.env and set a valid ETH_RPC_URL, then re-run this script."
  echo -e "  Free public nodes: https://chainlist.org/chain/1"
  exit 1
fi

cast wallet list 2>/dev/null | grep -qF "$ACCOUNT_NAME" \
  && ok "Keystore account exists" \
  || { echo -e "  ${RED}❌ Account not found${NC}"; exit 1; }

[ -r ~/.aurehub/.wallet.password ] \
  && ok "Password file readable" \
  || { echo -e "  ${RED}❌ Password file not readable${NC}"; exit 1; }

# ── Completion summary ─────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}━━━ Automated setup complete ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Wallet address: ${BOLD}$WALLET_ADDRESS${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${YELLOW}${BOLD}The following steps require manual action (the script cannot do them for you):${NC}"

echo -e "\n  ${BOLD}1. Fund the wallet with ETH (required for gas)${NC}"
echo -e "     Reason: on-chain operations consume gas; the script cannot transfer funds."
echo -e "     Minimum: ≥ 0.005 ETH"
echo -e "     Wallet address: ${BOLD}$WALLET_ADDRESS${NC}"

echo -e "\n  ${BOLD}2. Fund the wallet with trading capital (as needed)${NC}"
echo -e "     Buy XAUT  → deposit USDT to the wallet"
echo -e "     Sell XAUT → deposit XAUT to the wallet"
echo -e "     Same address: ${BOLD}$WALLET_ADDRESS${NC}"

echo -e "\n  ${BOLD}3. Get a UniswapX API Key (limit orders only — not needed for market orders)${NC}"
echo -e "     Reason: the UniswapX API requires authentication; the script cannot register on your behalf."
echo -e "     How to get one (about 5 minutes, free):"
echo -e "       a. Visit https://developers.uniswap.org/dashboard"
echo -e "       b. Sign in with Google or GitHub"
echo -e "       c. Generate a Token (Free tier)"
echo -e "     Then add it to your config:"
echo -e "       \$ echo 'UNISWAPX_API_KEY=your_key' >> ~/.aurehub/.env"

echo -e "\n  ${BOLD}4. Refresh your terminal (only if Foundry was installed in this session)${NC}"
echo -e "     Reason: Foundry modified your shell config; the PATH in the current terminal"
echo -e "     is not yet updated."
echo -e "       \$ source ~/.zshrc    # zsh users"
echo -e "       \$ source ~/.bashrc   # bash users"
echo -e "     Or open a new terminal window."

echo -e "\n${BLUE}Once the steps above are done, send any trade instruction to the Agent to begin.${NC}\n"
