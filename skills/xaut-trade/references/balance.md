# Balance & Pre-flight Checks

Complete the following steps in order before any quote or execution:

## 1. Environment Check

```bash
cast --version
cast block-number --rpc-url "$ETH_RPC_URL"
```

If either fails, stop and prompt:
- Foundry not installed: install Foundry first
- RPC unavailable: trigger RPC fallback sequence (see RPC Fallback section in SKILL.md)

## 2. Signing Mode Detection

Determine the signing mode for this execution and complete validation:

**If `FOUNDRY_ACCOUNT` is set (keystore mode):**

Verify the account exists:
```bash
cast wallet list
```
Confirm the output contains `$FOUNDRY_ACCOUNT`; otherwise hard-stop:
> ❌ keystore account `$FOUNDRY_ACCOUNT` does not exist. Run:
> `cast wallet import $FOUNDRY_ACCOUNT --interactive`

Verify the password file is readable:
```bash
test -r "$KEYSTORE_PASSWORD_FILE" && echo "OK" || echo "FAIL"
```
If output is `FAIL`, hard-stop:
> ❌ Password file not readable: `$KEYSTORE_PASSWORD_FILE`
> Create it and set permissions:
> ```bash
> echo "your_password" > ~/.aurehub/.wallet.password
> chmod 600 ~/.aurehub/.wallet.password
> ```
> Then set `KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password` in `.env`.

**If only `PRIVATE_KEY` is set (fallback mode):**

Skip keystore checks and continue.

**If neither is set:**

Hard-stop:
> ❌ No signing method configured. Set `FOUNDRY_ACCOUNT` (recommended) or `PRIVATE_KEY` (fallback) in `.env`.

After completing signing-mode validation, derive the wallet address:

```bash
WALLET_ADDRESS=$(cast wallet address --account "$FOUNDRY_ACCOUNT" --password-file "$KEYSTORE_PASSWORD_FILE")
```

If using private key fallback mode:

```bash
WALLET_ADDRESS=$(cast wallet address "$PRIVATE_KEY")
```

## 3. Wallet & Gas Check

```bash
cast balance "$WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL"
```

- If ETH balance is below `risk.min_eth_for_gas`, hard-stop

## 4. Stablecoin Balance Check

USDT:

```bash
cast call "$USDT" "balanceOf(address)" "$WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL"
```

- If payment token balance is insufficient, hard-stop and report the shortfall

## 5. XAUT Balance

```bash
cast call "$XAUT" "balanceOf(address)" "$WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL"
```

## Parsing Rule (MANDATORY)

**Never** use return-type annotations (e.g. `balanceOf(address)(uint256)`) when the result will be used in scripts or Python interpolation. The annotated form produces output like `24980609 [2.498e7]` which breaks shell variable assignment and Python `-c` strings.

Always parse `cast call` output with one of these two patterns:

```bash
# Pattern A: no annotation + cast to-dec (preferred)
BALANCE=$(cast to-dec $(cast call "$TOKEN" "balanceOf(address)" "$WALLET" --rpc-url "$RPC"))

# Pattern B: annotation + awk to strip the comment
BALANCE=$(cast call "$TOKEN" "balanceOf(address)(uint256)" "$WALLET" --rpc-url "$RPC" | awk '{print $1}')
```

- **Sell flow (required)**: check if balance covers the sell amount; if not, hard-stop and report the shortfall
- **Buy flow (optional)**: used for pre/post-trade position comparison
