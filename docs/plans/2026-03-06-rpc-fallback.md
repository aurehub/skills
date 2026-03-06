# RPC Fallback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automatic RPC fallback to xaut-trade so that network errors (429/502/timeout) on the primary RPC transparently retry on a configurable list of backup nodes.

**Architecture:** Passive error-aware fallback — only network errors trigger a switch, not contract/application errors. Once switched, the agent stays on the selected fallback for the rest of the session via conversation context (no writes needed). Fallback list stored in `ETH_RPC_URL_FALLBACK` in `.env` so users can add paid nodes.

**Tech Stack:** Markdown skill instructions (SKILL.md), shell heredocs (onboarding.md), config files (.env.example, README.md)

---

### Task 1: Update `.env.example`

**Files:**
- Modify: `skills/xaut-trade/.env.example:5`

**Step 1: Add `ETH_RPC_URL_FALLBACK` after `ETH_RPC_URL`**

Replace:
```
ETH_RPC_URL=https://eth.llamarpc.com
```
With:
```
ETH_RPC_URL=https://eth.llamarpc.com
# Fallback RPCs tried in order when primary fails with a network error (429/502/timeout)
# Add a paid Alchemy/Infura node at the front for higher reliability
ETH_RPC_URL_FALLBACK=https://eth.merkle.io,https://rpc.flashbots.net/fast,https://eth.drpc.org,https://ethereum.publicnode.com
```

**Step 2: Verify**

```bash
cat skills/xaut-trade/.env.example
```
Expected: `ETH_RPC_URL_FALLBACK` line appears after `ETH_RPC_URL`.

**Step 3: Commit**

```bash
git add skills/xaut-trade/.env.example
git commit -m "feat(xaut-trade): add ETH_RPC_URL_FALLBACK to .env.example"
```

---

### Task 2: Update `onboarding.md` — Step 3 heredoc and RPC note

**Files:**
- Modify: `skills/xaut-trade/references/onboarding.md:95-105`

**Step 1: Add `ETH_RPC_URL_FALLBACK` line inside the heredoc**

The heredoc currently ends at line 102 (`EOF`). Insert the new line after `ETH_RPC_URL=https://eth.llamarpc.com`:

```
ETH_RPC_URL=https://eth.llamarpc.com
# Fallback RPCs (tried in order on network error; add a paid node at front for reliability)
ETH_RPC_URL_FALLBACK=https://eth.merkle.io,https://rpc.flashbots.net/fast,https://eth.drpc.org,https://ethereum.publicnode.com
```

**Step 2: Replace the RPC note at line 105**

Replace:
```
> If the user has a faster RPC (e.g. Alchemy/Infura), replace `ETH_RPC_URL`.
```
With:
```
> If the user has a paid RPC (e.g. Alchemy/Infura), replace `ETH_RPC_URL` or prepend it to `ETH_RPC_URL_FALLBACK` for automatic failover.
```

**Step 3: Verify**

```bash
grep -A2 "ETH_RPC_URL=" skills/xaut-trade/references/onboarding.md
```
Expected: `ETH_RPC_URL_FALLBACK` line appears inside the heredoc block.

**Step 4: Commit**

```bash
git add skills/xaut-trade/references/onboarding.md
git commit -m "feat(xaut-trade): add ETH_RPC_URL_FALLBACK to onboarding heredoc"
```

---

### Task 3: Update `README.md`

**Files:**
- Modify: `skills/xaut-trade/README.md:72-76` (heredoc example)
- Modify: `skills/xaut-trade/README.md:195` (config table)

**Step 1: Add `ETH_RPC_URL_FALLBACK` to the heredoc example (line ~72)**

Replace:
```
ETH_RPC_URL=https://eth.llamarpc.com
FOUNDRY_ACCOUNT=aurehub-wallet
KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password
# UNISWAPX_API_KEY=your_key_here   # required for limit orders only
```
With:
```
ETH_RPC_URL=https://eth.llamarpc.com
ETH_RPC_URL_FALLBACK=https://eth.merkle.io,https://rpc.flashbots.net/fast,https://eth.drpc.org,https://ethereum.publicnode.com
FOUNDRY_ACCOUNT=aurehub-wallet
KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password
# UNISWAPX_API_KEY=your_key_here   # required for limit orders only
```

**Step 2: Add row to the `.env` config table (after `ETH_RPC_URL` row at line ~195)**

Insert after the `ETH_RPC_URL` row:
```
| `ETH_RPC_URL_FALLBACK` | Comma-separated fallback RPCs tried in order on network error (429/502/timeout) | `https://eth.merkle.io,...` |
```

**Step 3: Verify**

```bash
grep -n "ETH_RPC_URL_FALLBACK" skills/xaut-trade/README.md
```
Expected: two matches (heredoc block and config table).

**Step 4: Commit**

```bash
git add skills/xaut-trade/README.md
git commit -m "docs(xaut-trade): add ETH_RPC_URL_FALLBACK to README config table and example"
```

---

### Task 4: Update `SKILL.md` — add RPC Fallback section

**Files:**
- Modify: `skills/xaut-trade/SKILL.md:87-88` (insert new section before Intent Detection)
- Modify: `skills/xaut-trade/SKILL.md:204` (update Error Handling entry)

**Step 1: Insert RPC Fallback section before `## Intent Detection` (line 88)**

Insert the following block between `## Mandatory Safety Gates` and `## Intent Detection`:

```markdown
## RPC Fallback

After sourcing `~/.aurehub/.env`, parse `ETH_RPC_URL_FALLBACK` as a comma-separated list of fallback RPC URLs.

If any `cast call` or `cast send` command fails and its output contains any of the following:
`429`, `502`, `503`, `timeout`, `connection refused`, `rate limit`, `Too Many Requests`

Then:
1. Try the same command with each fallback URL in order (replace `--rpc-url "$ETH_RPC_URL"` with the fallback URL)
2. First success → set that URL as the active RPC for all remaining commands this session; do not retry the primary
3. All fallbacks exhausted → hard-stop with:
   > RPC unavailable. All configured nodes failed (primary + N fallbacks).
   > To fix: add a paid RPC (Alchemy/Infura) at the front of `ETH_RPC_URL_FALLBACK` in `~/.aurehub/.env`

Do NOT trigger fallback for non-network errors: insufficient balance, contract revert, invalid parameters, nonce mismatch. Report these directly to the user.

**Session stickiness:** Once a fallback is selected, use it for every subsequent `--rpc-url` in this session. Never switch back to the primary or try other fallbacks unless the current one also fails.
```

**Step 2: Update Error Handling entry (line ~204)**

Replace:
```
- RPC unavailable: prompt to switch RPC node and stop
```
With:
```
- RPC network error (429/502/timeout): trigger RPC fallback sequence (see RPC Fallback section)
```

**Step 3: Verify**

```bash
grep -n "RPC Fallback\|fallback\|ETH_RPC_URL_FALLBACK" skills/xaut-trade/SKILL.md
```
Expected: new section heading and references appear.

**Step 4: Commit**

```bash
git add skills/xaut-trade/SKILL.md
git commit -m "feat(xaut-trade): add RPC fallback logic to SKILL.md"
```

---

### Task 5: Final verification

**Step 1: Check all four files have been updated**

```bash
grep -l "ETH_RPC_URL_FALLBACK" \
  skills/xaut-trade/.env.example \
  skills/xaut-trade/references/onboarding.md \
  skills/xaut-trade/README.md \
  skills/xaut-trade/SKILL.md
```
Expected: all four file paths printed.

**Step 2: Check SKILL.md RPC Fallback section is well-formed**

```bash
grep -A 20 "## RPC Fallback" skills/xaut-trade/SKILL.md
```
Expected: full section with trigger conditions, retry loop, hard-stop, and session stickiness rule.

**Step 3: Confirm no unintended changes**

```bash
git diff --stat HEAD~4 HEAD
```
Expected: only the four target files changed across the four commits.
