# Balance & Pre-flight Checks

Complete the following steps in order before any quote or execution:

## 1. Environment Check

```bash
cast --version
cast block-number --rpc-url "$ETH_RPC_URL"
```

If either fails, stop and prompt:
- Foundry not installed: install Foundry first
- RPC unavailable: replace `ETH_RPC_URL`

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
> echo "your_password" > ~/.foundry/keystores/.my-xaut-wallet.password
> chmod 600 ~/.foundry/keystores/.my-xaut-wallet.password
> ```
> Then set `KEYSTORE_PASSWORD_FILE` in `.env`.

**If only `PRIVATE_KEY` is set (fallback mode):**

Skip keystore checks and continue.

**If neither is set:**

Hard-stop:
> ❌ No signing method configured. Set `FOUNDRY_ACCOUNT` (recommended) or `PRIVATE_KEY` (fallback) in `.env`.

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

- **Sell flow (required)**: check if balance covers the sell amount; if not, hard-stop and report the shortfall
- **Buy flow (optional)**: used for pre/post-trade position comparison
