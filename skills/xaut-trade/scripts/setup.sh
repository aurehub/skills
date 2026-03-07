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
  echo "  Downloading Foundry installer (this may take a moment)..."
  curl -L https://foundry.paradigm.xyz | bash

  # foundryup may not be in PATH yet; add it temporarily for this session
  export PATH="$HOME/.foundry/bin:$PATH"
  echo "  Installing cast, forge, and anvil binaries (~100 MB, please wait)..."
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

# ── Step 3: Keystore password file ─────────────────────────────────────────────
step "Prepare keystore password file"

if [ -f ~/.aurehub/.wallet.password ] && [ -s ~/.aurehub/.wallet.password ]; then
  ok "Password file already exists and is non-empty, skipping"
else
  if [ ! -f ~/.aurehub/.wallet.password ]; then
    ( umask 077; touch ~/.aurehub/.wallet.password )
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
  ( umask 077; printf '%s' "$WALLET_PASSWORD" > ~/.aurehub/.wallet.password )
  unset WALLET_PASSWORD
  ok "Password saved to ~/.aurehub/.wallet.password (permissions: 600)"
fi

# ── Step 4: Wallet keystore ────────────────────────────────────────────────────
step "Configure wallet keystore"

if cast wallet list 2>/dev/null | grep -qF "$ACCOUNT_NAME"; then
  ok "Keystore account '$ACCOUNT_NAME' already exists, skipping"
else
  echo -e "  No keystore account '${BOLD}$ACCOUNT_NAME${NC}' found. Generating a new wallet..."
  echo -e "  ${YELLOW}⚠ The private key will be displayed once. Save it to a secure location"
  echo -e "  (e.g. password manager). Clear your terminal scrollback after saving.${NC}"
  echo

  mkdir -p ~/.foundry/keystores
  cast wallet new ~/.foundry/keystores "$ACCOUNT_NAME" \
    --password-file ~/.aurehub/.wallet.password

  ok "Keystore account '$ACCOUNT_NAME' created"
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
  echo -e "  Ethereum node URL (press Enter to use the free public node):"
  echo -e "  Default: ${BOLD}$DEFAULT_RPC${NC}"
  echo -e "  Tip: Alchemy or Infura private nodes are more reliable. You can update"
  echo -e "  this later by editing ETH_RPC_URL in ~/.aurehub/.env"
  read -rp "  Node URL: " INPUT_RPC
  ETH_RPC_URL="${INPUT_RPC:-$DEFAULT_RPC}"

  cat > ~/.aurehub/.env << EOF
ETH_RPC_URL=$ETH_RPC_URL
# Fallback RPCs tried in order when primary fails with a network error (429/502/timeout)
# Add a paid Alchemy/Infura node at the front for higher reliability
ETH_RPC_URL_FALLBACK=https://eth.merkle.io,https://rpc.flashbots.net/fast,https://eth.drpc.org,https://ethereum.publicnode.com
FOUNDRY_ACCOUNT=$ACCOUNT_NAME
KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password
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

# ── Step N: Limit order dependencies (npm + UniswapX API Key) ─────────────────
step "Limit order dependencies (npm + UniswapX API Key)"

_install_nodejs() {
  local suggestion=""
  if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v brew &>/dev/null; then
      suggestion="brew install node"
    else
      suggestion=$'# Install Homebrew first: https://brew.sh\nbrew install node'
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

  # Prompt for UniswapX API Key inline (skip if already configured)
  if grep -q '^UNISWAPX_API_KEY=.\+' ~/.aurehub/.env 2>/dev/null; then
    ok "UNISWAPX_API_KEY already configured, skipping"
  else
    echo
    echo -e "  ${BOLD}UniswapX API Key${NC} (required for limit orders, not needed for market orders)"
    echo -e "  Get one free (~5 min): ${BOLD}https://developers.uniswap.org/dashboard${NC}"
    echo -e "  Sign in with Google/GitHub → Generate Token (Free tier)"
    echo
    read -rp "  Enter API Key (or press Enter to skip): " UNISWAPX_KEY
    if [ -n "$UNISWAPX_KEY" ]; then
      if grep -v '^UNISWAPX_API_KEY=' ~/.aurehub/.env > /tmp/.env.tmp 2>/dev/null && [ -s /tmp/.env.tmp ]; then
        mv /tmp/.env.tmp ~/.aurehub/.env
      fi
      echo "UNISWAPX_API_KEY=$UNISWAPX_KEY" >> ~/.aurehub/.env
      unset UNISWAPX_KEY
      ok "UNISWAPX_API_KEY saved to ~/.aurehub/.env"
    else
      ok "Skipped (add UNISWAPX_API_KEY to ~/.aurehub/.env later if needed)"
    fi
  fi
else
  warn "Limit orders unavailable (Node.js not installed). Re-run setup.sh after installing Node.js >= 18."
fi

# ── Step 8: Activity rankings (optional) ─────────────────────────────────────
step "Activity rankings (optional)"

echo -e "  Would you like to join the XAUT trade activity rankings?"
echo -e "  This will share your ${BOLD}wallet address${NC} and a ${BOLD}nickname${NC} with https://xaue.com"
echo -e "  You can change this anytime by editing ~/.aurehub/.env"
echo
read -rp "  Join rankings? [y/N]: " JOIN_RANKINGS
if [[ "${JOIN_RANKINGS:-}" =~ ^[Yy]$ ]]; then
  read -rp "  Enter your nickname: " RANKINGS_NICKNAME
  if [ -n "$RANKINGS_NICKNAME" ]; then
    echo "RANKINGS_OPT_IN=true" >> ~/.aurehub/.env
    echo "NICKNAME=$RANKINGS_NICKNAME" >> ~/.aurehub/.env
    ok "Rankings enabled (nickname: $RANKINGS_NICKNAME)"
  else
    echo "RANKINGS_OPT_IN=false" >> ~/.aurehub/.env
    ok "Rankings skipped (empty nickname)"
  fi
else
  echo "RANKINGS_OPT_IN=false" >> ~/.aurehub/.env
  ok "Rankings skipped"
fi

# ── Step 9: Verification ───────────────────────────────────────────────────────
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

echo -e "\n  ${BOLD}3. Get a UniswapX API Key (limit orders only — skip if you already entered one above)${NC}"
echo -e "     Reason: the UniswapX API requires authentication; the script cannot register on your behalf."
echo -e "     How to get one (about 5 minutes, free):"
echo -e "       a. Visit https://developers.uniswap.org/dashboard"
echo -e "       b. Sign in with Google or GitHub"
echo -e "       c. Generate a Token (Free tier)"
echo -e "     Then add it to your config:"
echo -e "       \$ echo 'UNISWAPX_API_KEY=your_key' >> ~/.aurehub/.env"

echo -e "\n${BLUE}Once the steps above are done, send any trade instruction to the Agent to begin.${NC}\n"

# ── Save setup script path for future re-runs ──────────────────────────────────
printf '%s\n' "$SCRIPT_DIR/setup.sh" > ~/.aurehub/.setup_path
