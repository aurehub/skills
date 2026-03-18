import { fileURLToPath } from 'url';
import { join } from 'path';
import { homedir } from 'os';
import { ethers } from 'ethers';
import { loadConfig, resolveRpcUrl } from './lib/config.js';
import { createSigner } from './lib/signer.js';
import { createL2Client } from './lib/clob.js';
import { runTradeEnvCheck } from './setup.js';
import { extractTokenIds, resolveMarket } from './browse.js';

const AUREHUB_DIR = join(homedir(), '.aurehub');
const ERC20_ABI  = ['function balanceOf(address) view returns (uint256)',
                    'function approve(address,uint256) returns (bool)'];
const ERC1155_ABI = ['function balanceOf(address,uint256) view returns (uint256)',
                     'function setApprovalForAll(address,bool)'];

// ── Exported pure helpers (tested) ───────────────────────────────────────────

export function getSafetyLevel(amount, safety) {
  if (amount >= safety.confirm_threshold_usd) return 'confirm';
  if (amount >= safety.warn_threshold_usd)    return 'warn';
  return 'proceed';
}

export function validateHardStops(amount, { usdceBalance, polBalance, marketActive, minOrderSize }) {
  if (!marketActive) throw new Error('Market is CLOSED — cannot trade.');
  if (amount < minOrderSize) throw new Error(`Amount $${amount} is below min order size $${minOrderSize}.`);
  if (usdceBalance < amount) throw new Error(`Insufficient USDC.e: have $${usdceBalance}, need $${amount}.`);
  if (polBalance < 0.01) throw new Error(`Insufficient POL gas: have ${polBalance} POL, need ≥ 0.01.`);
}

// ── Readline helper ───────────────────────────────────────────────────────────

async function confirm(question) {
  const { createInterface } = await import('readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim().toLowerCase()); }));
}

// ── Buy flow ──────────────────────────────────────────────────────────────────

export async function buy({ market, side, amount, cfg, provider, wallet }) {
  const { ClobClient, Side, OrderType } = await import('@polymarket/clob-client');
  const client = await createL2Client(cfg, wallet, join(AUREHUB_DIR, '.polymarket_clob'));

  const ids = extractTokenIds(market);
  const tokenID = side === 'YES' ? ids.YES : ids.NO;
  if (!tokenID) throw new Error(`No ${side} token ID found for this market.`);

  const negRisk = await client.getNegRisk(tokenID);
  const contracts = cfg.yaml?.contracts ?? {};
  const spender = negRisk
    ? (contracts.neg_risk_exchange ?? '0xC5d563A36AE78145C45a50134d48A1215220f80a')
    : (contracts.ctf_exchange      ?? '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E');
  const usdceAddr = contracts.usdc_e ?? '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

  // Preview
  const tickSize = await client.getTickSize(tokenID);
  const ob = await client.getOrderBook(tokenID);
  const bestAsk = parseFloat(ob.asks?.[0]?.price ?? '0.5');
  const estPrice = bestAsk * 1.01;
  const estShares = (amount / estPrice).toFixed(2);
  console.log(`\nPreview:`);
  console.log(`  Spending:       $${amount} USDC.e`);
  console.log(`  Est. price:     $${estPrice.toFixed(4)} per share`);
  console.log(`  Est. shares:    ~${estShares}`);

  // Hard stops
  const usdce = new ethers.Contract(usdceAddr, ERC20_ABI, provider);
  const usdceRaw = await usdce.balanceOf(wallet.address);
  const polRaw = await provider.getBalance(wallet.address);
  validateHardStops(amount, {
    usdceBalance: parseFloat(ethers.utils.formatUnits(usdceRaw, 6)),
    polBalance:   parseFloat(ethers.utils.formatEther(polRaw)),
    marketActive: market.active,
    minOrderSize: parseFloat(market.min_incentive_size ?? '0'),
  });

  // Safety gates
  const safety = cfg.yaml?.safety ?? { warn_threshold_usd: 50, confirm_threshold_usd: 500 };
  const level = getSafetyLevel(amount, safety);
  if (level === 'warn') {
    const ans = await confirm(`⚠️  Buying ${side} at ~$${estPrice.toFixed(4)} for $${amount}. Confirm? (yes/no): `);
    if (ans !== 'yes') { console.log('Cancelled.'); return; }
  } else if (level === 'confirm') {
    const ans1 = await confirm(`⚠️  Large order: $${amount}. Are you sure? (yes/no): `);
    if (ans1 !== 'yes') { console.log('Cancelled.'); return; }
    const ans2 = await confirm(`⚠️  Confirm again — this will spend $${amount} USDC.e. (yes/no): `);
    if (ans2 !== 'yes') { console.log('Cancelled.'); return; }
  }

  // Approve exact amount
  const exactAmount = ethers.utils.parseUnits(amount.toString(), 6);
  console.log(`\nApproving ${spender.slice(0, 10)}... to spend ${amount} USDC.e...`);
  const usdceSigned = usdce.connect(wallet);
  const approveTx = await usdceSigned.approve(spender, exactAmount);
  await approveTx.wait();
  console.log(`Approval confirmed.`);

  // Submit order
  console.log(`Submitting FOK buy order...`);
  const result = await client.createAndPostMarketOrder(
    { tokenID, amount, side: Side.BUY },
    { tickSize, negRisk },
    OrderType.FOK,
  );
  if (!result.success) {
    throw new Error(`Order not filled: ${result.errorMsg || result.status || 'insufficient liquidity'}`);
  }
  console.log(`\n✅ Order filled`);
  console.log(`   Status:   ${result.status}`);
  console.log(`   Order ID: ${result.orderID ?? '—'}`);
  return result;
}

// ── Sell flow ─────────────────────────────────────────────────────────────────

export async function sell({ market, side, amount, cfg, provider, wallet }) {
  const { Side, OrderType } = await import('@polymarket/clob-client');
  const client = await createL2Client(cfg, wallet, join(AUREHUB_DIR, '.polymarket_clob'));

  const ids = extractTokenIds(market);
  const tokenID = side === 'YES' ? ids.YES : ids.NO;
  if (!tokenID) throw new Error(`No ${side} token ID found for this market.`);

  // Check CTF token balance
  const contracts = cfg.yaml?.contracts ?? {};
  const ctfAddr = contracts.ctf_contract ?? '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';
  const ctf = new ethers.Contract(ctfAddr, ERC1155_ABI, provider);
  const tokenBalance = await ctf.balanceOf(wallet.address, ethers.BigNumber.from(tokenID));
  const sharesHeld = parseFloat(ethers.utils.formatUnits(tokenBalance, 6));
  if (sharesHeld < amount) {
    throw new Error(`Insufficient ${side} tokens: have ${sharesHeld}, want to sell ${amount}.`);
  }

  // Preview
  const negRisk = await client.getNegRisk(tokenID);
  const tickSize = await client.getTickSize(tokenID);
  const ob = await client.getOrderBook(tokenID);
  const bestBid = parseFloat(ob.bids?.[0]?.price ?? '0.5');
  const estUsdce = (amount * bestBid).toFixed(2);
  console.log(`\nPreview:`);
  console.log(`  Selling:        ${amount} ${side} shares`);
  console.log(`  Best bid:       $${bestBid.toFixed(4)} per share`);
  console.log(`  Est. receive:   ~$${estUsdce} USDC.e`);

  // Hard stops (gas + market active)
  const polRaw = await provider.getBalance(wallet.address);
  // Pass estimated dollar value so minOrderSize check applies to USD proceeds (not share count)
  validateHardStops(parseFloat(estUsdce), {
    usdceBalance: 999999, // not checked for sell
    polBalance:   parseFloat(ethers.utils.formatEther(polRaw)),
    marketActive: market.active,
    minOrderSize: parseFloat(market.min_incentive_size ?? '0'),
  });

  // Safety gates (on estimated USD value)
  const safety = cfg.yaml?.safety ?? { warn_threshold_usd: 50, confirm_threshold_usd: 500 };
  const level = getSafetyLevel(parseFloat(estUsdce), safety);
  if (level !== 'proceed') {
    const ans = await confirm(`⚠️  Selling ${amount} ${side} shares (~$${estUsdce}). Confirm? (yes/no): `);
    if (ans !== 'yes') { console.log('Cancelled.'); return; }
    if (level === 'confirm') {
      const ans2 = await confirm(`⚠️  Confirm again. (yes/no): `);
      if (ans2 !== 'yes') { console.log('Cancelled.'); return; }
    }
  }

  // setApprovalForAll
  const operator = negRisk
    ? (contracts.neg_risk_exchange ?? '0xC5d563A36AE78145C45a50134d48A1215220f80a')
    : (contracts.ctf_exchange      ?? '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E');
  console.log(`\nApproving exchange operator...`);
  const ctfSigned = ctf.connect(wallet);
  const approveTx = await ctfSigned.setApprovalForAll(operator, true);
  await approveTx.wait();
  console.log(`Approval confirmed.`);

  // Submit order
  console.log(`Submitting FOK sell order...`);
  const result = await client.createAndPostMarketOrder(
    { tokenID, amount, side: Side.SELL },
    { tickSize, negRisk },
    OrderType.FOK,
  );
  if (!result.success) {
    throw new Error(`Order not filled: ${result.errorMsg || result.status || 'insufficient liquidity'}`);
  }
  console.log(`\n✅ Order filled`);
  console.log(`   Status:   ${result.status}`);
  console.log(`   Order ID: ${result.orderID ?? '—'}`);
  return result;
}

// ── CLI entry point ───────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const getArg = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
  const mode    = args.includes('--sell') ? 'sell' : 'buy';
  const query   = getArg('--market');
  const side    = (getArg('--side') ?? 'YES').toUpperCase();
  const amount  = parseFloat(getArg('--amount') ?? '0');

  if (!query || !amount) {
    console.error('Usage: node scripts/trade.js [--buy|--sell] --market <slug> --side YES|NO --amount <usd>');
    process.exit(1);
  }

  (async () => {
    try {
      runTradeEnvCheck();
      const cfg = loadConfig();
      const rpcUrl = resolveRpcUrl(cfg);
      const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
      const wallet = (await createSigner(cfg)).connect(provider);

      // Resolve market by exact slug or keyword fallback (see browse.js resolveMarket)
      const market = await resolveMarket(query, cfg);

      const fn = mode === 'sell' ? sell : buy;
      await fn({ market, side, amount, cfg, provider, wallet });
    } catch (e) {
      if (e.response?.status === 403) {
        console.error('❌ 403 Forbidden — Polymarket API blocked in your region. Use a VPN.');
      } else {
        console.error('❌', e.message);
      }
      process.exit(1);
    }
  })();
}
