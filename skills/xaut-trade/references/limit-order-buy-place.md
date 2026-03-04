# 限价挂单执行（USDT → XAUT via UniswapX）

## 0. 执行前声明

- 当前阶段必须为 `Ready to Execute`
- 必须已完成参数确认和用户显式确认
- 必须展示完整命令后再执行

## 1. 前置检查

```bash
node --version     # 不存在则硬停止，提示安装 https://nodejs.org（市价单不受影响）
cast --version
cast block-number --rpc-url "$ETH_RPC_URL"
# ETH 余额检查（同 balance.md）
# tokenIn（USDT）余额检查
```

## 2. 参数确认（Preview）

展示至少：
- 交易对：USDT → XAUT
- 限价：`1 XAUT = X USDT`（即 amountIn / minAmountOut，人类可读）
- 数量：`amountIn` USDT → 至少 `minAmountOut` XAUT
- 有效期：`expiry` 秒 / 截止 `deadline` 时间（本地时区）
- UniswapX Filler 风险提示：XAUT 为小众代币，若无 Filler 接单则订单在 deadline 后自动过期，资金不受损

## 3. 大额二次确认

amountIn（USDT 换算 USD）> `risk.large_trade_usd` 时，必须二次确认。

## 4. Approve Permit2（若 allowance 不足）

检查 USDT 对 Permit2 的授权额度：

```bash
cast call "$USDT" "allowance(address,address)" \
  "$WALLET_ADDRESS" "$PERMIT2" \
  --rpc-url "$ETH_RPC_URL"
```

若不足，先授权（USDT 需置零再授权）：

```bash
# 置零
cast send "$USDT" "approve(address,uint256)" "$PERMIT2" 0 \
  --account "$FOUNDRY_ACCOUNT" --password-file "$KEYSTORE_PASSWORD_FILE" \
  --rpc-url "$ETH_RPC_URL"

# 授权
cast send "$USDT" "approve(address,uint256)" "$PERMIT2" "$AMOUNT_IN" \
  --account "$FOUNDRY_ACCOUNT" --password-file "$KEYSTORE_PASSWORD_FILE" \
  --rpc-url "$ETH_RPC_URL"
```

降级（PRIVATE_KEY）：将 `--account ... --password-file ...` 替换为 `--private-key "$PRIVATE_KEY"`

## 5. 挂单执行

```bash
RESULT=$(node skills/xaut-trade/scripts/limit-order.js place \
  --token-in       "$USDT" \
  --token-out      "$XAUT" \
  --amount-in      "$AMOUNT_IN" \
  --min-amount-out "$MIN_AMOUNT_OUT" \
  --expiry         "$EXPIRY_SECONDS" \
  --wallet         "$WALLET_ADDRESS" \
  --chain-id       1 \
  --api-url        "$UNISWAPX_API")
```

解析结果：

```bash
ORDER_HASH=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['orderHash'])")
DEADLINE=$(echo "$RESULT"   | python3 -c "import sys,json; print(json.load(sys.stdin)['deadline'])")
NONCE=$(echo "$RESULT"      | python3 -c "import sys,json; print(json.load(sys.stdin)['nonce'])")
```

## 6. 输出

返回给用户：
- `orderHash`：用于查单/撤单
- `deadline`：订单有效截止时间（本地时区）
- nonce（撤单时需要）
- 提醒：订单已提交至 UniswapX，无需保持电脑在线，Filler 网络自动在价格达到时成交

## 7. 错误处理

| 错误 | 处理 |
|------|------|
| `node` 不存在 | 硬停止，提示安装，说明市价单不受影响 |
| UniswapX API 返回 4xx | 硬停止，提示 XAUT 可能不在支持列表，建议市价单 |
| 限价偏离当前市价 > 50% | 告警 + 二次确认（防止输错价格） |
| 授权失败 | 返回失败原因，建议重试 |
