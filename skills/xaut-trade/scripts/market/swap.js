/**
 * swap.js — CLI entry point for market operations.
 *
 * Usage:
 *   node market/swap.js <command> [options]
 *
 * Commands:
 *   address    — output wallet address
 *   balance    — output ETH, USDT, XAUT balances
 *   allowance  — output ERC-20 allowance  (requires --token)
 *   quote      — get a Uniswap V3 quote   (requires --side, --amount)
 *   approve    — approve a token spender  (requires --token, --amount)
 *   swap       — execute a swap           (requires --side, --amount, --min-out)
 */

import { fileURLToPath } from 'node:url';
import { formatUnits } from 'ethers';
import { loadConfig, resolveToken } from './lib/config.js';
import { createProvider } from './lib/provider.js';
import { createSigner } from './lib/signer.js';
import { getBalance, getAllowance, approve } from './lib/erc20.js';
import { quote, buildSwap } from './lib/uniswap.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_COMMANDS = new Set(['quote', 'balance', 'allowance', 'approve', 'swap', 'address']);

// ---------------------------------------------------------------------------
// CLI argument parser — exported for unit-testing without RPC
// ---------------------------------------------------------------------------

/**
 * Parse raw argv (everything after "node swap.js") into a structured object.
 *
 * @param {string[]} argv  e.g. ['quote', '--side', 'buy', '--amount', '100']
 * @returns {{ command: string, side?: string, amount?: string, minOut?: string, token?: string, configDir?: string }}
 */
export function parseCliArgs(argv) {
  const [command, ...rest] = argv;

  if (!VALID_COMMANDS.has(command)) {
    throw new Error(`Unknown command: "${command}". Valid commands: ${[...VALID_COMMANDS].join(', ')}`);
  }

  const parsed = { command };

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = rest[i + 1];

    switch (flag) {
      case '--side':
        parsed.side = value;
        i++;
        break;
      case '--amount':
        parsed.amount = value;
        i++;
        break;
      case '--min-out':
        parsed.minOut = value;
        i++;
        break;
      case '--token':
        parsed.token = value;
        i++;
        break;
      case '--config-dir':
        parsed.configDir = value;
        i++;
        break;
      default:
        // Ignore unknown flags silently
        break;
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Subcommand implementations
// ---------------------------------------------------------------------------

async function runAddress(cfg, provider) {
  const signer = await createSigner(cfg, provider ? provider.getEthersProvider() : null);
  console.log(JSON.stringify({ address: signer.address }, null, 2));
}

async function runBalance(cfg, provider) {
  const signer = await createSigner(cfg, provider ? provider.getEthersProvider() : null);
  const address = signer.address;

  const tokens = cfg.yaml?.tokens ?? {};
  const usdtToken = resolveToken(cfg, 'USDT');
  const xautToken = resolveToken(cfg, 'XAUT');

  const [usdtBalance, xautBalance, ethBalanceRaw] = await Promise.all([
    getBalance(usdtToken, address, provider),
    getBalance(xautToken, address, provider),
    provider.getBalance(address),
  ]);

  // ethBalanceRaw is a hex string from the raw JSON-RPC; convert to ETH string
  const ethBig = BigInt(ethBalanceRaw);
  const ethBalance = formatUnits(ethBig, 18);

  console.log(JSON.stringify({ address, ETH: ethBalance, USDT: usdtBalance, XAUT: xautBalance }, null, 2));
}

async function runAllowance(cfg, provider, args) {
  if (!args.token) throw new Error('--token is required for allowance');

  const signer = await createSigner(cfg, provider ? provider.getEthersProvider() : null);
  const address = signer.address;

  const token = resolveToken(cfg, args.token);
  const contracts = cfg.yaml?.contracts ?? {};
  const spender = contracts.router;
  if (!spender) throw new Error('contracts.router not set in config.yaml');

  const allowance = await getAllowance(token, address, spender, provider);
  console.log(JSON.stringify({ token: args.token, allowance, spender }, null, 2));
}

async function runQuote(cfg, provider, args) {
  if (!args.side) throw new Error('--side is required for quote');
  if (!args.amount) throw new Error('--amount is required for quote');

  // Resolve pair: buy = USDT→XAUT, sell = XAUT→USDT
  const isBuy = args.side === 'buy';
  const tokenIn = resolveToken(cfg, isBuy ? 'USDT' : 'XAUT');
  const tokenOut = resolveToken(cfg, isBuy ? 'XAUT' : 'USDT');

  const fee = _resolveFee(cfg, isBuy ? 'USDT' : 'XAUT', isBuy ? 'XAUT' : 'USDT');
  const contracts = cfg.yaml?.contracts ?? {};
  if (!contracts.quoter) throw new Error('contracts.quoter not set in config.yaml');

  const result = await quote({
    tokenIn,
    tokenOut,
    amountIn: args.amount,
    fee,
    contracts,
    provider,
  });

  // Convert bigints to strings for JSON output
  console.log(JSON.stringify({
    side: args.side,
    amountIn: args.amount,
    amountOut: result.amountOut,
    amountOutRaw: result.amountOutRaw.toString(),
    sqrtPriceX96: result.sqrtPriceX96.toString(),
    gasEstimate: result.gasEstimate.toString(),
  }, null, 2));
}

async function runApprove(cfg, provider, args) {
  if (!args.token) throw new Error('--token is required for approve');
  if (!args.amount) throw new Error('--amount is required for approve');

  const signer = await createSigner(cfg, provider ? provider.getEthersProvider() : null);
  const token = resolveToken(cfg, args.token);
  const contracts = cfg.yaml?.contracts ?? {};
  const spender = contracts.router;
  if (!spender) throw new Error('contracts.router not set in config.yaml');

  // Check token_rules for requiresResetApprove
  const tokenRules = cfg.yaml?.token_rules ?? {};
  const rules = tokenRules[args.token] ?? {};
  const requiresResetApprove = rules.requires_reset_approve ?? false;

  const result = await approve(token, spender, args.amount, signer, { requiresResetApprove });

  console.log(JSON.stringify({ token: args.token, amount: args.amount, spender, txHash: result.hash }, null, 2));
}

async function runSwap(cfg, provider, args) {
  if (!args.side) throw new Error('--side is required for swap');
  if (!args.amount) throw new Error('--amount is required for swap');
  if (!args.minOut) throw new Error('--min-out is required for swap');

  const signer = await createSigner(cfg, provider ? provider.getEthersProvider() : null);
  const address = signer.address;

  const isBuy = args.side === 'buy';
  const tokenIn = resolveToken(cfg, isBuy ? 'USDT' : 'XAUT');
  const tokenOut = resolveToken(cfg, isBuy ? 'XAUT' : 'USDT');

  const fee = _resolveFee(cfg, isBuy ? 'USDT' : 'XAUT', isBuy ? 'XAUT' : 'USDT');
  const contracts = cfg.yaml?.contracts ?? {};
  if (!contracts.router) throw new Error('contracts.router not set in config.yaml');

  const risk = cfg.yaml?.risk ?? {};
  const deadline = Math.floor(Date.now() / 1000) + (risk.deadline_seconds ?? 300);

  const tx = buildSwap({
    tokenIn,
    tokenOut,
    amountIn: args.amount,
    minAmountOut: args.minOut,
    fee,
    recipient: address,
    deadline,
    contracts,
  });

  const sentTx = await signer.sendTransaction(tx);
  const receipt = await sentTx.wait();

  console.log(JSON.stringify({
    side: args.side,
    amountIn: args.amount,
    minAmountOut: args.minOut,
    txHash: sentTx.hash,
    status: receipt.status === 1 ? 'success' : 'failed',
    gasUsed: receipt.gasUsed.toString(),
  }, null, 2));
}

// ---------------------------------------------------------------------------
// Helper: resolve pool fee from config.yaml pairs
// ---------------------------------------------------------------------------

function _resolveFee(cfg, symbolIn, symbolOut) {
  const pairs = cfg.yaml?.pairs ?? [];
  for (const pair of pairs) {
    if (!pair.enabled) continue;
    if (
      (pair.token_in === symbolIn && pair.token_out === symbolOut) ||
      (pair.token_in === symbolOut && pair.token_out === symbolIn)
    ) {
      return pair.fee_tier;
    }
  }
  // Default to 3000 (0.3%) if no matching pair found
  return 3000;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  const argv = process.argv.slice(2);

  let parsed;
  try {
    parsed = parseCliArgs(argv);
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  }

  const cfg = loadConfig(parsed.configDir);
  const provider = createProvider(cfg.env);

  (async () => {
    try {
      switch (parsed.command) {
        case 'address':
          await runAddress(cfg, provider);
          break;
        case 'balance':
          await runBalance(cfg, provider);
          break;
        case 'allowance':
          await runAllowance(cfg, provider, parsed);
          break;
        case 'quote':
          await runQuote(cfg, provider, parsed);
          break;
        case 'approve':
          await runApprove(cfg, provider, parsed);
          break;
        case 'swap':
          await runSwap(cfg, provider, parsed);
          break;
      }
    } catch (err) {
      console.error(JSON.stringify({ error: err.message }));
      process.exit(1);
    }
  })();
}
