# Live Trading Runbook (Chat-first, Mainnet)

Use this runbook when you want a real on-chain trade flow with minimal manual work.

Core principle:
- The Agent drives the workflow end-to-end.
- You only intervene at mandatory checkpoints.

---

## 1) What You Need to Do vs What the Agent Does

Agent (automatic):
- Environment checks (`cast`, `.env`, keystore account, password file, RPC reachability)
- Quote and risk preview
- Command preparation and execution steps
- Post-trade result summary

User (manual checkpoints only):
1. Sensitive wallet input (interactive key import / password input)
2. Wallet funding (ETH for gas, USDT/XAUT as needed)
3. Final on-chain write confirmation (`confirm execute`)

---

## 2) Start the Live Flow

In chat, send your intent directly:

```text
buy 10 USDT worth of XAUT
```

or

```text
sell 0.001 XAUT to USDT
```

The Agent will:
1. Run readiness checks
2. If environment is incomplete, switch to agent-guided setup
3. Return a Preview (quote, risk warnings, full command)
4. Wait for explicit confirmation before any on-chain write

---

## 3) Mandatory Manual Checkpoints

### Checkpoint A: Wallet Sensitive Input

If keystore is missing or locked, the Agent will pause and ask you to complete interactive wallet steps.

Typical examples:
- `cast wallet import <account> --interactive`
- entering keystore password when prompted

After you finish, tell the Agent to continue.

### Checkpoint B: Wallet Funding

Before live execution, ensure your wallet has:
- ETH for gas (recommended `>= 0.005 ETH`)
- USDT for buy flow
- XAUT for sell flow

### Checkpoint C: Final Execution Confirmation

No on-chain write runs until you explicitly confirm:

```text
confirm execute
```

---

## 4) Expected Conversation Shape

1. You: trade intent
2. Agent: checks + preview
3. You: handle mandatory manual checkpoint(s) if prompted
4. Agent: updated preview / ready state
5. You: `confirm execute`
6. Agent: tx hash + post-trade balances/result

---

## 5) Optional: Limit Orders

For limit orders, add `UNISWAPX_API_KEY` to `~/.aurehub/.env` first.

Then ask in chat to:
- place limit buy/sell
- check order status
- cancel order

---

## 6) Common Failure Cases

1. RPC/network instability (`429/502/timeout`)
- Add a paid node to `ETH_RPC_URL` or put it first in `ETH_RPC_URL_FALLBACK`.

2. Keystore password mismatch
- Recreate `~/.aurehub/.wallet.password` with correct password (`chmod 600`).

3. Insufficient balances
- Top up ETH/USDT/XAUT, then retry.

4. Runtime `PRIVATE_KEY` detected
- Remove `PRIVATE_KEY` from `.env`; runtime is keystore-only.

---

## 7) Fallback (Manual Script Path)

If agent-guided setup is blocked by local terminal constraints, run setup manually:

```bash
_saved=$(cat ~/.aurehub/.setup_path 2>/dev/null); [ -f "$_saved" ] && SETUP_PATH="$_saved"
[ -z "$SETUP_PATH" ] && { GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); [ -n "$GIT_ROOT" ] && [ -f "$GIT_ROOT/skills/xaut-trade/scripts/setup.sh" ] && SETUP_PATH="$GIT_ROOT/skills/xaut-trade/scripts/setup.sh"; }
[ -z "$SETUP_PATH" ] && SETUP_PATH=$(find "$HOME" -maxdepth 6 -type f -path "*/xaut-trade/scripts/setup.sh" 2>/dev/null | head -1)
bash "$SETUP_PATH"
```

Then return to chat and continue your original trade intent.
