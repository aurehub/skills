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

### Implementation Details

`fetchPositions(address, cfg)` is a new async function added to `balance.js`. It is called inside `getBalances(cfg)` **after** `wallet.address` is resolved (i.e. after `createSigner`), passing `wallet.address` as `address`. It uses dynamic axios import (`const { default: axios } = await import('axios')`) consistent with the existing pattern in `browse.js` and `trade.js`.

On success, it returns an array of raw API position objects. On any error, it returns `[]` (silent skip, consistent with CLOB balance handling).

`getBalances()` returns:
```js
{
  address,   // string
  pol,       // string (toFixed(4))
  usdce,     // string (raw formatUnits, formatted to toFixed(2) in formatBalances)
  clob,      // string | null
  positions, // array of { outcome, slug, size, curPrice, currentValue } — empty array if none/error
}
```

`formatBalances()` appends a Positions section only when `positions.length > 0`.

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

Positions section is omitted when `positions` is empty.

### Changes

- `scripts/balance.js` — add `fetchPositions(address, cfg)`, update `getBalances()` to call it and include `positions` in return object, update `formatBalances()` to render positions section
- `config.example.yaml` — add `data_url: "https://data-api.polymarket.com"` under `polymarket:`

## Feature 2: Market Resolution in trade.js

### Problem

Current CLI entry point (trade.js lines 218-224):
```js
const res = await axios.get(`${gammaUrl}/markets/${query}`, { timeout: 10_000 });
return [res.data];
```
Fails with unhandled 404 when `query` is a keyword instead of a slug.

### Solution: `resolveMarket(query, cfg)` in browse.js

`resolveMarket` is added to `browse.js` (not `trade.js`) because `browse.js` already owns all Gamma API fetch logic — `fetchGamma()`, `fetchOrderbook()`, `fetchMarketInfo()`. Adding it here avoids duplicating the Gamma URL config read and axios import pattern that already exist there. `trade.js` already imports from `browse.js` (`extractTokenIds`), so no new cross-file dependency is introduced.

**Logic:**

1. Try exact slug: call axios directly — `GET ${gammaUrl}/markets/<query>` (timeout 10s). **Do not route through `fetchGamma()`** — `fetchGamma` uses a `query.includes('/')` heuristic that would misroute slugs like `bitcoin-100k-2025` (no `/`) into a keyword search instead of a slug lookup.
2. If step 1 returns 200 → return the market object directly, done.
3. If step 1 returns 404 → fall back to keyword search via `fetchGamma(gammaUrl, query)` (which issues `GET /markets?q=<encodeURIComponent(query)>`)
4. Cap keyword results at **5** (consistent with `browse.search()` which already uses `.slice(0, 5)`)
5. If keyword search returns exactly 1 result → return it
6. If keyword search returns 2-5 results → print list, `process.exit(1)` with slug hint
7. If keyword search returns 0 results → `throw new Error('Market not found: <query>')`

**Multi-result output:**

```
Found 3 markets matching "bitcoin":
  1. bitcoin-100k-2025       "Will BTC reach $100k by Dec 2025?"  ACTIVE
  2. bitcoin-100k-jan-2026   "Will BTC reach $100k by Jan 2026?"  ACTIVE
  3. bitcoin-200k-2025       "Will BTC reach $200k?"              ACTIVE

Specify the exact slug: node scripts/trade.js --buy --market bitcoin-100k-2025 ...
```

`trade.js` CLI entry point replaces its inline market IIFE with a call to `resolveMarket(query, cfg)`.

### Why Exported from browse.js

- `browse.js` already owns Gamma API interaction
- `trade.js` already imports from `browse.js`
- Avoids duplicating `fetchGamma` URL-routing logic (slug vs keyword heuristic)
- `resolveMarket` is testable in `browse.test.js` alongside the existing browse helpers

### Changes

- `scripts/browse.js` — add exported `resolveMarket(query, cfg)` function
- `scripts/trade.js` — replace inline market IIFE with `resolveMarket(query, cfg)` imported from `browse.js`

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `data-api` positions fetch fails | Returns `[]`, no positions section shown |
| Exact slug fetch returns 200 | Return market, skip keyword search |
| Exact slug fetch returns 404 | Auto-retry with keyword search (cap 5) |
| Keyword search returns 0 results | `throw new Error('Market not found: <query>')` |
| Keyword search returns 1 result | Auto-proceed |
| Keyword search returns 2-5 results | Print list, `process.exit(1)` with slug hint |

## Testing

### Unit Tests

**`balance.test.js`** — new tests for `fetchPositions`:
- Returns parsed positions array on success (mock axios response with fields: `{ outcome, slug, size, curPrice, currentValue }`)
- Returns `[]` on network error (silent skip)
- `formatBalances` renders Positions section when `positions.length > 0`
- `formatBalances` omits Positions section when `positions` is empty

**`browse.test.js`** — new tests for `resolveMarket`:
- Exact slug hit → returns single market object
- 404 fallback, single keyword result → returns that market
- 404 fallback, multiple results → calls `process.exit(1)` and prints list
- 404 fallback, no results → throws `Market not found`

### SKILL.tests.yaml

- `full-balance-positions`: balance output contains `Positions` and `shares`
- `full-trade-keyword`: trade with keyword input resolves to matching market

## Files Modified

| File | Change |
|------|--------|
| `scripts/balance.js` | Add `fetchPositions`, update `getBalances` (add `positions` field), update `formatBalances` |
| `scripts/browse.js` | Add exported `resolveMarket(query, cfg)` |
| `scripts/trade.js` | Replace inline market IIFE with `resolveMarket` import from `browse.js` |
| `scripts/__tests__/balance.test.js` | New tests for `fetchPositions` and updated `formatBalances` |
| `scripts/__tests__/browse.test.js` | New tests for `resolveMarket` |
| `config.example.yaml` | Add `data_url` nested under `polymarket:` — exact snippet: `  data_url: "https://data-api.polymarket.com"` (alongside `clob_url`, `gamma_url`, `chain_id`) |
| `SKILL.tests.yaml` | Add 2 test cases |
