import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import { loadConfig, resolveRpcUrl } from './lib/config.js';
import { createSigner } from './lib/signer.js';
import { createL1Client } from './lib/clob.js';

const AUREHUB_DIR = join(homedir(), '.aurehub');
const SETUP_PATH_FILE = join(AUREHUB_DIR, '.polymarket_setup_path');
// SCRIPTS_DIR = absolute path to this scripts/ directory (written to .polymarket_setup_path at setup time)
const SCRIPTS_DIR = fileURLToPath(new URL('.', import.meta.url));

// ── Exported check functions (used by all scripts) ────────────────────────────

export function checkEnvFile(aurehubDir = AUREHUB_DIR) {
  const path = join(aurehubDir, '.env');
  if (!existsSync(path)) {
    throw new Error(`Missing ~/.aurehub/.env. Create it with POLYGON_RPC_URL=<your-polygon-rpc-url>`);
  }
}

export function checkVaultFile(aurehubDir = AUREHUB_DIR) {
  const path = join(aurehubDir, '.wdk_vault');
  if (!existsSync(path)) {
    throw new Error(`Missing ~/.aurehub/.wdk_vault. Run the WDK wallet setup first.`);
  }
}

export function checkPasswordFile(aurehubDir = AUREHUB_DIR) {
  const path = join(aurehubDir, '.wdk_password');
  if (!existsSync(path)) {
    throw new Error(`Missing ~/.aurehub/.wdk_password.`);
  }
}

export function checkConfigFile(aurehubDir = AUREHUB_DIR) {
  const path = join(aurehubDir, 'polymarket.yaml');
  if (!existsSync(path)) {
    throw new Error(
      `Missing ~/.aurehub/polymarket.yaml. Copy config.example.yaml:\n` +
      `  cp <skill-dir>/config.example.yaml ~/.aurehub/polymarket.yaml`,
    );
  }
}

/** Returns true/false (not throws) — caller decides whether to derive. */
export function checkClobCreds(aurehubDir = AUREHUB_DIR) {
  return existsSync(join(aurehubDir, '.polymarket_clob'));
}

export function checkNodeModules(scriptsDir) {
  const nm = join(scriptsDir, 'node_modules');
  if (!existsSync(nm)) {
    throw new Error(
      `node_modules not found at "${nm}".\nRun: cd ${scriptsDir} && npm install`,
    );
  }
}

/** Run all checks for trade flows (steps 1-8). Throws on first failure. */
export function runTradeEnvCheck(aurehubDir = AUREHUB_DIR) {
  checkEnvFile(aurehubDir);
  checkVaultFile(aurehubDir);
  checkPasswordFile(aurehubDir);
  checkConfigFile(aurehubDir);
  // step 5 (RPC URL resolvable) and step 6 (POL balance) are checked in trade.js
  // after provider is created
  if (!checkClobCreds(aurehubDir)) {
    throw new Error(
      `Missing ~/.aurehub/.polymarket_clob. Run: node scripts/setup.js`,
    );
  }
  // step 8: node_modules must exist
  const setupPathFile = join(aurehubDir, '.polymarket_setup_path');
  const scriptsDir = existsSync(setupPathFile)
    ? readFileSync(setupPathFile, 'utf8').trim()
    : SCRIPTS_DIR;
  checkNodeModules(scriptsDir);
}

/** Run env checks for setup flow (steps 1-5 — needs wallet but no CLOB creds yet). */
export function runSetupEnvCheck(aurehubDir = AUREHUB_DIR) {
  checkEnvFile(aurehubDir);
  checkVaultFile(aurehubDir);
  checkPasswordFile(aurehubDir);
  checkConfigFile(aurehubDir);
  // step 5: verify RPC URL env var is configured
  const cfg = loadConfig(aurehubDir);
  resolveRpcUrl(cfg);
}

/** Run env checks for browse flows (steps 1, 4 — no wallet, no gas, no CLOB needed).
 *  Browse uses only public HTTP APIs (Gamma + CLOB); no RPC connection required. */
export function runBrowseEnvCheck(aurehubDir = AUREHUB_DIR) {
  checkEnvFile(aurehubDir);
  checkConfigFile(aurehubDir);
}

// ── CLOB credential derivation ────────────────────────────────────────────────

export async function deriveClobCreds(aurehubDir = AUREHUB_DIR) {
  const cfg = loadConfig(aurehubDir);
  const wallet = await createSigner(cfg);
  const client = await createL1Client(cfg, wallet);
  const creds = await client.createApiKey(0);
  const credsPath = join(aurehubDir, '.polymarket_clob');
  const data = {
    key: creds.key,
    secret: creds.secret,
    passphrase: creds.passphrase,
    nonce: creds.nonce ?? 0,
    derivedAt: new Date().toISOString(),
    walletAddress: wallet.address,
  };
  writeFileSync(credsPath, JSON.stringify(data, null, 2));
  try { chmodSync(credsPath, 0o600); } catch {}
  // Write SCRIPTS_DIR for runtime resolution by other scripts
  writeFileSync(SETUP_PATH_FILE, SCRIPTS_DIR);
  console.log(`✅ CLOB credentials saved to ${credsPath}`);
  console.log(`   Key: ${creds.key.slice(0, 12)}...`);
  console.log(`   Wallet: ${wallet.address}`);
  return data;
}

// ── CLI entry point ───────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      runSetupEnvCheck();  // steps 1-5 including vault + password (needed for L1 signing)
      if (checkClobCreds()) {
        console.log('✅ Already configured. Delete ~/.aurehub/.polymarket_clob to re-derive.');
        process.exit(0);
      }
      await deriveClobCreds();
    } catch (e) {
      console.error('❌', e.message);
      process.exit(1);
    }
  })();
}
