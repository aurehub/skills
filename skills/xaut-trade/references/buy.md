# 买入执行（USDT -> XAUT）

## 0. 执行前声明

- 当前阶段必须为 `Ready to Execute`
- 必须已完成报价和用户显式确认
- 必须展示完整命令后再执行

## 1. allowance 检查

```bash
cast call "$TOKEN_IN" "allowance(address,address)" "$WALLET_ADDRESS" "$ROUTER" --rpc-url "$ETH_RPC_URL"
```

若 allowance < `AMOUNT_IN`，先授权。

## 2. approve（分币种）

USDT（非标准，必须先置零再授权）：

```bash
TX_HASH=$(cast send "$USDT" "approve(address,uint256)" "$ROUTER" 0 \
  --account "$FOUNDRY_ACCOUNT" --password-file "$KEYSTORE_PASSWORD_FILE" \
  --rpc-url "$ETH_RPC_URL" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['transactionHash'])")
echo "Approve(0) tx: https://etherscan.io/tx/$TX_HASH"
```

```bash
TX_HASH=$(cast send "$USDT" "approve(address,uint256)" "$ROUTER" "$AMOUNT_IN" \
  --account "$FOUNDRY_ACCOUNT" --password-file "$KEYSTORE_PASSWORD_FILE" \
  --rpc-url "$ETH_RPC_URL" --json | python3 -c "import sys,json; print(json.load(sys.stdin)['transactionHash'])")
echo "Approve tx: https://etherscan.io/tx/$TX_HASH"
```

如果使用私钥降级模式，将 `--account "$FOUNDRY_ACCOUNT"` 替换为：

```bash
--private-key "$PRIVATE_KEY"
```

## 3. swap 执行

先计算 `deadline`，并编码 `exactInputSingle`：

```bash
DEADLINE=$(cast --to-uint256 $(($(date +%s) + 300)))

SWAP_DATA=$(cast calldata \
  "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
  "($TOKEN_IN,$XAUT,$FEE,$WALLET_ADDRESS,$AMOUNT_IN,$MIN_AMOUNT_OUT,0)")
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

## 4. 结果校验

```bash
cast call "$XAUT" "balanceOf(address)" "$WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL"
```

返回：
- tx hash
- 交易后 XAUT 余额
- 若失败，返回可重试建议

## 5. 强制规则

- 所有 `cast send` 前必须再次提醒“即将执行链上写入”
- 用户没有显式确认时，不得执行
- 大额/高滑点触发二次确认
