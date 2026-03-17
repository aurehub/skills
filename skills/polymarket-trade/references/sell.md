# Sell Reference

## Command

```bash
node scripts/trade.js --sell --market <slug> --side YES|NO --amount <shares>
```

- `--market` — market slug
- `--side` — `YES` or `NO` (which token to sell)
- `--amount` — number of **shares** to sell (NOT dollars)

## Example

```bash
node scripts/trade.js --sell --market bitcoin-100k-2025 --side YES --amount 10
```

## Flow

1. Fetches market data (Gamma API)
2. Checks CTF ERC-1155 token balance — hard-stops if insufficient shares
3. Shows preview: shares to sell, best bid price, estimated USDC.e proceeds
4. Runs hard-stop checks (POL gas, market status)
5. Safety gate prompt (if estimated proceeds >= $50)
6. Calls `setApprovalForAll` on the CTF contract for the exchange operator
7. Submits FOK sell order to Polymarket CLOB
8. Reports fill status and order ID

## Amount Semantics

For SELL, `--amount` is the **number of shares (CTF tokens)**. This is asymmetric from BUY (which takes dollars). The CLOB SDK requires this.

## Checking Share Balance

Use block explorer or etherscan to check CTF token holdings. Position tracking is not included in v1.
