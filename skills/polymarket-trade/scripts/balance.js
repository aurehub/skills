import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { ethers } from 'ethers';
import { loadConfig, resolveRpcUrl } from './lib/config.js';
import { createSigner } from './lib/signer.js';
import { createL2Client } from './lib/clob.js';
import { checkEnvFile, checkVaultFile, checkPasswordFile, checkConfigFile } from './setup.js';

const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
const AUREHUB_DIR = join(homedir(), '.aurehub');

export async function getBalances(cfg) {
  const rpcUrl = resolveRpcUrl(cfg);
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = (await createSigner(cfg)).connect(provider);
  const address = wallet.address;

  const contracts = cfg.yaml?.contracts ?? {};
  const usdceAddr = contracts.usdc_e ?? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

  const polBal   = await provider.getBalance(address);
  const usdce    = new ethers.Contract(usdceAddr, ERC20_ABI, provider);
  const usdceBal = await usdce.balanceOf(address);

  const result = {
    address,
    pol:   parseFloat(ethers.utils.formatEther(polBal)).toFixed(4),
    usdce: ethers.utils.formatUnits(usdceBal, 6),
    clob:  null,
  };

  const credsPath = join(AUREHUB_DIR, '.polymarket_clob');
  if (existsSync(credsPath)) {
    try {
      const client = await createL2Client(cfg, wallet, credsPath);
      await client.updateBalanceAllowance({ asset_type: 'COLLATERAL' });
      const bal = await client.getBalanceAllowance({ asset_type: 'COLLATERAL' });
      result.clob = (parseFloat(bal.balance) / 1e6).toFixed(2);
    } catch { /* CLOB balance optional */ }
  }

  return result;
}

export function formatBalances(b) {
  const lines = [`💰 ${b.address}`, `   POL:    ${b.pol}`, `   USDC.e: $${b.usdce}  ← trading token`];
  if (b.clob !== null) lines.push(`   CLOB:   $${b.clob}  ← available for orders`);
  lines.push('');
  return lines.join('\n');
}

// ── CLI entry point ───────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      checkEnvFile(); checkVaultFile(); checkPasswordFile(); checkConfigFile();
      const cfg = loadConfig();
      const b = await getBalances(cfg);
      console.log(formatBalances(b));
    } catch (e) {
      console.error('❌', e.message);
      process.exit(1);
    }
  })();
}
