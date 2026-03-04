---
name: xaut-trade
description: 使用 Foundry cast 在 Ethereum 上买入或卖出 XAUT（Tether Gold）。支持市价单（Uniswap V3）和限价单（UniswapX）。触发词：买 XAUT、XAUT trade、用 USDT 买黄金代币、buy XAUT、卖 XAUT、sell XAUT、用 XAUT 换 USDT、挂单、限价买 XAUT、limit order XAUT、查限价单、我的限价单、查我的挂单、撤单、cancel limit order、限价卖 XAUT、卖出限价单、限价卖出、XAUT 涨、XAUT when。
status: draft
---

# xaut-trade

通过 Uniswap V3 + Foundry `cast` 执行 `USDT -> XAUT` 买入流程。

## 适用场景

当用户希望买入或卖出 XAUT（Tether Gold）时使用：
- **买入**：USDT → XAUT
- **卖出**：XAUT → USDT

## 环境就绪检查（每次启动必须优先执行）

**在处理任何用户意图之前**（知识查询除外），先执行以下三项检查：

1. `~/.aurehub/.env` 是否存在：`ls ~/.aurehub/.env`
2. keystore 账户 `aurehub-wallet` 是否存在：`cast wallet list` 输出中含 `aurehub-wallet`
3. `~/.aurehub/.wallet.password` 是否存在：`ls ~/.aurehub/.wallet.password`

如果**全部通过**：source `~/.aurehub/.env`，继续意图识别。

如果**任一失败**：不继续处理原始意图，转入 [references/onboarding.md](references/onboarding.md) 完成环境初始化，完成后重新执行原始意图。

**限价单额外检查**（仅在意图为限价买入/卖出/查单/撤单时执行）：

4. Node.js >= 18 是否可用：`node --version`
   失败 → 转入 [references/onboarding.md](references/onboarding.md) 的"限价单额外依赖"章节，安装后继续
5. 限价单依赖是否已安装：`ls "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts/node_modules"`
   失败 → 执行 `cd "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts" && npm install`，完成后继续
   （若 `git rev-parse` 失败，先 `find ~ -name "limit-order.js" -maxdepth 6` 定位 scripts 目录，再 cd 进去执行 npm install）
6. `UNISWAPX_API_KEY` 是否已配置：`[ -n "$UNISWAPX_API_KEY" ] && [ "$UNISWAPX_API_KEY" != "your_api_key_here" ]`
   失败 → **硬停止**，输出：
   > 限价单需要 UniswapX API Key。
   > 申请步骤（约 5 分钟，免费）：
   > 1. 访问 https://portal.1inch.dev
   > 2. 用 Google / GitHub 登录
   > 3. 生成 Token（选 Free tier）
   > 4. 将 Key 添加到 ~/.aurehub/.env：`UNISWAPX_API_KEY=your_key`
   > 5. 重新发起请求

## 配置与本地文件

- 全局配置目录：`~/.aurehub/`（跨会话持久，不在 skill 目录下）
- `.env` 路径：`~/.aurehub/.env`
- `config.yaml` 路径：`~/.aurehub/config.yaml`
- 合约地址等默认值来自 `skills/xaut-trade/config.example.yaml`，onboarding 时复制为 `~/.aurehub/config.yaml`

## 交互与执行原则（半自动）

1. 先做前置检查，再报价。
2. 任何 `cast send` 之前必须展示完整命令预览。
3. 必须得到用户当前会话中的显式确认（如“确认执行”）后才可执行链上写操作。
4. 大额交易和高滑点交易必须二次确认。

## 强制安全门禁

- 金额超过配置阈值（如 `risk.large_trade_usd`）时，必须二次确认
- 滑点高于阈值（如 `risk.max_slippage_bps_warn`）时，必须告警并二次确认
- ETH gas 余额不足时，硬停止并提示充值
- 不支持网络或交易对时，硬停止
- 交易对不在 pairs 白名单（当前：USDT_XAUT / XAUT_USDT）时，硬停止并回复"仅支持 USDT/XAUT 交易对，不支持 [用户输入的代币]"

## 意图识别

根据用户消息判断操作方向：

- **买入**：包含"买"、"购买"、"buy"、"用 USDT 换"等关键词 → 执行买入流程
- **卖出**：包含"卖"、"卖出"、"sell"、"用 XAUT 换"等关键词 → 执行卖出流程
- **信息不足**：询问操作方向和金额，不得直接执行
- **限价买入**：含"限价"、"挂单"、"等跌到"、"等涨到"、"limit order"、"when price reaches"，且方向为买入 → 执行限价买入流程
- **限价卖出**：含"限价卖"、"限价卖出"、"挂单卖"、"挂单卖出"、"等涨到卖"、"XAUT 涨到 X 卖"、"limit sell"、"sell when price reaches" → 执行限价卖出流程
- **查限价单**：含"查单"、"查挂单"、"查限价"、"order status" → 执行查单流程
- **撤限价单**：含"撤单"、"取消挂单"、"cancel order" → 执行撤单流程
- **XAUT 知识查询**：含"多少克"、"1g 黄金"、"换算"、"troy ounce"、"金衡盎司"、"什么是 XAUT"、"XAUT 是什么" → 直接回答，无需任何链上操作或环境检查

## 买入流程（USDT → XAUT）

### Step 1: 前置检查

按 [references/balance.md](references/balance.md) 执行：
- `cast --version`
- `cast block-number --rpc-url $ETH_RPC_URL`
- ETH 与稳定币余额检查

### Step 2: 报价与风控提示

按 [references/quote.md](references/quote.md) 执行：
- 调 QuoterV2 获取 `amountOut`
- 计算 `minAmountOut`
- 展示预估成交、滑点保护、gas 风险

### Step 3: 购买执行

按 [references/buy.md](references/buy.md) 执行：
- allowance 检查
- 必要时 approve（USDT 需 `approve(0)` 再 `approve(amount)`）
- 二次确认后执行 swap
- 返回 tx hash 和持仓结果

## 卖出流程（XAUT → USDT）

### Step 1: 前置检查

按 [references/balance.md](references/balance.md) 执行：
- `cast --version`
- `cast block-number --rpc-url $ETH_RPC_URL`
- ETH 余额检查
- **XAUT 余额检查（必需）**：不足则硬停止

### Step 2: 报价与风控提示

按 [references/sell.md](references/sell.md) 执行：
- 输入精度检查（超过 6 位小数则硬停止）
- 调 QuoterV2 获取 `amountOut`（XAUT → USDT 方向）
- 计算 `minAmountOut`
- 大额判定：用 USDT `amountOut` 估算 USD 价值
- 展示预估成交、参考汇率、滑点保护、gas 风险

### Step 3: 卖出执行

按 [references/sell.md](references/sell.md) 执行：
- allowance 检查
- approve（XAUT 标准 ERC-20，**无需先置零**）
- 二次确认后执行 swap
- 返回 tx hash 和交易后 USDT 余额

## 限价挂单流程（USDT → XAUT via UniswapX）

按 [references/limit-order-buy-place.md](references/limit-order-buy-place.md) 执行。

## 限价卖出流程（XAUT → USDT via UniswapX）

按 [references/limit-order-sell-place.md](references/limit-order-sell-place.md) 执行。

## 限价查单流程

按 [references/limit-order-status.md](references/limit-order-status.md) 执行。

## 限价撤单流程

按 [references/limit-order-cancel.md](references/limit-order-cancel.md) 执行。

## 输出约定

输出应包含以下字段：

- `阶段`：`Preview` 或 `Ready to Execute`
- `输入`：币种、金额、链
- `报价`：预计 XAUT 数量、滑点设置、`minAmountOut`
- `参考汇率`：`1 XAUT ≈ X USDT`（仅供对比现货价格，买卖均展示）
- `风险提示`：大额/滑点/gas
- `执行命令`：完整 `cast` 命令
- `结果`：tx hash、交易后余额（执行后）

## 异常处理

- 缺少前置变量：提示补充 `.env` 变量并停止
- RPC 不可用：提示更换 RPC 节点并停止
- 余额不足：提示最小补足金额并停止
- 用户未确认：仅停留在 Preview，禁止执行
- 交易失败：返回失败原因与可重试建议（降低金额/提高滑点上限/检查 nonce 和 gas）

## XAUT 基础知识

- 1 XAUT = 1 金衡盎司（troy ounce）= 31.1035 克
- 最小精度：0.000001 XAUT（链上最小单位：1，即 10^-6）
- 换算公式：X 克黄金 ÷ 31.1035 = XAUT 数量
- 示例：1g ≈ 0.032151 XAUT；10g ≈ 0.32151 XAUT
- 合约地址（Ethereum 主网）：0x68749665FF8D2d112Fa859AA293F07a622782F38

知识查询类问题直接用以上数据回答，无需执行任何 cast 命令。

## 首轮契约（用于测试）

1. 信息充分时：先给结构化预览，再请求执行确认。
2. 信息不足时：先澄清关键信息（币种、金额、环境变量），不得直接声称已执行交易。
