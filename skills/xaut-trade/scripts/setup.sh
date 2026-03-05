#!/usr/bin/env bash
# xaut-trade environment setup
# Usage: bash skills/xaut-trade/scripts/setup.sh
#
# Exit codes:
#   0 — all automated steps complete; check the manual steps summary at the end
#   1 — a step failed; error message printed, see references/onboarding.md
#   2 — environment prerequisite missing (e.g. Node.js not installed); re-run after fixing

set -euo pipefail

# ── Colours ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

STEP=0

step()   { STEP=$((STEP+1)); echo -e "\n${BLUE}${BOLD}[${STEP}] $1${NC}"; }
ok()     { echo -e "  ${GREEN}✓ $1${NC}"; }
warn()   { echo -e "  ${YELLOW}⚠ $1${NC}"; }
manual() {
  echo -e "\n  ${YELLOW}${BOLD}┌─ 需要手动操作 ──────────────────────────────────────────┐${NC}"
  # Indent each line of the message
  while IFS= read -r line; do
    echo -e "  ${YELLOW}│${NC} $line"
  done <<< "$1"
  echo -e "  ${YELLOW}${BOLD}└─────────────────────────────────────────────────────────┘${NC}\n"
}

trap 'echo -e "\n${RED}❌ 步骤 ${STEP} 失败。${NC}\n请参考 references/onboarding.md 手动完成，然后重新运行此脚本。"; exit 1' ERR

# ── Locate skill directory from the script's own path ──────────────────────────
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SKILL_DIR=$(dirname "$SCRIPT_DIR")    # skills/xaut-trade/
ACCOUNT_NAME="aurehub-wallet"

echo -e "\n${BOLD}xaut-trade 环境初始化${NC}"
echo "Skill 目录: $SKILL_DIR"

# ── Step 1: Foundry ────────────────────────────────────────────────────────────
step "检查 Foundry (cast)"

if command -v cast &>/dev/null; then
  ok "Foundry 已安装: $(cast --version | head -1)"
else
  echo "  正在安装 Foundry..."
  curl -L https://foundry.paradigm.xyz | bash

  # foundryup may not be in PATH yet; add it temporarily for this session
  export PATH="$HOME/.foundry/bin:$PATH"
  foundryup

  manual "原因：Foundry 将自身写入了 ~/.foundry/bin，并在 ~/.zshrc（或 ~/.bashrc）
里添加了 PATH。但当前终端的 PATH 不会自动刷新。
脚本已临时将 Foundry 加入本次 PATH，可继续执行。

完成后你需要刷新终端，否则新窗口中 cast 仍不可用：
  $ source ~/.zshrc    # zsh 用户
  $ source ~/.bashrc   # bash 用户
或者直接重启终端。"
fi

# ── Step 2: 全局配置目录 ──────────────────────────────────────────────────────
step "创建全局配置目录 ~/.aurehub"
mkdir -p ~/.aurehub
ok "~/.aurehub 就绪"

# ── Step 3: 钱包 keystore ─────────────────────────────────────────────────────
step "配置钱包 keystore"

if cast wallet list 2>/dev/null | grep -qF "$ACCOUNT_NAME"; then
  ok "Keystore 账户 '$ACCOUNT_NAME' 已存在，跳过"
else
  echo -e "  未找到 keystore 账户，请选择："
  echo -e "    ${BOLD}1)${NC} 导入已有私钥"
  echo -e "    ${BOLD}2)${NC} 生成全新钱包"
  read -rp "  请输入 1 或 2: " WALLET_CHOICE

  case "$WALLET_CHOICE" in
    1)
      manual "原因（安全）：私钥不能以参数形式传入命令行，否则会被记录在
shell 历史（~/.zsh_history / ~/.bash_history）中，存在泄露风险。
使用 --interactive 模式，私钥以不回显方式输入，不进入任何日志。

请在终端中手动运行（输入完毕后返回此脚本）：
  $ cast wallet import $ACCOUNT_NAME --interactive
提示：系统会先要求输入私钥，再设置 keystore 密码，请牢记该密码。"

      read -rp "  完成后按 Enter 继续..."
      ;;
    2)
      manual "以下命令会生成新钱包并打印助记词 + 私钥，私钥只出现一次。

原因（安全）：私钥必须由你亲自记录并妥善保存（建议密码管理器），
脚本不会替你保存，也不应出现在任何日志中。

请依次手动运行（完成后返回此脚本）：
  $ cast wallet new                                       # 记录输出的私钥
  $ cast wallet import $ACCOUNT_NAME --interactive        # 导入并设置密码"

      read -rp "  完成后按 Enter 继续..."
      ;;
    *)
      echo -e "  ${RED}无效选项，退出${NC}"; exit 1
      ;;
  esac

  # Verify the import actually succeeded
  if ! cast wallet list 2>/dev/null | grep -qF "$ACCOUNT_NAME"; then
    echo -e "  ${RED}❌ 未找到账户 '$ACCOUNT_NAME'，请检查导入步骤是否成功${NC}"
    exit 1
  fi
  ok "Keystore 账户 '$ACCOUNT_NAME' 已就绪"
fi

# ── Step 4: 密码文件 ──────────────────────────────────────────────────────────
step "创建 keystore 密码文件"

if [ -f ~/.aurehub/.wallet.password ]; then
  ok "密码文件已存在，跳过"
else
  manual "原因（安全）：密码将使用 read -s 读取，不回显、不进入 shell 历史。
请输入你在 cast wallet import 时设置的 keystore 密码。"

  read -rsp "  请输入 keystore 密码: " WALLET_PASSWORD
  echo
  printf '%s' "$WALLET_PASSWORD" > ~/.aurehub/.wallet.password
  chmod 600 ~/.aurehub/.wallet.password
  unset WALLET_PASSWORD
  ok "密码文件已创建：~/.aurehub/.wallet.password (权限: 600)"
fi

# ── Step 5: 获取钱包地址 ──────────────────────────────────────────────────────
step "获取钱包地址"

WALLET_ADDRESS=$(cast wallet address \
  --account "$ACCOUNT_NAME" \
  --password-file ~/.aurehub/.wallet.password 2>/dev/null) || {
  echo -e "  ${RED}❌ 无法读取钱包地址，请确认密码文件内容与导入时设置的密码一致${NC}"
  exit 1
}
ok "钱包地址: $WALLET_ADDRESS"

# ── Step 6: 生成配置文件 ──────────────────────────────────────────────────────
step "生成配置文件"

if [ -f ~/.aurehub/.env ]; then
  ok ".env 已存在，跳过（如需重置请删除后重新运行）"
else
  DEFAULT_RPC="https://eth.llamarpc.com"
  echo -e "  以太坊 RPC 地址（直接按 Enter 使用免费公共节点）："
  echo -e "  默认: ${BOLD}$DEFAULT_RPC${NC}"
  echo -e "  建议: Alchemy / Infura 私有节点更稳定，可后续在 ~/.aurehub/.env 中修改"
  read -rp "  ETH_RPC_URL: " INPUT_RPC
  ETH_RPC_URL="${INPUT_RPC:-$DEFAULT_RPC}"

  cat > ~/.aurehub/.env << EOF
ETH_RPC_URL=$ETH_RPC_URL
FOUNDRY_ACCOUNT=$ACCOUNT_NAME
KEYSTORE_PASSWORD_FILE=~/.aurehub/.wallet.password
WALLET_ADDRESS=$WALLET_ADDRESS
# Required for limit orders only:
# UNISWAPX_API_KEY=your_api_key_here
# Optional — set automatically on first trade if omitted:
# NICKNAME=YourName
EOF
  ok ".env 已生成（RPC: $ETH_RPC_URL）"
fi

if [ -f ~/.aurehub/config.yaml ]; then
  ok "config.yaml 已存在，跳过"
else
  cp "$SKILL_DIR/config.example.yaml" ~/.aurehub/config.yaml
  ok "config.yaml 已生成（默认值可直接使用）"
fi

# ── Step 7: npm 依赖（限价单，可选）──────────────────────────────────────────
step "限价单依赖（可选，市价买卖不需要）"

read -rp "  是否安装限价单所需 npm 包？[y/N]: " INSTALL_LIMIT
if [[ "$INSTALL_LIMIT" =~ ^[Yy]$ ]]; then
  if ! command -v node &>/dev/null; then
    manual "需要先安装 Node.js（>= 18）。
请访问 https://nodejs.org 或使用包管理器：
  macOS:  brew install node
  Linux:  https://nodejs.org/en/download/package-manager
安装完成后重新运行此脚本。"
    exit 2
  fi

  NODE_MAJOR=$(node -e 'process.stdout.write(process.version.split(".")[0].slice(1))')
  if [ "$NODE_MAJOR" -lt 18 ]; then
    warn "Node.js 版本过低: $(node --version)（需要 >= 18）"
    manual "请升级 Node.js 后重新运行此脚本：
  https://nodejs.org/en/download/package-manager"
    exit 2
  fi

  ok "Node.js $(node --version)"
  echo "  正在安装 npm 包..."
  cd "$SCRIPT_DIR" && npm install --silent
  ok "npm 包安装完成"
else
  echo "  已跳过"
fi

# ── Step 8: 验证 ──────────────────────────────────────────────────────────────
step "验证环境"

# shellcheck source=/dev/null
source ~/.aurehub/.env

cast --version | head -1 | xargs -I{} echo "  ✓ {}"

BLOCK=$(cast block-number --rpc-url "$ETH_RPC_URL" 2>/dev/null) \
  && ok "RPC 连通 (最新区块 #$BLOCK)" \
  || warn "RPC 检查失败，请确认 ETH_RPC_URL 是否有效（当前: $ETH_RPC_URL）"

cast wallet list 2>/dev/null | grep -qF "$ACCOUNT_NAME" \
  && ok "Keystore 账户存在" \
  || { echo -e "  ${RED}❌ 未找到账户${NC}"; exit 1; }

[ -r ~/.aurehub/.wallet.password ] \
  && ok "密码文件可读" \
  || { echo -e "  ${RED}❌ 密码文件不可读${NC}"; exit 1; }

# ── 完成摘要 ──────────────────────────────────────────────────────────────────
echo -e "\n${GREEN}${BOLD}━━━ 自动化部分完成 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  钱包地址: ${BOLD}$WALLET_ADDRESS${NC}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${YELLOW}${BOLD}以下步骤需要手动完成（脚本无法替你操作）：${NC}"

echo -e "\n  ${BOLD}1. 充值 ETH（gas 费，必须）${NC}"
echo -e "     原因：链上操作消耗 gas，脚本无法替你转账。"
echo -e "     最低要求：≥ 0.005 ETH"
echo -e "     钱包地址：${BOLD}$WALLET_ADDRESS${NC}"

echo -e "\n  ${BOLD}2. 充值交易本金（按需）${NC}"
echo -e "     买入 XAUT → 需要 USDT"
echo -e "     卖出 XAUT → 需要 XAUT"
echo -e "     同一地址：${BOLD}$WALLET_ADDRESS${NC}"

echo -e "\n  ${BOLD}3. 获取 UniswapX API Key（限价单必须，市价单不需要）${NC}"
echo -e "     原因：UniswapX API 需要认证，脚本无法替你注册。"
echo -e "     获取方式（约 5 分钟，免费）："
echo -e "       a. 访问 https://developers.uniswap.org/dashboard"
echo -e "       b. 使用 Google / GitHub 登录"
echo -e "       c. 生成 Token（选 Free 套餐）"
echo -e "     获取后运行："
echo -e "       \$ echo 'UNISWAPX_API_KEY=你的key' >> ~/.aurehub/.env"

echo -e "\n  ${BOLD}4. 刷新终端（如果本次安装了 Foundry）${NC}"
echo -e "     原因：Foundry 修改了 shell 配置文件，当前终端 PATH 尚未更新。"
echo -e "       \$ source ~/.zshrc    # zsh 用户"
echo -e "       \$ source ~/.bashrc   # bash 用户"
echo -e "     或直接重启终端。"

echo -e "\n${BLUE}完成以上步骤后，向 Agent 发送任意交易指令即可开始。${NC}\n"
