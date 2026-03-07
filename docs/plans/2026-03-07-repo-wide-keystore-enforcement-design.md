# Repo-wide Keystore Enforcement Design

## Context

The repository currently allows runtime signing through both:
- Foundry keystore (`FOUNDRY_ACCOUNT` + `KEYSTORE_PASSWORD_FILE`)
- `PRIVATE_KEY` fallback in some skills and references

This creates inconsistent security boundaries and increases maintenance burden across skills.

## Decision

Adopt a repository-wide hard policy:
1. Runtime `PRIVATE_KEY` direct signing is forbidden in all skills.
2. Runtime signing must use Foundry keystore only:
   - `FOUNDRY_ACCOUNT`
   - `KEYSTORE_PASSWORD_FILE`
3. `PRIVATE_KEY` is allowed only as a one-time onboarding input for importing into keystore, not as runtime signing config.
4. Wallet initialization methods remain exactly two:
   - Import existing private key into keystore (interactive)
   - Create a new wallet directly as keystore (no private key plaintext display path in our documented flow)

## Scope

Applies to all skill packages under `skills/*`.

Change surfaces include:
- `SKILL.md`
- `README.md`
- `references/*`
- `scripts/*` (including runtime helpers)
- `SKILL.tests.yaml`
- repo-level governance docs (`AGENTS.md` and/or policy docs)

## Repository Enforcement Model

### 1) Policy Layer

Define repository-level prohibited pattern:
- No runtime branch that signs with `PRIVATE_KEY`.

Define required runtime contract for trade-like skills:
- Hard-stop unless keystore account exists and password file is readable.
- Hard-stop when `PRIVATE_KEY` is detected in runtime config, with migration instructions.

### 2) Implementation Layer

For each skill implementation:
- Remove runtime `PRIVATE_KEY` branches from scripts and command examples.
- Normalize signing command shape to:
  - `cast ... --account "$FOUNDRY_ACCOUNT" --password-file "$KEYSTORE_PASSWORD_FILE" ...`

### 3) Onboarding Layer

Normalize wallet setup guidance:
- Existing key import: `cast wallet import <account> --interactive`
- New wallet creation: direct keystore creation flow (no documented two-step "new then import plaintext key" flow)

### 4) CI / Review Layer

Add repository checks to prevent policy regressions:
- Static grep checks for runtime private-key signing patterns.
- PR checklist confirmation that no runtime `PRIVATE_KEY` path was introduced.

## Migration Strategy

Release as breaking change (`major`).

At runtime:
- If `PRIVATE_KEY` is present, hard-stop and print migration steps.

Migration path:
1. Import key into keystore interactively.
2. Create/update `~/.aurehub/.wallet.password` with `chmod 600`.
3. Switch `.env` to keystore variables and remove `PRIVATE_KEY`.

No runtime downgrade switch is provided.

## Risks and Mitigations

1. User disruption for legacy `PRIVATE_KEY` setups.
- Mitigation: precise hard-stop message + executable migration commands in output and docs.

2. Doc-implementation drift.
- Mitigation: aligned edits in `SKILL.md` + references + scripts + tests, and CI policy checks.

3. Unsafe wallet creation instructions reintroduced later.
- Mitigation: codify approved onboarding patterns in repo guidelines and tests.

## Verification Matrix

### Config behavior
- Keystore-only config: pass.
- `PRIVATE_KEY`-only config: hard-stop with migration guidance.
- Mixed config (`FOUNDRY_ACCOUNT` + `PRIVATE_KEY`): hard-stop (require removing `PRIVATE_KEY`).

### Runtime behavior
- Market flows use only keystore signing.
- Limit-order flows use only keystore signing.

### Repository compliance
- No runtime `PRIVATE_KEY` signing code paths remain.
- No docs advertise runtime `PRIVATE_KEY` fallback.

## Rollout Plan

1. Introduce policy docs and checks.
2. Migrate skills in focused batches (starting with `xaut-trade`).
3. Run validation matrix.
4. Publish as major release with migration notes.
