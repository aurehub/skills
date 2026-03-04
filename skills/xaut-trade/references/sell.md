# 卖出执行（XAUT → USDT）

## 0. 执行前声明

- 当前阶段必须为 `Ready to Execute`
- 必须已完成报价和用户显式确认
- 必须展示完整命令后再执行

## 1. 输入验证

用户输入 XAUT 数量（如 `0.01`），转换为链上整数：

```bash
AMOUNT_IN=$(echo "0.01 * 1000000" | bc | xargs printf "%.0f")
# 0.01 XAUT → 10000
```

**精度检查**：若输入小数位超过 6 位（如 `0.0000001`），硬停止并提示：

> XAUT 最大精度为 6 位小数，最小可交易单位为 0.000001 XAUT，请调整输入金额。

## 2. 报价（QuoterV2）

```bash
QUOTE_RAW=$(cast call "$QUOTER" \
  "quoteExactInputSingle((address,address,uint256,uint24,uint160))" \
  "($XAUT,$USDT,$AMOUNT_IN,$FEE,0)" \
  --rpc-url "$ETH_RPC_URL")
```

解析返回值：

```bash
AMOUNT_OUT=$(cast abi-decode \
  "f()(uint256,uint160,uint32,uint256)" \
  "$QUOTE_RAW" | head -1)
# USDT 精度 6 位：人类可读值 = AMOUNT_OUT / 1_000_000
```

计算 `minAmountOut`（默认滑点 50 bps）：

```bash
# 用 python3 避免 bash 整数在大额交易时溢出
MIN_AMOUNT_OUT=$(python3 -c \
  "print(int($AMOUNT_OUT * (10000 - $DEFAULT_SLIPPAGE_BPS) // 10000))")
```

参考汇率（Preview 展示用，两者均为 6 位精度，可直接相除）：

```
参考汇率 = amountOut / AMOUNT_IN（USDT/XAUT，可读形式）
```

## 3. Preview 输出

至少包含：

- 输入金额（用户输入形式 + 链上单位）
- 预计获得 USDT（`amountOut`，人类可读形式）
- 参考汇率：`1 XAUT ≈ X USDT`
- 滑点设置与 `minAmountOut`
- 风险提示（大额 / 滑点 / gas）

**大额判定**：用 `amountOut`（USDT）换算 USD 价值，超过 `risk.large_trade_usd` 则触发二次确认。

## 4. 显式确认门禁

如果用户未明确确认，禁止执行任何 `cast send`。

确认语示例：
- "确认执行授权"
- "确认执行 swap"

## 5. allowance 检查

```bash
cast call "$XAUT" "allowance(address,address)" "$WALLET_ADDRESS" "$ROUTER" --rpc-url "$ETH_RPC_URL"
```

若 allowance < `AMOUNT_IN`，先授权。

## 6. approve（XAUT 标准 ERC-20）

**XAUT 无需先置零**，直接授权：

```bash
TX_HASH=$(cast send "$XAUT" "approve(address,uint256)" "$ROUTER" "$AMOUNT_IN" \
  --account "$FOUNDRY_ACCOUNT" --password-file "$KEYSTORE_PASSWORD_FILE" \
  --rpc-url "$ETH_RPC_URL" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['transactionHash'])")
echo "Approve tx: https://etherscan.io/tx/$TX_HASH"
```

如果使用私钥降级模式，将 `--account "$FOUNDRY_ACCOUNT"` 替换为：

```bash
--private-key "$PRIVATE_KEY"
```

> ⚠️ 注意：XAUT 与 USDT 不同，USDT 需要先 `approve(0)` 清零，XAUT 不需要。

## 7. swap 执行

先计算 `deadline`，编码 `exactInputSingle`：

```bash
DEADLINE=$(cast --to-uint256 $(($(date +%s) + 300)))

SWAP_DATA=$(cast calldata \
  "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
  "($XAUT,$USDT,$FEE,$WALLET_ADDRESS,$AMOUNT_IN,$MIN_AMOUNT_OUT,0)")
```

执行前模拟（失败则硬停止，不消耗 gas）：

```bash
cast call "$ROUTER" \
  "multicall(uint256,bytes[])" \
  "$DEADLINE" "[$SWAP_DATA]" \
  --from "$WALLET_ADDRESS" \
  --rpc-url "$ETH_RPC_URL"
# 若返回错误 → 硬停止，报告原因，不执行 cast send
```

执行 multicall：

```bash
TX_HASH=$(cast send "$ROUTER" "multicall(uint256,bytes[])" "$DEADLINE" "[$SWAP_DATA]" \
  --account "$FOUNDRY_ACCOUNT" --password-file "$KEYSTORE_PASSWORD_FILE" \
  --rpc-url "$ETH_RPC_URL" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['transactionHash'])")
echo "Swap tx: https://etherscan.io/tx/$TX_HASH"
# 余额可能有数秒延迟，以 Etherscan 为准
```

## 8. 结果校验

交易前快照（swap 执行前获取）：

```bash
cast call "$XAUT" "balanceOf(address)" "$WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL"
```

swap 执行后查询 USDT 余额：

```bash
cast call "$USDT" "balanceOf(address)" "$WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL"
```

返回：
- tx hash
- 交易前后 XAUT 余额（对比）
- 交易后 USDT 余额
- 若失败，返回可重试建议（降低卖出量 / 提高滑点上限 / 检查 nonce 和 gas）

## 9. 强制规则

- 所有 `cast send` 前必须再次提醒"即将执行链上写入"
- 用户没有显式确认时，不得执行
- 大额/高滑点触发二次确认
- 输入精度超过 6 位小数时，硬停止
