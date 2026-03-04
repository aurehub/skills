# 本地链上测试执行记录（买入 XAUT）

测试日期：2026-03-02
测试网络：anvil 本地分叉主网（publicnode.com）
测试场景：用 100 USDT 买入 XAUT（USDT → XAUT via Uniswap V3）

---

## 环境信息

| 项目 | 值 |
|------|-----|
| ETH_RPC_URL | http://127.0.0.1:8545 |
| WALLET_ADDRESS | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 |
| 签名方式 | PRIVATE_KEY（测试用 anvil 默认账户） |
| Fork RPC | https://ethereum-rpc.publicnode.com |
| Fork Block | 24568835 |

**合约地址（来自 config.example.yaml）**

| 合约 | 地址 |
|------|------|
| ROUTER (UniswapV3) | 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 |
| QUOTER (QuoterV2) | 0x61fFE014bA17989E743c5F6cB21bF9697530B21e |
| USDT | 0xdAC17F958D2ee523a2206206994597C13D831ec7 |
| XAUT | 0x68749665FF8D2d112Fa859AA293F07a622782F38 |

---

## 步骤与结果

### Step 0：启动 anvil 分叉

```bash
anvil --fork-url https://ethereum-rpc.publicnode.com --port 8545 &
```

> 注意：不能使用 llamarpc.com（公共免费 RPC，高频请求会触发 429 rate limit，导致后续 cast call 失败）。推荐 publicnode.com 或自建节点。

验证：
```bash
cast block-number --rpc-url http://127.0.0.1:8545
# 输出：24568835  ✓
```

---

### Step 1：环境前置检查

```bash
cast --version
# cast Version: 1.5.1-stable  ✓

cast block-number --rpc-url http://127.0.0.1:8545
# 24568835  ✓
```

---

### Step 2：注入测试资产

anvil 默认账户 ETH 余额为 10000 ETH，无需额外操作。

USDT 余额为 0，通过 `anvil_setStorageAt` 直接写入（绕过 impersonate，避免 fork RPC 限速问题）：

```bash
WALLET_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
USDT=0xdAC17F958D2ee523a2206206994597C13D831ec7
RPC=http://127.0.0.1:8545

# USDT 的 balances mapping 在 storage slot 2（TetherToken 继承链确定）
STORAGE_SLOT=$(cast index address $WALLET_ADDRESS 2)

# 写入 1000 USDT = 1000000000 = 0x3B9ACA00
cast rpc anvil_setStorageAt $USDT $STORAGE_SLOT \
  "0x000000000000000000000000000000000000000000000000000000003b9aca00" \
  --rpc-url $RPC
# 返回 true  ✓
```

验证：
```bash
cast call $USDT "balanceOf(address)" $WALLET_ADDRESS --rpc-url $RPC
# 0x...3b9aca00 → 1000.00 USDT  ✓

cast balance $WALLET_ADDRESS --rpc-url $RPC --ether
# 10.000000000000000000 ETH  ✓
```

---

### Step 3：报价（QuoterV2）

```bash
QUOTER=0x61fFE014bA17989E743c5F6cB21bF9697530B21e
AMOUNT_IN=100000000  # 100 USDT（6 decimals）
FEE=500              # 0.05% fee tier

QUOTE_RAW=$(cast call "$QUOTER" \
  "quoteExactInputSingle((address,address,uint256,uint24,uint160))" \
  "($USDT,$XAUT,$AMOUNT_IN,$FEE,0)" \
  --rpc-url "$RPC")

# 取第一个返回值 amountOut（前 32 bytes）
AMOUNT_OUT=$(cast --to-dec "0x$(echo $QUOTE_RAW | cut -c3-66)")
```

报价结果：

| 指标 | 值 |
|------|-----|
| 输入 | 100 USDT |
| 预计获得 | 0.01862000 XAUT (amountOut = 18620) |
| 滑点保护 | 0.5%（50 bps） |
| minAmountOut | 0.01852600 XAUT (= 18526) |
| 参考汇率 | 1 XAUT ≈ 5370.57 USDT |

---

### Step 4：USDT Approve（两步，USDT 非标准）

USDT 为非标准 ERC-20，修改 allowance 前必须先 `approve(0)` 置零：

```bash
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ROUTER=0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45

# 4a. 先置零
cast send "$USDT" "approve(address,uint256)" "$ROUTER" 0 \
  --private-key "$PRIVATE_KEY" --rpc-url "$RPC"
# tx: 0xbda85d6e507b346b8053f50fa591287681d8c1062d9bd018ae8c350a7d829c80  ✓

# 4b. 再授权 100 USDT
cast send "$USDT" "approve(address,uint256)" "$ROUTER" 100000000 \
  --private-key "$PRIVATE_KEY" --rpc-url "$RPC"
# tx: 0xe14baeee8547c16b0da94732c874581d40b7660062363d1549bf46e53da32694  ✓
```

验证：
```bash
cast call "$USDT" "allowance(address,address)" "$WALLET_ADDRESS" "$ROUTER" --rpc-url "$RPC"
# 100000000  ✓（与 AMOUNT_IN 一致）
```

---

### Step 5：执行 Swap（exactInputSingle via multicall）

```bash
DEADLINE=$(cast --to-uint256 $(($(date +%s) + 300)))

SWAP_DATA=$(cast calldata \
  "exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))" \
  "($USDT,$XAUT,$FEE,$WALLET_ADDRESS,$AMOUNT_IN,$MIN_AMOUNT_OUT,0)")

cast send "$ROUTER" \
  "multicall(uint256,bytes[])" "$DEADLINE" "[$SWAP_DATA]" \
  --private-key "$PRIVATE_KEY" --rpc-url "$RPC"
# tx: 0x388859fba6c20d3c1185bf3175993c0cdf9347edbdadbc37a212cf9cdfa1391d
# status: 0x1 (SUCCESS)  ✓
```

---

### Step 6：结果校验

```bash
cast call "$XAUT" "balanceOf(address)" "$WALLET_ADDRESS" --rpc-url "$RPC"
cast call "$USDT" "balanceOf(address)" "$WALLET_ADDRESS" --rpc-url "$RPC"
```

| 代币 | Swap 前 | Swap 后 | 变化 |
|------|---------|---------|------|
| USDT | 1000.00 | 900.00  | -100.00 |
| XAUT | 0.00000000 | 0.01862000 | +0.01862 |

**结果符合 QuoterV2 报价（amountOut = 18620，无滑点损耗）✓**

---

## 已知问题与说明

### 问题：llamarpc.com Rate Limit (HTTP 429)

**现象**：anvil fork 使用 llamarpc.com 时，访问合约未缓存的 storage（如 QuoterV2、Binance 热钱包 USDT 余额）会触发 Cloudflare 1015 rate limit 错误。

**影响**：`cast call QUOTER ...` 失败；impersonate + `cast send` 转账失败。

**解决方案**：使用限流宽松的 RPC fork：
```bash
# 推荐：PublicNode（测试可用，无需 API key）
anvil --fork-url https://ethereum-rpc.publicnode.com --port 8545

# 或：自建节点 / Alchemy / Infura 付费节点
```

### 说明：USDT 存储注入方式

直接 impersonate 大户转账 USDT 会触发 fork RPC 请求（读取大户余额），公共 RPC 容易被限速。
推荐直接使用 `anvil_setStorageAt` 注入 balance（确定性，无外部依赖）：

```bash
# USDT balances mapping 在 slot 2（forge-std stdUtils 已验证）
STORAGE_SLOT=$(cast index address $WALLET_ADDRESS 2)
cast rpc anvil_setStorageAt $USDT $STORAGE_SLOT "0x...amount_hex..." --rpc-url $RPC
```

---

## 测试结论

| 检查项 | 结果 |
|--------|------|
| cast 环境正常 | ✓ |
| anvil fork 主网成功 | ✓ |
| USDT 余额注入成功 | ✓ |
| QuoterV2 报价成功 | ✓ |
| USDT approve(0) + approve(amount) 成功 | ✓ |
| multicall exactInputSingle swap 成功 | ✓ |
| XAUT 余额增加符合报价 | ✓ |
| USDT 余额减少 100 | ✓ |

**整体结论：买入流程（USDT → XAUT）在本地 anvil 分叉链上完全可用。**
