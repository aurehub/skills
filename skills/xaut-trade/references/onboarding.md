# Environment Initialization (Onboarding)

Run this on first use or when the environment is incomplete. Return to the original user intent after completion.

---

## Step 0: Install Foundry (if `cast` is unavailable)

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
cast --version   # Expected output: cast Version: x.y.z
```

Skip this step if `cast --version` succeeds.

---

## Step 1: Create Global Config Directory

```bash
mkdir -p ~/.aurehub
```

---

## Step 2: Wallet Setup

**Auto-detect** — do not ask the user for a preference; check in order:

### Case A: User wants to import an existing private key

When the user provides a private key (64-character hex string starting with `0x`):

```bash
cast wallet import aurehub-wallet --private-key <PRIVATE_KEY>
# When prompted for a keystore password, use the user-provided password or suggest a strong random one
```

### Case B: User wants to create a brand-new wallet

```bash
# Generate a new wallet; outputs address and private key
cast wallet new

# Immediately import into keystore (use the private key from the previous step)
cast wallet import aurehub-wallet --private-key <GENERATED_PRIVATE_KEY>
```

> ⚠️ The private key of the new wallet is shown only once. Make sure the user saves it to a safe location before continuing.

**Both paths complete with**: create password file

```bash
# Ask user for the keystore password (set during import)
echo "<keystore_password>" > ~/.aurehub/.wallet.password
chmod 600 ~/.aurehub/.wallet.password
```

**Auto-fetch wallet address** (no manual input required):

```bash
cast wallet address --account aurehub-wallet
# Example output: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
WALLET_ADDRESS=$(cast wallet address --account aurehub-wallet)
```

---

## Step 3: Generate Config Files

Write `~/.aurehub/.env` (write directly — do not ask the user to copy manually):

```bash
cat > ~/.aurehub/.env << 'EOF'
ETH_RPC_URL=https://eth.llamarpc.com
FOUNDRY_ACCOUNT=aurehub-wallet
KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password
# Required for limit orders, not needed for market orders:
# UNISWAPX_API_KEY=your_api_key_here
# Optional: nickname for future activities (set automatically on first use if not provided here)
# NICKNAME=YourName
EOF
```

> If the user has a faster RPC (e.g. Alchemy/Infura), replace `ETH_RPC_URL`.

Copy contract config (defaults are ready to use — no user edits needed):

```bash
cp "$(git rev-parse --show-toplevel)/skills/xaut-trade/config.example.yaml" ~/.aurehub/config.yaml
```

---

## Step 4: Verify

```bash
source ~/.aurehub/.env && cast --version
source ~/.aurehub/.env && cast block-number --rpc-url "$ETH_RPC_URL"
cast wallet list | grep aurehub-wallet
```

If all pass, the environment is ready. Inform the user:

```bash
WALLET_ADDRESS=$(cast wallet address --account aurehub-wallet)
echo "Environment initialized. Wallet address: $WALLET_ADDRESS"
echo "Make sure the wallet holds a small amount of ETH (≥ 0.005) for gas."
```

---

## Extra Dependencies for Limit Orders (limit orders only)

### 1. Install Node.js (>= 18)

```bash
node --version   # If version < 18 or command not found: https://nodejs.org
cd "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts" && npm install
```

### 2. Get a UniswapX API Key (required)

Limit orders require a UniswapX API Key to submit and query orders.

How to obtain (about 5 minutes, free):
1. Visit https://developers.uniswap.org/dashboard
2. Sign in with Google / GitHub
3. Generate a Token (choose Free tier)

Add the key to `~/.aurehub/.env`:

```bash
echo 'UNISWAPX_API_KEY=your_key_here' >> ~/.aurehub/.env
```

Neither of the above steps is needed for market orders (Uniswap V3).
