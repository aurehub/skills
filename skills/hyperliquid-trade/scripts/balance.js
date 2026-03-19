#!/usr/bin/env node
/**
 * balance.js <address|spot|perp>
 *
 * address → { "address": "0x..." }
 * spot    → { "balances": [...] }
 * perp    → { "assetPositions": [...], "marginSummary": {...}, "withdrawable": "..." }
 */
import { loadConfig } from './lib/config.js';
import { createSigner } from './lib/signer.js';
import { createTransport, createInfoClient } from './lib/hl-client.js';

const [,, subcommand] = process.argv;

if (!['address', 'spot', 'perp'].includes(subcommand)) {
  process.stderr.write(JSON.stringify({ error: `Unknown subcommand: ${subcommand}. Use address|spot|perp` }) + '\n');
  process.exit(1);
}

try {
  const cfg = loadConfig();
  const wallet = await createSigner(cfg, null);
  const address = await wallet.getAddress();

  if (subcommand === 'address') {
    process.stdout.write(JSON.stringify({ address }) + '\n');
    process.exit(0);
  }

  const transport = createTransport(cfg);
  const info = createInfoClient(transport);

  if (subcommand === 'spot') {
    const result = await info.spotClearinghouseState({ user: address });
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    // perp
    const result = await info.clearinghouseState({ user: address });
    process.stdout.write(JSON.stringify({
      assetPositions: result.assetPositions,
      marginSummary: result.marginSummary,
      withdrawable: result.withdrawable,
    }) + '\n');
  }
  process.exit(0);
} catch (err) {
  process.stderr.write(JSON.stringify({ error: err.message }) + '\n');
  process.exit(1);
}
