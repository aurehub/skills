# Limit Order Cancellation

All commands below assume CWD is `$SCRIPTS_DIR` and env is sourced. Each Bash block must begin with:

```bash
source ~/.aurehub/.env
cd "$SCRIPTS_DIR"
```

## 0. Pre-confirmation

Cancelling a limit order is an on-chain operation (gas required). Confirm before cancelling:
- orderHash
- Current order status (recommended: query first to avoid cancelling an already-filled or expired order)

## 1. Fetch Cancellation Parameters

```bash
CANCEL_PARAMS=$(node limit-order.js cancel \
  --nonce "$NONCE")

WORD_POS=$(echo "$CANCEL_PARAMS" | python3 -c "import sys,json; print(json.load(sys.stdin)['wordPos'])")
MASK=$(echo "$CANCEL_PARAMS"     | python3 -c "import sys,json; print(json.load(sys.stdin)['mask'])")
PERMIT2=$(echo "$CANCEL_PARAMS"  | python3 -c "import sys,json; print(json.load(sys.stdin)['permit2'])")
```

## 2. Execute Cancellation

Display the command and wait for user confirmation:

```bash
source ~/.aurehub/.env
cd "$SCRIPTS_DIR"
CANCEL_JSON=$(node swap.js cancel-nonce --word-pos "$WORD_POS" --mask "$MASK")
TX_HASH=$(echo "$CANCEL_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['txHash'])")
echo "Cancel tx: https://etherscan.io/tx/$TX_HASH"
```

## 3. Output

- tx hash
- Note: No assets were locked — Permit2 uses signature-based authorization, not asset custody. Cancellation revokes the signature on-chain; no token return operation is needed.

## 4. Special Cases

| Case | Action |
|------|--------|
| Order already filled | No cancellation needed; inform the user |
| Order already expired | Nonce has auto-invalidated; no on-chain cancellation needed |
| Cancel succeeds but Filler is still processing | Very low probability; the Filler transaction will revert once the nonce is invalidated on-chain |
