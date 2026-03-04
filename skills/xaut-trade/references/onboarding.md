# 环境初始化（Onboarding）

首次使用或环境不完整时执行。完成后返回原始用户意图。

---

## Step 0：安装 Foundry（如果 `cast` 不可用）

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
cast --version   # 预期输出：cast Version: x.y.z
```

如果 `cast --version` 成功，跳过此步。

---

## Step 1：创建全局配置目录

```bash
mkdir -p ~/.aurehub
```

---

## Step 2：钱包设置

**自动判断**：不询问用户偏好，按以下顺序检查：

### 情况 A：用户想导入已有私钥

用户提供私钥（`0x` 开头的 64 位十六进制字符串）时：

```bash
cast wallet import aurehub-wallet --private-key <PRIVATE_KEY>
# 提示输入 keystore 密码时，使用用户提供的密码，或建议一个随机强密码
```

### 情况 B：用户想创建全新钱包

```bash
# 生成新钱包，输出 address 和 private key
cast wallet new

# 立即 import 到 keystore（使用上一步输出的 private key）
cast wallet import aurehub-wallet --private-key <GENERATED_PRIVATE_KEY>
```

> ⚠️ 新钱包的私钥只显示一次，务必让用户保存到安全位置后再继续。

**两条路径共同完成**：创建密码文件

```bash
# 让用户输入 keystore 密码（import 时已设置）
echo "<keystore_password>" > ~/.aurehub/.wallet.password
chmod 600 ~/.aurehub/.wallet.password
```

**自动获取钱包地址**（无需用户填写）：

```bash
cast wallet address --account aurehub-wallet
# 输出示例：0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
WALLET_ADDRESS=$(cast wallet address --account aurehub-wallet)
```

---

## Step 3：生成配置文件

写入 `~/.aurehub/.env`（直接写入，不让用户手动 cp）：

```bash
cat > ~/.aurehub/.env << 'EOF'
ETH_RPC_URL=https://eth.llamarpc.com
FOUNDRY_ACCOUNT=aurehub-wallet
KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password
# 限价单必填，市价单不需要：
# UNISWAPX_API_KEY=your_api_key_here
EOF
```

> 如果用户有更快的 RPC（如 Alchemy/Infura），替换 `ETH_RPC_URL`。

复制合约配置（默认值已可用，无需用户编辑）：

```bash
cp "$(git rev-parse --show-toplevel)/skills/xaut-trade/config.example.yaml" ~/.aurehub/config.yaml
```

---

## Step 4：验证

```bash
source ~/.aurehub/.env && cast --version
source ~/.aurehub/.env && cast block-number --rpc-url "$ETH_RPC_URL"
cast wallet list | grep aurehub-wallet
```

全部通过则环境就绪。告知用户：

```bash
WALLET_ADDRESS=$(cast wallet address --account aurehub-wallet)
echo "环境初始化完成。钱包地址：$WALLET_ADDRESS"
echo "请确保钱包持有少量 ETH（≥ 0.005）用于 gas。"
```

---

## 限价单额外依赖（仅限价单需要）

### 1. 安装 Node.js（>= 18）

```bash
node --version   # 若版本 < 18 或命令不存在：https://nodejs.org
cd "$(git rev-parse --show-toplevel)/skills/xaut-trade/scripts" && npm install
```

### 2. 获取 UniswapX API Key（必填）

限价单需要 UniswapX API Key 才能提交和查询订单。

申请步骤（约 5 分钟，免费）：
1. 访问 https://portal.1inch.dev
2. 用 Google / GitHub 登录
3. 生成 Token（选 Free tier）

将 Key 写入 `~/.aurehub/.env`：

```bash
echo 'UNISWAPX_API_KEY=your_key_here' >> ~/.aurehub/.env
```

市价单（Uniswap V3）完全不需要以上两项。
