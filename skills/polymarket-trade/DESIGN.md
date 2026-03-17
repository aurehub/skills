# Design: polymarket-trade — Positions Display & Market Resolve

Date: 2026-03-17
Skill: `skills/polymarket-trade`
Status: Approved

## Problem

Two gaps block production use:

1. **No position tracking** — `balance.js` shows wallet balances but not CTF token holdings (YES/NO shares). Users cannot see their open positions without leaving the skill.
2. **trade CLI requires exact slug** — `trade.js` fetches markets via `GET /markets/<query>` which requires a precise Polymarket slug. Keyword input returns 404, forcing users to run `browse.js` first just to get the slug.

## Feature 1: Positions in balance.js

### Data Source

`GET https://data-api.polymarket.com/positions?user=<address>&sizeThreshold=.1`

- Public endpoint, no authentication required
- `sizeThreshold=.1` filters dust positions
- Confirmed live: returns `[]` for zero-position addresses, real data for active traders
- Configured via `cfg.yaml?.polymarket?.data_url ?? 'https://data-api.polymarket.com'`

### Response Fields Used

| Field | Usage |
|-------|-------|
| `outcome` | YES / NO |
| `slug` | market identifier |
| `title` | human-readable market name (for fallback display) |
| `size` | number of shares held |
| `curPrice` | current market price per share |
| `currentValue` | estimated USD value |

### Output Format

```
💰 0x1234...abcd
   POL:    0.1234
   USDC.e: $100.50  ← trading token
   CLOB:   $50.00   ← available for orders

   Positions:
     YES  bitcoin-100k-2025     42.50 shares  $0.72/share  ~$30.60
     NO   will-trump-win        10.00 shares  $0.32/share  ~$3.20
```

Positions section is omitted when there are no positions. Fetch failure is silently skipped (consistent with CLOB balance handling).

### Changes

- `scripts/balance.js` — add `fetchPositions(address, cfg)` and update `getBalances()` / `formatBalances()`
- `config.example.yaml` — add `data_url: "https://data-api.polymarket.com"` under `polymarket:`

## Feature 2: Market Resolution in trade.js

### Problem

Current CLI entry point (trade.js lines 218-224):
```js
const res = await axios.get(`${gammaUrl}/markets/${query}`, { timeout: 10_000 });
return [res.data];
```
Fails with unhandled 404 when `query` is a keyword instead of a slug.

### Solution: `resolveMarket(query, cfg)` exported function

1. Try exact slug: `GET /markets/<query>`
2. On 404, fall back to keyword search: `GET /markets?q=<query>`
3. If keyword search returns exactly one result → auto-proceed
4. If multiple results → print list and exit with guidance to specify slug
5. If no results → throw `Market not found: <query>`

### Output When Multiple Results Found

```
Found 3 markets matching "bitcoin":
  1. bitcoin-100k-2025       "Will BTC reach $100k by Dec 2025?"  ACTIVE
  2. bitcoin-100k-jan-2026   "Will BTC reach $100k by Jan 2026?"  ACTIVE
  3. bitcoin-200k-2025       "Will BTC reach $200k?"              ACTIVE

Specify the exact slug: node scripts/trade.js --buy --market bitcoin-100k-2025 ...
```

### Why Exported Function

Consistent with existing exported functions (`buy`, `sell`, `getSafetyLevel`, `validateHardStops`). Enables unit testing without network mocks at the CLI layer.

### Changes

- `scripts/trade.js` — replace inline market IIFE with exported `resolveMarket(query, cfg)`, update CLI entry point

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `data-api` positions fetch fails | Silent skip, no positions section shown |
| Exact slug fetch returns 404 | Auto-retry with keyword search |
| Keyword search returns 0 results | `throw new Error('Market not found: <query>')` |
| Keyword search returns 1 result | Auto-proceed |
| Keyword search returns 2-5 results | Print list, `process.exit(1)` with slug hint |

## Testing

### Unit Tests

- `balance.test.js` — add tests for `fetchPositions` (mock axios) and updated `formatBalances` with positions
- `trade.test.js` — add tests for `resolveMarket`: exact slug hit, 404 fallback single result, 404 fallback multiple results, not found

### SKILL.tests.yaml

- Add `full-balance-positions`: balance output contains position data fields
- Add `full-trade-keyword`: trade with keyword resolves and confirms market

## Files Modified

| File | Change |
|------|--------|
| `scripts/balance.js` | Add `fetchPositions`, update `getBalances`, `formatBalances` |
| `scripts/trade.js` | Add `resolveMarket`, replace inline IIFE |
| `scripts/__tests__/balance.test.js` | New tests for positions |
| `scripts/__tests__/trade.test.js` | New tests for `resolveMarket` |
| `config.example.yaml` | Add `data_url` |
| `SKILL.tests.yaml` | Add 2 test cases |
