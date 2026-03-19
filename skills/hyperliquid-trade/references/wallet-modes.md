# Wallet Modes

## WDK Mode (Recommended)

- **Storage**: Encrypted vault (`~/.aurehub/.wdk_vault`) — PBKDF2-SHA256 + XSalsa20-Poly1305
- **Encryption**: PBKDF2 with 100k iterations, seed never stored as plaintext
- **Dependencies**: Node.js >= 18 only — no external tools required
- **Config**: `WALLET_MODE=wdk` + `WDK_PASSWORD_FILE` in `.env`
- **Shared**: Same vault used by xaut-trade and other aurehub skills

## Foundry Mode (Advanced)

- **Storage**: Foundry keystore (`~/.foundry/keystores/<account>`) — standard Web3 Secret Storage
- **Encryption**: Scrypt-based (Foundry default)
- **Dependencies**: Foundry (`cast`) must be installed
- **Config**: `WALLET_MODE=foundry` + `FOUNDRY_ACCOUNT` + `KEYSTORE_PASSWORD_FILE` in `.env`

## Security Comparison

| Feature | WDK | Foundry |
|---------|-----|---------|
| Encryption at rest | PBKDF2 + XSalsa20-Poly1305 | Scrypt |
| External tool required | No | Yes (Foundry) |
| Key derivation | BIP-39/BIP-44 HD wallet | Single key per keystore |
| Shared with xaut-trade | Yes (same vault) | No (separate keystore) |

## Note on Hyperliquid address

Hyperliquid uses EVM-compatible addresses. Your wallet address (from WDK or Foundry) is the same address you use on Hyperliquid. Verify with:
```bash
node "$SCRIPTS_DIR/balance.js" address
```
