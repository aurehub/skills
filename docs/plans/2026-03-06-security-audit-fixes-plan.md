# Security Audit Fixes (P1 + P2) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix skills.sh Agent Trust Hub audit findings by making rankings registration opt-in and adding security/privacy disclosure.

**Architecture:** Five file edits — no new files, no new dependencies. Changes are purely documentation and shell script logic.

**Tech Stack:** Bash (setup.sh), Markdown (SKILL.md, README.md, onboarding.md, .env.example)

---

### Task 1: Add rankings opt-in step to setup.sh

**Files:**
- Modify: `skills/xaut-trade/scripts/setup.sh:282` (insert new step before verification)

**Step 1: Add new Step 8 (Activity Rankings) after the npm dependencies block (line 281) and before the verification step**

Insert between line 281 (`fi`) and line 282 (blank line before `# ── Step 8: Verification`):

```bash
# ── Step 8: Activity rankings (optional) ─────────────────────────────────────
step "Activity rankings (optional)"

echo -e "  Would you like to join the XAUT trade activity rankings?"
echo -e "  This will share your ${BOLD}wallet address${NC} and a ${BOLD}nickname${NC} with https://xaue.com"
echo -e "  You can change this anytime by editing ~/.aurehub/.env"
echo
read -rp "  Join rankings? [y/N]: " JOIN_RANKINGS
if [[ "${JOIN_RANKINGS:-}" =~ ^[Yy]$ ]]; then
  read -rp "  Enter your nickname: " RANKINGS_NICKNAME
  if [ -n "$RANKINGS_NICKNAME" ]; then
    echo "RANKINGS_OPT_IN=true" >> ~/.aurehub/.env
    echo "NICKNAME=$RANKINGS_NICKNAME" >> ~/.aurehub/.env
    ok "Rankings enabled (nickname: $RANKINGS_NICKNAME)"
  else
    echo "RANKINGS_OPT_IN=false" >> ~/.aurehub/.env
    ok "Rankings skipped (empty nickname)"
  fi
else
  echo "RANKINGS_OPT_IN=false" >> ~/.aurehub/.env
  ok "Rankings skipped"
fi
```

**Step 2: Update the old Step 8 comment to Step 9**

Change `# ── Step 8: Verification` to `# ── Step 9: Verification`.

**Step 3: Verify setup.sh still runs**

Run: `bash -n skills/xaut-trade/scripts/setup.sh`
Expected: no syntax errors (exit 0)

**Step 4: Commit**

```bash
git add skills/xaut-trade/scripts/setup.sh
git commit -m "feat(setup): add opt-in activity rankings step

Move rankings registration from post-trade (opt-out) to onboarding
(opt-in). Default is to not share any data."
```

---

### Task 2: Rewrite Post-Trade Registration in SKILL.md

**Files:**
- Modify: `skills/xaut-trade/SKILL.md:148-170`

**Step 1: Replace the Post-Trade Registration section (lines 148-170)**

Replace from `## Post-Trade Registration` through line 170 (the last line before `## Limit Buy Flow`) with:

```markdown
## Post-Trade Registration

After **any** on-chain trade completes successfully (buy swap, sell swap, or limit order placed):

1. `source ~/.aurehub/.env`
2. If `RANKINGS_OPT_IN` != `"true"` → silent skip, do not prompt
3. `REGISTERED=$(cat ~/.aurehub/.registered 2>/dev/null)`
4. `WALLET_ADDRESS=$(cast wallet address --account "$FOUNDRY_ACCOUNT")`
5. If `"$REGISTERED"` starts with `"$WALLET_ADDRESS:"` → already registered, silent skip
6. Otherwise → register using `NICKNAME` from `.env`:
   ```bash
   REGISTER_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
     https://xaue.com/api/rankings/participants \
     -H 'Content-Type: application/json' \
     -d "{\"wallet_address\":\"$WALLET_ADDRESS\",\"nickname\":\"$NICKNAME\",\"source\":\"agent\"}")
   ```
   - HTTP 200 or 201: `echo "$WALLET_ADDRESS:$NICKNAME" > ~/.aurehub/.registered`; inform: "Registered with nickname: $NICKNAME"
   - Any other status: silent continue, do not write marker file

Never ask the user for a nickname during the trade flow. The nickname is set during onboarding only.
```

**Step 2: Commit**

```bash
git add skills/xaut-trade/SKILL.md
git commit -m "fix(security): rewrite post-trade registration as opt-in

Rankings data is only sent when RANKINGS_OPT_IN=true in .env.
No prompts during trade flow."
```

---

### Task 3: Add External Communications notice to SKILL.md

**Files:**
- Modify: `skills/xaut-trade/SKILL.md:20-21` (between "When to Use" and "Environment Readiness Check")

**Step 1: Insert a new section after line 19 (`- **Sell**: XAUT → USDT`)**

Add after the "When to Use" section, before `## Environment Readiness Check`:

```markdown

## External Communications

This skill connects to external services (Ethereum RPC, UniswapX API, and optionally xaue.com rankings). On first setup, it may install Foundry via `curl | bash`. Inform the user before executing any external communication for the first time. See the README for a full list.
```

**Step 2: Commit**

```bash
git add skills/xaut-trade/SKILL.md
git commit -m "docs(security): add external communications notice to SKILL.md"
```

---

### Task 4: Add Security & Privacy section to README.md

**Files:**
- Modify: `skills/xaut-trade/README.md` (insert before `## FAQ` at line 294)

**Step 1: Insert the Security & Privacy section before the FAQ heading**

Add before `## FAQ`:

```markdown
## Security & Privacy

This skill communicates with external services during setup and trading:

| Service | When | Data Sent |
|---------|------|-----------|
| foundry.paradigm.xyz | First setup | Downloads and executes Foundry installer (`curl \| bash`) |
| npmjs.com | Limit order setup | Downloads Node.js dependencies |
| Ethereum RPC (configurable) | Every trade | On-chain calls (wallet address, transaction data) |
| UniswapX API (api.uniswap.org) | Limit orders | Order data, wallet address |
| xaue.com Rankings API | Opt-in only | Wallet address, nickname |

- **Foundry installation** uses `curl | bash`. Review the source at [github.com/foundry-rs/foundry](https://github.com/foundry-rs/foundry) before proceeding. The setup script asks for confirmation before running.
- **Rankings registration** is opt-in. No data is sent to xaue.com unless you explicitly enable it during setup. You can change this anytime by editing `RANKINGS_OPT_IN` in `~/.aurehub/.env`.
- **All API calls use HTTPS.**

```

**Step 2: Update the FAQ entry about API keys to reflect opt-in**

In the FAQ, find:

```
**Q: Will you read my API Key or private key from `.env`?**

No. The Skill package runs entirely locally and contains no data collection or reporting logic.
```

Replace with:

```
**Q: Will you read my API Key or private key from `.env`?**

No. The Skill package runs entirely locally. The only optional external data sharing is the activity rankings feature (opt-in during setup, sends wallet address and nickname to xaue.com). All trades are executed via local `cast` — no intermediary servers.
```

**Step 3: Update the NICKNAME row in the .env config table**

In the Configuration section, find:

```
| `NICKNAME` | Display name for activity rankings (optional, set automatically on first use if omitted) | `Alice` |
```

Replace with:

```
| `RANKINGS_OPT_IN` | Join activity rankings — opt-in only (default: `false`) | `true` or `false` |
| `NICKNAME` | Display name for activity rankings (required if `RANKINGS_OPT_IN=true`) | `Alice` |
```

**Step 4: Commit**

```bash
git add skills/xaut-trade/README.md
git commit -m "docs(security): add Security & Privacy section to README

List all external communications with data sent.
Update FAQ and config table to reflect opt-in rankings."
```

---

### Task 5: Update .env.example

**Files:**
- Modify: `skills/xaut-trade/.env.example:21-22`

**Step 1: Replace the NICKNAME comment block at the end of the file**

Replace lines 21-22:

```
# Optional: nickname for future activities (set automatically on first use if not provided here)
# NICKNAME=YourName
```

With:

```
# Optional: activity rankings (opt-in, set during setup)
# RANKINGS_OPT_IN=false
# NICKNAME=YourName
```

**Step 2: Commit**

```bash
git add skills/xaut-trade/.env.example
git commit -m "docs: add RANKINGS_OPT_IN to .env.example"
```

---

### Task 6: Update onboarding.md with manual rankings step

**Files:**
- Modify: `skills/xaut-trade/references/onboarding.md` (append after the limit orders section at line 157)

**Step 1: Add a new section at the end of onboarding.md**

Append after line 157 (`Neither of the above steps is needed for market orders (Uniswap V3).`):

```markdown

---

## Activity Rankings (optional)

To join the XAUT trade activity rankings, add the following to `~/.aurehub/.env`:

```bash
echo 'RANKINGS_OPT_IN=true' >> ~/.aurehub/.env
echo 'NICKNAME=YourName' >> ~/.aurehub/.env
```

This shares your wallet address and nickname with https://xaue.com after your first trade. You can disable it anytime by setting `RANKINGS_OPT_IN=false`.

If you do not add these lines, no data is sent — rankings are opt-in only.
```

**Step 2: Commit**

```bash
git add skills/xaut-trade/references/onboarding.md
git commit -m "docs: add manual rankings opt-in step to onboarding"
```

---

### Task 7: Final verification and push

**Step 1: Review all changes**

Run: `git log --oneline -6` to verify all 5 commits are present.

**Step 2: Push**

```bash
git push
```
