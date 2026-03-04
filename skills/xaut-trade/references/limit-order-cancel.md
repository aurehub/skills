# 限价单撤销

## 0. 前置确认

撤销限价单是链上操作（需支付 gas）。撤销前需确认：
- orderHash
- 当前订单状态（建议先查单，避免撤销已成交或已过期的订单）

## 1. 获取撤单参数

```bash
CANCEL_PARAMS=$(node skills/xaut-trade/scripts/limit-order.js cancel \
  --nonce "$NONCE")

WORD_POS=$(echo "$CANCEL_PARAMS" | python3 -c "import sys,json; print(json.load(sys.stdin)['wordPos'])")
MASK=$(echo "$CANCEL_PARAMS"     | python3 -c "import sys,json; print(json.load(sys.stdin)['mask'])")
PERMIT2=$(echo "$CANCEL_PARAMS"  | python3 -c "import sys,json; print(json.load(sys.stdin)['permit2'])")
```

## 2. 执行撤销

展示命令后等待用户确认：

```bash
TX_HASH=$(cast send "$PERMIT2" \
  "invalidateUnorderedNonces(uint256,uint256)" \
  "$WORD_POS" "$MASK" \
  --account "$FOUNDRY_ACCOUNT" --password-file "$KEYSTORE_PASSWORD_FILE" \
  --rpc-url "$ETH_RPC_URL" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['transactionHash'])")
echo "Cancel tx: https://etherscan.io/tx/$TX_HASH"
```

降级：

```bash
# 将 --account / --password-file 替换为：
--private-key "$PRIVATE_KEY"
```

## 3. 输出

- tx hash
- 提示：USDT 从未被锁定（Permit2 签名撤销，无资产退回操作）

## 4. 特殊情况处理

| 情况 | 处理 |
|------|------|
| 订单已成交（filled） | 无需撤销，提示用户 |
| 订单已过期（expired） | nonce 已自动失效，无需链上撤销 |
| 撤销成功但 Filler 仍在处理 | 极低概率，链上 nonce 失效后 Filler 交易会 revert |
