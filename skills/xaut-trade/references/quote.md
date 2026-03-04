# 报价与滑点保护

## 1. 获取报价（QuoterV2）

示例：100 USDT（6 位精度）

```bash
AMOUNT_IN=100000000
QUOTE_RAW=$(cast call "$QUOTER" \
  "quoteExactInputSingle((address,address,uint256,uint24,uint160))" \
  "($USDT,$XAUT,$AMOUNT_IN,$FEE,0)" \
  --rpc-url "$ETH_RPC_URL")
```

解析返回值（QuoterV2 返回 tuple：amountOut, sqrtPriceX96After, initializedTicksCrossed, gasEstimate）：

```bash
# 使用 cast abi-decode 解析，避免手动 hex 切割的脆弱性
AMOUNT_OUT=$(cast abi-decode \
  "f()(uint256,uint160,uint32,uint256)" \
  "$QUOTE_RAW" | head -1)

# XAUT 精度 6 位：人类可读值 = AMOUNT_OUT / 1_000_000
# USDT 精度同为 6 位，卖出方向同理
```

## 2. 计算 minAmountOut

默认滑点 `default_slippage_bps`（例如 50 bps = 0.5%）：

```bash
# 用 python3 避免 bash 整数在大额交易时溢出
MIN_AMOUNT_OUT=$(python3 -c \
  "print(int($AMOUNT_OUT * (10000 - $DEFAULT_SLIPPAGE_BPS) // 10000))")
```

## 3. 预览输出（Preview）

至少包含：
- 输入金额（原始与最小单位）
- 预计获得 XAUT（`amountOut`）
- 滑点设置与 `minAmountOut`
- 估计风险（大额/滑点/gas）

## 4. 显式确认门禁

如果用户未明确确认，禁止执行任何 `cast send`。

确认语示例：
- “确认执行授权”
- “确认执行 swap”

## 5. 二次确认条件

- 交易金额超过 `risk.large_trade_usd`
- 估算滑点超过 `risk.max_slippage_bps_warn`

满足任意条件时，必须再次明确提示风险并要求二次确认。
