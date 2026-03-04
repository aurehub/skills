# 余额与前置检查

在任何报价或执行前，按顺序完成：

## 1. 环境检查

```bash
cast --version
cast block-number --rpc-url "$ETH_RPC_URL"
```

如果任一失败，停止并提示：
- Foundry 未安装：先安装 Foundry
- RPC 不可用：更换 `ETH_RPC_URL`

## 2. 签名方式检测

按以下逻辑确定本次执行的签名方式，并完成验证：

**若 `FOUNDRY_ACCOUNT` 已设置（keystore 模式）：**

验证账户存在：
```bash
cast wallet list
```
确认输出中包含 `$FOUNDRY_ACCOUNT`；否则硬停止：
> ❌ keystore 账户 `$FOUNDRY_ACCOUNT` 不存在，请先运行：
> `cast wallet import $FOUNDRY_ACCOUNT --interactive`

验证密码文件可读：
```bash
test -r "$KEYSTORE_PASSWORD_FILE" && echo "OK" || echo "FAIL"
```
若输出 `FAIL`，硬停止：
> ❌ 密码文件不可读：`$KEYSTORE_PASSWORD_FILE`
> 请创建并设置权限：
> ```bash
> echo "your_password" > ~/.foundry/keystores/.my-xaut-wallet.password
> chmod 600 ~/.foundry/keystores/.my-xaut-wallet.password
> ```
> 并在 `.env` 中设置 `KEYSTORE_PASSWORD_FILE`。

**若仅 `PRIVATE_KEY` 已设置（降级模式）：**

跳过 keystore 检查，继续执行。

**若两者均未设置：**

硬停止：
> ❌ 未配置签名方式，请在 `.env` 中设置 `FOUNDRY_ACCOUNT`（推荐）或 `PRIVATE_KEY`（降级）。

## 3. 钱包与 gas 检查

```bash
cast balance "$WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL"
```

- 若 ETH 余额低于 `risk.min_eth_for_gas`，硬停止

## 4. 稳定币余额检查

USDT：

```bash
cast call "$USDT" "balanceOf(address)" "$WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL"
```

- 若支付币种余额不足，硬停止并给出缺口

## 5. XAUT 余额

```bash
cast call "$XAUT" "balanceOf(address)" "$WALLET_ADDRESS" --rpc-url "$ETH_RPC_URL"
```

- **卖出流程（必需）**：检查是否足够支付卖出金额；若不足，硬停止并告知缺口
- **买入流程（可选）**：用于交易前后对比持仓
