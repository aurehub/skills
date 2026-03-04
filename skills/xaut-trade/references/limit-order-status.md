# 限价单查询

## 1. 查单个订单（按 orderHash）

```bash
RESULT=$(node skills/xaut-trade/scripts/limit-order.js status \
  --order-hash "$ORDER_HASH" \
  --chain-id   1 \
  --api-url    "$UNISWAPX_API")

STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
```

## 2. 查所有挂单（按钱包地址）

```bash
RESULT=$(node skills/xaut-trade/scripts/limit-order.js list \
  --wallet       "$WALLET_ADDRESS" \
  --chain-id     1 \
  --api-url      "$UNISWAPX_API" \
  --order-status open)   # 可选：open / filled / expired / cancelled，不传则返回全部
```

返回 JSON：`{ total, orders: [{ orderHash, status, inputToken, inputAmount, outputToken, outputAmount, txHash, createdAt }] }`

## 2. 状态展示

| status | 展示内容 |
|--------|----------|
| `open` | 挂单中，剩余有效时间 = deadline - 当前时间 |
| `filled` | 已成交：展示 txHash、实际成交量（settledAmounts） |
| `expired` | 已过期，可重新挂单 |
| `cancelled` | 已撤销 |
| `not_found` | orderHash 不存在或订单已从 API 清除（过期后可能被清理） |

## 3. 错误处理

- API 不可达：提示检查网络，建议稍后重试
- `not_found`：提示 orderHash 可能有误，或订单已过期被清除
