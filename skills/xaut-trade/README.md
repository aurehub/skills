# xaut-trade

Buy and sell XAUT (Tether Gold) on Ethereum mainnet via AI Agent, using Uniswap V3 + Foundry `cast` under the hood.

## Supported Pairs

| Direction | Pair | Description |
|-----------|------|-------------|
| Buy | USDT → XAUT | Swap USDT for gold token |
| Sell | XAUT → USDT | Swap gold token back to USDT |

## Setup

### 1. Install Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Verify: `cast --version`

### 2. Configure Wallet


**Recommended: import an existing private key**

```bash
cast wallet import aurehub-wallet --private-key <YOUR_PRIVATE_KEY>
```

**Or: create a brand-new wallet**

```bash
cast wallet new   # save the output private key somewhere safe
cast wallet import aurehub-wallet --private-key <GENERATED_PRIVATE_KEY>
```

Create the password file:

```bash
mkdir -p ~/.aurehub
echo "your_keystore_password" > ~/.aurehub/.wallet.password
chmod 600 ~/.aurehub/.wallet.password
```

> Foundry keystores are stored in `~/.foundry/keystores/`; the password file goes in `~/.aurehub/`.

### 3. Install Node.js (limit orders only)

Not required for market orders. If you need limit order functionality:

```bash
# Verify
node --version   # requires >= 18

# Install if missing: https://nodejs.org
# macOS recommended: brew install node
```

Install limit-order script dependencies:

```bash
cd skills/xaut-trade/scripts
npm install
```

### 4. Get a UniswapX API Key (required for limit orders)

Submitting and querying limit orders requires a UniswapX API Key.

How to obtain (about 5 minutes, free):
1. Visit [developers.uniswap.org/dashboard](https://developers.uniswap.org/dashboard)
2. Sign in with Google / GitHub
3. Generate a Token (choose Free tier)

Add the key to `~/.aurehub/.env`:

```bash
echo 'UNISWAPX_API_KEY=your_key_here' >> ~/.aurehub/.env
```

Market orders do not require an API Key.

### 5. Create Local Config

```bash
# Environment variables (copy to global config directory)
mkdir -p ~/.aurehub
cp skills/xaut-trade/.env.example ~/.aurehub/.env
# Edit ~/.aurehub/.env and fill in:
#   ETH_RPC_URL              - Ethereum mainnet RPC URL
#   FOUNDRY_ACCOUNT          - Foundry keystore account name (pre-filled: aurehub-wallet)
#   KEYSTORE_PASSWORD_FILE   - path to keystore password file (see Step 2)
#   UNISWAPX_API_KEY         - required for limit orders (see Step 2.7)

# Trade config (optional — defaults are ready to use)
cp skills/xaut-trade/config.example.yaml ~/.aurehub/config.yaml
```

### 6. Fund the Wallet

- A small amount of ETH (≥ 0.005) for gas
- USDT (for buying)
- XAUT (for selling)

## Usage

Just talk to the Agent in natural language:

### Buy

```
buy XAUT with 100 USDT
buy 200 USDT worth of XAUT
```

### Sell

```
sell 0.01 XAUT
swap 0.05 XAUT for USDT
sell 0.1 XAUT
```

### Limit Buy

```
buy 0.01 XAUT when price drops to 3000 USDT
limit order: buy 0.01 XAUT when price reaches 3000 USDT
limit buy XAUT at 3000, amount 0.01, valid 3 days
```

### Limit Sell

```
sell 0.01 XAUT when price rises to 4000 USDT
limit sell 0.01 XAUT at target price 3800 USDT, valid 3 days
sell 0.01 XAUT when price reaches 4000
```

### Check Limit Order

```
check my limit order status, orderHash is 0x...
```

### Cancel Limit Order

```
cancel limit order, orderHash is 0x...
```

### Check Balance

```
check my XAUT balance
```

## Trade Flow

For both buy and sell, the Agent follows this semi-automated flow:

```
Pre-flight checks → On-chain quote → Preview display → [User confirms] → Approve → [User confirms] → Swap → Result verification
```

Before every on-chain write operation (approve / swap), the Agent will:
1. Display the full `cast` command
2. Wait for you to explicitly say **"confirm execute"** before proceeding

**Nothing happens on-chain until you confirm.**

## Risk Controls

| Rule | Default Threshold | Behavior |
|------|-------------------|----------|
| Large trade | > $1,000 USD | Double confirmation required |
| High slippage | > 50 bps (0.5%) | Warning + double confirmation |
| Insufficient gas | ETH < 0.005 | Hard-stop |
| Insufficient balance | — | Hard-stop, report shortfall |
| Precision exceeded | > 6 decimal places | Hard-stop (XAUT minimum unit: 0.000001) |
| UniswapX Filler unavailable | XAUT is a low-liquidity token | Order expires after deadline; funds safe |

Thresholds can be customized in the `risk` section of `config.yaml`.

## Configuration

### .env (required)

| Variable | Description | Example |
|----------|-------------|---------|
| `ETH_RPC_URL` | Ethereum RPC URL | `https://eth.llamarpc.com` |
| `FOUNDRY_ACCOUNT` | Foundry keystore account name (set by onboarding) | `aurehub-wallet` |
| `KEYSTORE_PASSWORD_FILE` | Path to keystore password file | `~/.aurehub/.wallet.password` |
| `UNISWAPX_API_KEY` | UniswapX API Key (**required for limit orders**, not needed for market orders) | Get at: developers.uniswap.org/dashboard |
| `PRIVATE_KEY` | Private key (fallback, not recommended) | `0x...` |
| `NICKNAME` | Display name for activity rankings (optional, set on first use if omitted) | `Alice` |

### config.yaml (optional)

Key adjustable parameters:

```yaml
risk:
  default_slippage_bps: 50      # Default slippage protection 0.5%
  max_slippage_bps_warn: 50     # Slippage warning threshold
  large_trade_usd: 1000         # Large trade threshold (USD)
  min_eth_for_gas: "0.005"      # Minimum ETH for gas
  deadline_seconds: 300         # Swap transaction timeout (seconds)

token_rules:
  USDT:
    requires_reset_approve: true  # USDT needs approve(0) before approve(amount)

limit_order:
  default_expiry_seconds: 86400   # Default order expiry: 1 day
  min_expiry_seconds: 300         # Minimum: 5 minutes
  max_expiry_seconds: 2592000     # Maximum: 30 days
  uniswapx_api: "https://api.uniswap.org/v2"  # Override for local mock testing
```

## Local Testing (Anvil Fork)

> **Note: Limit orders cannot be tested with Anvil fork** because the UniswapX API does not recognize local chain IDs.
> For limit orders, use a very small amount (e.g. 1 USDT → XAUT) on mainnet for end-to-end verification.
> Signature format can be validated against a local mock service via `limit_order.uniswapx_api` in `config.yaml`.

Use Anvil to fork mainnet state locally for zero-cost testing of the full buy/sell flow without spending real assets.

### 1. Start Anvil Fork

```bash
# Fork Ethereum mainnet locally (requires a mainnet RPC)
anvil --fork-url https://eth.llamarpc.com

# Optionally pin a block (for reproducible state)
anvil --fork-url https://eth.llamarpc.com --fork-block-number 19500000
```

Anvil starts with 10 pre-funded accounts, each with 10,000 ETH. Default: `http://127.0.0.1:8545`.

### 2. Point .env to Local

```bash
# .env
ETH_RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # Anvil account #0 private key
```

> This is Anvil's hardcoded test account with a public key — for local testing only.

### 3. Fund the Test Account with USDT

Anvil pre-funded accounts only have ETH. Use `cast` to impersonate a whale and transfer tokens:

```bash
# Find a USDT whale (e.g. Binance Hot Wallet)
USDT=0xdAC17F958D2ee523a2206206994597C13D831ec7
WHALE=0xF977814e90dA44bFA03b6295A0616a897441aceC  # Binance hot wallet

# Impersonate whale, transfer 10,000 USDT to test account
cast send $USDT "transfer(address,uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 10000000000 \
  --from $WHALE \
  --unlocked \
  --rpc-url http://127.0.0.1:8545

# Verify balance
cast call $USDT "balanceOf(address)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://127.0.0.1:8545
```

### 4. Run Test Trades

Once configured, just use the skill normally:

```
buy XAUT with 100 USDT
```

The Agent will run the full flow (quote → confirm → approve → swap), all on the local fork — no real funds spent.

### 5. Notes

- Anvil fork state is **temporary** and resets on restart (unless using `anvil --state` for persistence)
- Local testing uses `--unlocked` + `--from` instead of keystore, but the skill uses `--private-key` or `--account` in production — results are equivalent
- If the fork runs for a long time, on-chain state may diverge from current mainnet; restart the fork to refresh
- Whale addresses may change over time; if the transfer fails, check the latest top holders on [Etherscan](https://etherscan.io/token/0xdAC17F958D2ee523a2206206994597C13D831ec7#balances)

## FAQ

**Q: What if a transaction gets stuck or fails?**
The Agent will provide retry suggestions: reduce amount, increase slippage tolerance, or check nonce and gas.

**Q: Why does USDT approval require two steps?**
USDT's non-standard implementation requires `approve(0)` to reset the allowance before `approve(amount)`. XAUT does not.

**Q: Are other chains supported?**
Only Ethereum mainnet (chain_id: 1) is currently supported. Anvil fork is for local testing only, not a production deployment target.

**Q: `cast send` returns `Device not configured (os error 6)` — what do I do?**

This happens on macOS when the system Keychain is inaccessible in a non-interactive environment. Fix:

1. Create a password file and set permissions:
   ```bash
   echo "your_keystore_password" > ~/.aurehub/.wallet.password
   chmod 600 ~/.aurehub/.wallet.password
   ```
2. Set `KEYSTORE_PASSWORD_FILE` to point to this file in `.env`.
3. Re-run the trade flow.

**Q: What is a Skill package? How does it drive the AI to trade gold?**

A Skill package is a set of structured AI instruction files (`SKILL.md`) that define the Agent's behavior, operation flow, and risk boundaries for a specific scenario. The `xaut-trade` Skill tells the Agent how to check prerequisites, call the Uniswap V3 quote contract, construct `cast send` commands, handle USDT's non-standard approval, and more. The Agent itself does not store private keys or have execution authority — it reads the Skill and generates commands. Only after you say "confirm execute" does `cast` use the local keystore to sign and broadcast the transaction.

**Q: Do I need a computer running 24/7?**

- **Market orders (buy/sell)**: No. Market trades are one-shot interactions — you send the instruction → Agent quotes → you confirm → trade completes. No need to stay online.
- **Limit orders**: No. After signing, the order is submitted to the UniswapX network, where third-party Filler nodes automatically fill it when the price is met. Your computer can be off. Note: if no Filler fills the order before the `deadline`, it expires naturally with no loss of funds.

**Q: Does it only work with Claude Code?**

No. The Skill supports two main runners:

- **Claude Code** (recommended): install locally and use directly via Claude chat — no server needed
- **OpenClaw**: use via Slack / Telegram etc.; each user must configure their own wallet credentials independently

The primary test target is Claude (Sonnet / Opus series); other LLMs that can follow Skill instructions and call shell commands should work in theory but are not verified.

**Q: Will you read my API Key or private key from `.env`?**

No. The Skill package runs entirely locally and contains no data collection or reporting logic. All trades are executed via local `cast` — no intermediary servers. With the recommended keystore approach, the private key is encrypted in the Foundry keystore; `.env` only stores the account name, wallet address, and other config. Never commit `.env` to version control.

**Q: Will the Agent auto-buy based on price movements?**

No. The Agent does not monitor prices or make autonomous decisions. It is an execution assistant that acts only when you explicitly give an instruction:

- **Market order**: you say "buy XAUT with 100 USDT" → Agent quotes → you confirm → executes
- **Limit order**: you set "buy 0.01 when XAUT drops to 3000" → Agent signs and submits the order → UniswapX Fillers fill it when the condition is met

**Q: Do I need to manually confirm each trade? Can it spend my money without confirmation?**

Before every on-chain write (approve / swap), the Agent displays the full `cast` command and waits for you to explicitly say **"confirm execute"**. Without your confirmation, no on-chain operation occurs. You hold the private key / keystore — the Agent cannot bypass the confirmation step to use your funds.

**Q: Can I use multiple wallets simultaneously?**

The current Skill is designed for a single wallet per instance. For multi-wallet use, prepare a separate `.env` for each wallet (with distinct `FOUNDRY_ACCOUNT` and `KEYSTORE_PASSWORD_FILE`), and switch config files before each operation. There is no built-in multi-wallet concurrent management.

**Q: Do I need to reinstall after a Skill update?**

Yes. Re-fetch the latest version through the same channel you used to install. Updates will not overwrite your local config (`.env`, `config.yaml`).
