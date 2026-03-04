# xaut-trade 使用说明

通过 AI Agent 在 Ethereum 主网上买卖 XAUT（Tether Gold），底层使用 Uniswap V3 + Foundry `cast`。

## 支持的交易对

| 方向 | 交易对 | 说明 |
|------|--------|------|
| 买入 | USDT → XAUT | 用 USDT 买入黄金代币 |
| 卖出 | XAUT → USDT | 将黄金代币卖出换回 USDT |

## 环境准备

### 1. 安装 Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

验证：`cast --version`

### 2. 配置钱包

**推荐：导入已有私钥**

```bash
cast wallet import aurehub-wallet --private-key <YOUR_PRIVATE_KEY>
```

**或：创建全新钱包**

```bash
cast wallet new   # 保存输出的 private key 到安全位置
cast wallet import aurehub-wallet --private-key <GENERATED_PRIVATE_KEY>
```

创建密码文件：

```bash
mkdir -p ~/.aurehub
echo "your_keystore_password" > ~/.aurehub/.wallet.password
chmod 600 ~/.aurehub/.wallet.password
```

> Foundry keystore 存放于 `~/.foundry/keystores/`，密码文件存放于 `~/.aurehub/`。

### 2.6 安装 Node.js（限价单功能需要）

市价单不需要此步骤。如果需要限价单功能：

```bash
# 验证
node --version   # 需要 >= 18

# 安装（如未安装）：https://nodejs.org
# macOS 推荐：brew install node
```

安装 limit-order 脚本依赖：

```bash
cd skills/xaut-trade/scripts
npm install
```

### 2.7 获取 UniswapX API Key（限价单必填）

限价单提交和查询需要 UniswapX API Key。

申请步骤（约 5 分钟，免费）：
1. 访问 [portal.1inch.dev](https://portal.1inch.dev)
2. 用 Google / GitHub 登录
3. 生成 Token（选 Free tier）

将 Key 写入 `~/.aurehub/.env`：

```bash
echo 'UNISWAPX_API_KEY=your_key_here' >> ~/.aurehub/.env
```

市价单不需要 API Key。

### 3. 创建本地配置

```bash
# 环境变量（复制到全局配置目录）
mkdir -p ~/.aurehub
cp skills/xaut-trade/.env.example ~/.aurehub/.env
# 编辑 ~/.aurehub/.env，填写：
#   ETH_RPC_URL              - Ethereum 主网 RPC 地址
#   FOUNDRY_ACCOUNT          - keystore 账户名（已预填 aurehub-wallet）
#   KEYSTORE_PASSWORD_FILE   - keystore 密码文件路径（见 Step 2）
#   UNISWAPX_API_KEY         - 限价单必填（见 Step 2.7）

# 交易配置（可选，默认值已可用）
cp skills/xaut-trade/config.example.yaml ~/.aurehub/config.yaml
```

### 4. 确保钱包有余额

- 少量 ETH（≥ 0.005）用于支付 gas
- USDT（买入时）
- XAUT（卖出时）

## 使用方式

直接用自然语言对 Agent 说即可，示例：

### 买入

```
用 100 USDT 买 XAUT
buy 200 USDT worth of XAUT
```

### 卖出

```
卖 0.01 XAUT
用 XAUT 换 USDT，卖 0.05 个
sell 0.1 XAUT
```

### 限价挂单

```
等 XAUT 跌到 3000 USDT 时买 0.01 个
limit order: buy 0.01 XAUT when price reaches 3000 USDT
挂单买 XAUT，限价 3000，0.01 个，有效 3 天
```

### 限价卖出

```
等 XAUT 涨到 4000 USDT 时帮我卖 0.01 个
限价卖出 0.01 XAUT，目标价 3800 USDT，有效期 3 天
sell 0.01 XAUT when price reaches 4000
```

### 查限价单

```
帮我查一下我的限价单状态，orderHash 是 0x...
```

### 撤销限价单

```
帮我撤销限价单，orderHash 是 0x...
```

### 查余额

```
查一下我的 XAUT 余额
```

## 交易流程

无论买入还是卖出，Agent 都会按以下半自动流程执行：

```
前置检查 → 链上报价 → Preview 展示 → [用户确认] → 授权 → [用户确认] → Swap → 结果校验
```

每一步链上写操作（approve / swap）前，Agent 都会：
1. 展示完整的 `cast` 命令
2. 等待你明确说 **"确认执行"** 后才会执行

**你不说"确认"，就不会有任何链上操作发生。**

## 风控机制

| 规则 | 默认阈值 | 触发行为 |
|------|----------|----------|
| 大额交易 | > $1,000 USD | 二次确认 |
| 高滑点 | > 50 bps (0.5%) | 告警 + 二次确认 |
| Gas 不足 | ETH < 0.005 | 硬停止 |
| 余额不足 | — | 硬停止，提示缺口 |
| 精度超限 | > 6 位小数 | 硬停止（XAUT 最小单位 0.000001） |
| UniswapX Filler 不可用 | XAUT 为小众代币 | 订单 deadline 后过期，资金不受损 |

阈值可在 `config.yaml` 的 `risk` 部分自定义。

## 配置说明

### .env（必填）

| 变量 | 说明 | 示例 |
|------|------|------|
| `ETH_RPC_URL` | Ethereum RPC 地址 | `https://eth.llamarpc.com` |
| `FOUNDRY_ACCOUNT` | Foundry keystore 账户名（由 onboarding 自动配置） | `aurehub-wallet` |
| `KEYSTORE_PASSWORD_FILE` | keystore 密码文件路径 | `~/.aurehub/.wallet.password` |
| `UNISWAPX_API_KEY` | UniswapX API Key（**限价单必填**，市价单不需要） | 申请：portal.1inch.dev |
| `PRIVATE_KEY` | 私钥（降级方案，不推荐） | `0x...` |

### config.yaml（可选）

主要可调参数：

```yaml
risk:
  default_slippage_bps: 50      # 默认滑点保护 0.5%
  max_slippage_bps_warn: 50     # 滑点告警阈值
  large_trade_usd: 1000         # 大额交易阈值（USD）
  min_eth_for_gas: "0.005"      # 最低 gas ETH
  deadline_seconds: 300         # 交易超时（秒）
```

## 本地测试（Anvil Fork）

> **注意：限价单无法使用 Anvil fork 测试**，因为 UniswapX API 不认识本地 chainId。
> 限价单建议在主网用极小金额（如 1 USDT → XAUT）做端到端验证。
> 签名格式可通过 `config.yaml` 中的 `limit_order.uniswapx_api` 指向本地 mock 服务验证。

使用 Anvil fork 主网状态到本地，可以零成本测试完整买卖流程，不消耗真实资产。

### 1. 启动 Anvil Fork

```bash
# fork 以太坊主网到本地（需要一个主网 RPC）
anvil --fork-url https://eth.llamarpc.com

# 如果需要指定 block（可选，固定状态便于复现）
anvil --fork-url https://eth.llamarpc.com --fork-block-number 19500000
```

启动后 Anvil 会输出 10 个预置账户，每个有 10,000 ETH。默认监听 `http://127.0.0.1:8545`。

### 2. 配置 .env 指向本地

```bash
# .env
ETH_RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80  # Anvil 预置账户 #0 对应私钥
```

> 这是 Anvil 的硬编码测试账户，公开私钥，仅用于本地测试。

### 3. 给测试账户充值 USDT

Anvil 预置账户只有 ETH，需要用 `cast` impersonate 一个持仓大户来转代币：

```bash
# 查找 USDT 大户（如 Binance Hot Wallet）
USDT=0xdAC17F958D2ee523a2206206994597C13D831ec7
WHALE=0xF977814e90dA44bFA03b6295A0616a897441aceC  # Binance 热钱包

# impersonate 大户，转 10,000 USDT 到测试账户
cast send $USDT "transfer(address,uint256)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 10000000000 \
  --from $WHALE \
  --unlocked \
  --rpc-url http://127.0.0.1:8545

# 验证余额
cast call $USDT "balanceOf(address)" \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://127.0.0.1:8545
```

### 4. 执行测试交易

配置完成后，正常使用 skill 即可：

```
用 100 USDT 买 XAUT
```

Agent 会走完整流程（报价 → 确认 → approve → swap），所有交易都在本地 fork 上执行，不花真钱。

### 5. 注意事项

- Anvil fork 的状态是**临时的**，重启后重置（除非用 `anvil --state` 持久化）
- 本地测试使用 `--unlocked` + `--from` 而非 keystore，但 skill 实际执行时会用 `--private-key` 或 `--account`，两者结果一致
- 如果 fork 时间过长，链上状态可能过期，报价会与实际主网有差异，重新启动 fork 即可
- 大户地址可能因时间推移而变化，如转账失败可到 [Etherscan](https://etherscan.io/token/0xdAC17F958D2ee523a2206206994597C13D831ec7#balances) 查最新持仓排名

## 常见问题

**Q: 交易卡住/失败怎么办？**
Agent 会给出重试建议：降低金额、提高滑点上限、或检查 nonce 和 gas。

**Q: USDT approve 为什么要执行两次？**
USDT 合约的非标准实现要求先 `approve(0)` 清零，再 `approve(amount)` 设新额度。XAUT 不需要。

**Q: 支持其他链吗？**
当前仅支持 Ethereum 主网（chain_id: 1）。Anvil fork 仅用于本地测试，不是生产部署目标，详见"本地测试"章节。

**Q: 执行 cast send 时报 `Device not configured (os error 6)` 怎么办？**

这是 macOS 在非交互式环境下无法访问系统 Keychain 导致的。解决方法：

1. 创建密码文件并设置权限：
   ```bash
   echo "your_keystore_password" > ~/.aurehub/.wallet.password
   chmod 600 ~/.aurehub/.wallet.password
   ```
2. 在 `.env` 中设置 `KEYSTORE_PASSWORD_FILE` 指向该文件。
3. 重新执行交易流程。

**Q: 什么是 Skill 包？它是怎么驱动 AI 买黄金的？**

Skill 包是一套结构化的 AI 指令文件（`SKILL.md`），定义了 Agent 在特定场景下的行为规则、操作流程和风险边界。`xaut-trade` Skill 告诉 Agent 如何检查前置条件、调用 Uniswap V3 报价合约、构造 `cast send` 命令、处理 USDT 非标准授权等。Agent 本身不存储私钥或执行权，它只是"读懂" Skill 后生成命令；你说"确认执行"后，`cast` 才会用本地 keystore 签名并广播交易。

**Q: 我需要一台一直开着的电脑来跑这个 Agent 吗？**

- **市价单（买/卖）**：不需要。市价交易是一次性交互，你发出指令 → Agent 报价 → 你确认 → 交易完成，全程无需保持在线。
- **限价单**：不需要。限价单签名后提交给 UniswapX 网络，由第三方 Filler 节点在价格达标时自动撮合，你的电脑可以关机。但注意：若在 `deadline` 到期前无 Filler 接单，订单自然过期，资金不受损。

**Q: 一定要用 OpenClaw 跑吗？支持哪些模型？**

不需要。Skill 支持两种主要运行方式：

- **Claude Code**（推荐）：本地终端安装后直接使用 Claude 对话，无需部署服务器
- **OpenClaw**：通过 Slack / Telegram 等平台使用，每位用户需独立配置自己的钱包凭据

模型方面，当前以 Claude（Sonnet / Opus 系列）为主要测试目标；理论上支持任何能遵循 Skill 指令并调用 shell 命令的 LLM，但其他模型未经验证。

**Q: 按照 README 操作报错 `command not found` 怎么办？**

根据报错命令名称分情况排查：

- **`cast`**：Foundry 未安装或未加入 PATH。运行 `foundryup` 安装后重启终端；若仍不可用，检查 `~/.foundry/bin` 是否在 PATH 中：
  ```bash
  echo $PATH | grep foundry
  # 若无输出，手动加入：
  export PATH="$HOME/.foundry/bin:$PATH"
  ```
- **`node`**：限价单功能依赖 Node.js（≥ 18），市价单不需要。参见"环境准备"章节安装 Node.js。

**Q: 我把 API Key 和私钥填在 .env 里，你们会后台读取吗？**

不会。Skill 包是一套本地运行的指令文件，不包含任何数据收集或上报逻辑。所有交易操作通过本地 `cast` 执行，不经过任何中间服务器。推荐的 keystore 方式下，私钥加密存储于 Foundry keystore，`.env` 仅保存账户名、钱包地址等配置信息；请勿将 `.env` 提交到版本控制。

**Q: Agent 是根据什么触发购买的？会自动盯盘买入吗？**

Agent 不会主动触发任何购买，它是"执行助手"，只在你明确下达指令时才会行动：

- **市价单**：你说"用 100 USDT 买 XAUT" → Agent 报价 → 你确认 → 执行
- **限价单**：你设定"XAUT 跌到 3000 时买 0.01 个" → Agent 签名提交订单 → UniswapX Filler 在条件达成时撮合

Agent 没有自动监控金价、定时买入等自主决策能力。

**Q: Agent 购买时需要我手动确认吗？不确认它能动我的钱吗？**

每一次链上写操作（approve / swap）前，Agent 都会展示完整的 `cast` 命令并等待你明确说"**确认执行**"。你不说确认，就不会有任何链上操作发生。私钥 / keystore 只有你持有，Agent 无法绕过确认步骤动用资金。

**Q: 我能同时用多个钱包分别操作吗？**

当前 Skill 设计为单钱包单实例。如需多钱包操作，需为每个钱包准备独立的 `.env`（分别配置 `FOUNDRY_ACCOUNT`、`KEYSTORE_PASSWORD_FILE`），每次操作前切换对应配置文件。目前没有内置的多钱包并发管理功能。

**Q: Skill 有更新后，我需要重新安装吗？**

是的。通过原来安装 Skill 的渠道重新获取最新版本即可。更新不会覆盖你的本地配置（`.env`、`config.yaml`）。
