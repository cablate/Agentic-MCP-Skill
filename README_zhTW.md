<div align="center">

  # Agentic-MCP with Skill

  ### AgentSkill for MCP - 三層漸進式揭露驗證 AgentSkills.io 模式以實現高效 MCP token 使用

  <img src="Banner.png" alt="Agentic-MCP 封面圖" width="100%">

  [![Website](https://img.shields.io/badge/Website-AGENTIC_MCP-blue)](https://agentic-mcp-skill.cablate.com/)
  [![Node.js Version](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen)](https://nodejs.org)

  **[English](./README.md)** | **[繁體中文](./README_zhTW.md)**

</div>

---

## 設計初衷

### 已驗證的 AgentSkills 模式

在 AgentSkills.io 生態系中，**漸進式揭露（Progressive Disclosure）** 結合 **Script 連結** 已被驗證為有效：

- AI 只在需要時載入特定資訊，大幅降低 token 用量
- Scripts 可透過 AI 指令調用，提供高度客製化潛力
- 透過 scripts 分享工具，遠比開發和使用複雜的 MCP Servers 低成本

這個模式的影響是**顯著且實質的**。

### MCP Skill 的當前困境

儘管如此，許多使用 MCP 的 Skills 仍面臨兩個極端選擇：

**選項 1：直接在 Claude Code 等工具安裝 MCP，Skill 僅引導 AI 呼叫 MCP**
- MCP server 長期占據 AI 上下文
- 每次對話都載入完整工具列表
- Token 浪費，且 MCP 本身無法漸進探索

**選項 2：自己寫客製 Script**
- 考驗使用者的程式撰寫功力
- 客製化程度高，但缺乏標準
- 每個 MCP 都有自己的格式和規範
- 難以維護和分享

### 這個 Skill 的目標

**驗證 AgentSkills.io 模式是否適用於改善 MCP 使用**

這個概念驗證嘗試將 AgentSkills 的成功模式移植到 MCP 領域：

1. AgentSkills 架構能否應用於 MCP server 管理？
2. 三層漸進式揭露在 MCP 場景中是否有效？
3. Socket-based daemon 架構是否比直接使用 MCP 更實用？

### 實驗性質

這不是一個成熟產品，而是一個實驗：

- 測試 AgentSkills 模式在 MCP 領域的適用性
- 探索三層載入的實際效果
- 驗證 Daemon 架構的優缺點
- 作為未來開發的參考原型

### 重要免責聲明

**這是一個非常早期、匆忙完成的 AI 輔助示範版本**，當前目標：

- 驗證概念可行性
- 探索使用模式
- 收集反饋以改進

**不建議用於生產環境**。
預期會有很多問題和優化機會。如果發現任何問題或有建議，請開 Issue 或貢獻 PR。

---

## 核心概念

### 三層漸進載入

不需要一次載入所有內容：

**Layer 1：知道有哪些 server 可用**
```
只載入基本資訊（名稱、版本、狀態）
用量：約 50-100 tokens
適用：檢查是否可用、選擇要用的 server
```

**Layer 2：知道這個 server 提供什麼工具**
```
載入工具清單（名稱 + 簡短描述）
用量：約 200-400 tokens
適用：瀏覽可用工具、決定要用什麼
```

**Layer 3：只載入你要用的工具詳情**
```
載入特定工具的完整輸入格式
用量：約 300-500 tokens/tool
適用：準備呼叫工具前
```

### Token 節省效果

假設一個 MCP server 有 20 個工具，你只需要用其中 2 個：

| 載入方式 | Token 用量 | 說明 |
|:---|:---:|:---|
| 全載入 | 6,000 | 20 個工具 × 300 tokens |
| 三層漸進 | 850 | Metadata(50) + List(200) + 2 tools(600) |
| 節省 | 86% | 只載入需要的部分 |

---

## 快速開始

### 前置需求

- Node.js >= 18.0.0
- npm

### 1. 從 npm 安裝（推薦）

```bash
# 全局安裝
npm install -g @cablate/agentic-mcp

# 驗證安裝
agentic-mcp --version

# 啟動 daemon
agentic-mcp daemon start
```

### 2. 配置

編輯專案根目錄的 `mcp-servers.json`：

```json
{
  "servers": {
    "playwright": {
      "description": "Browser automation tool for web navigation, screenshots, clicks, form filling, and more",
      "type": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--isolated"]
    }
  }
}
```

### 3. 啟動 Daemon

```bash
node dist/cli/index.js daemon start --config <config-path>
```

### 4. 測試連線

```bash
# 檢查 daemon 狀態
agentic-mcp daemon health

# Layer 1: 檢查 server 狀態
agentic-mcp metadata playwright

# Layer 2: 列出可用工具
agentic-mcp list playwright

# Layer 3: 查看特定工具格式
agentic-mcp schema playwright browser_navigate
```

### 5. 呼叫工具

```bash
agentic-mcp call playwright browser_navigate --params '{"url": "https://example.com"}'
```

---

## 使用範例

### Web 自動化

使用 Playwright MCP server 進行瀏覽器自動化操作：

```bash
# 1. 導航至網站
agentic-mcp call playwright browser_navigate --params '{"url": "https://www.apple.com/tw"}'

# 2. 截圖
agentic-mcp call playwright browser_take_screenshot

# 3. 點擊元素
agentic-mcp call playwright browser_click --params '{"element": "Mac link", "ref": "e19"}'
```

### 熱重載配置

修改 `mcp-servers.json` 後重新載入，無需重啟 daemon：

```bash
agentic-mcp daemon reload
```

回應範例：

```
✓ Configuration reloaded
  Old servers: playwright_global
  New servers: playwright_global, filesystem_global
```

---

## 架構設計

### 系統架構

```
+-----------------------------+
|     AI 使用 CLI 指令         |
|  - agentic-mcp metadata      |
|  - agentic-mcp list          |
|  - agentic-mcp schema        |
|  - agentic-mcp call          |
+-----------+-----------------+
            | Socket (newline-delimited JSON)
            v
+-----------------------------+
|   MCP Daemon (Long-Running)  |
|  - 維持持久化 MCP 連接        |
|  - Socket 通訊 (TCP/Unix)    |
|  - 管理共享 sessions         |
|  - 支援 Hot Reload           |
+-----------+-----------------+
            | MCP Protocol
            v
+-----------------------------+
|        MCP Servers           |
|  - playwright (瀏覽器)       |
|  - filesystem (檔案)         |
|  - github (Git)              |
|  - 自訂 servers              |
+-----------------------------+
```

### Socket 通訊協議

**Client → Daemon** (newline-delimited JSON):
```json
{"id":"1","action":"metadata","server":"playwright"}
```

**Daemon → Client**:
```json
{"id":"1","success":true,"data":{...}}
```

**平台支援**：
- Windows: TCP socket (動態端口)
- Unix: Domain socket

---

## 命令說明

### Daemon 管理

```bash
agentic-mcp daemon start                           # 啟動 daemon
agentic-mcp daemon health                          # 檢查狀態
agentic-mcp daemon reload                          # 重新載入配置
agentic-mcp daemon stop                            # 停止 daemon
agentic-mcp daemon start --config <path>           # 使用自訂配置
```

**多 Session 支援**：
```bash
MCP_DAEMON_SESSION=proj1 agentic-mcp daemon start
MCP_DAEMON_SESSION=proj2 agentic-mcp daemon start
```

### 查詢命令

```bash
agentic-mcp metadata <server>                      # Server 資訊 (Layer 1)
agentic-mcp list <server>                          # 列出工具 (Layer 2)
agentic-mcp schema <server> <tool>                 # 工具詳情 (Layer 3)
```

### 工具呼叫

```bash
agentic-mcp call <server> <tool> --params '{"arg":"value"}'
```

**所有參數必須透過 `--params` 傳遞 JSON 物件。**

### JSON 輸出模式

```bash
agentic-mcp metadata <server> --json
agentic-mcp call <server> <tool> --params '{"arg":"value"}' --json
```

---

## 使用範例

### 網頁自動化

使用 Playwright MCP server 自動化瀏覽器操作：

```bash
# 1. 導航到網站
agentic-mcp call playwright browser_navigate --params '{"url": "https://www.apple.com/tw"}'

# 2. 截圖
agentic-mcp call playwright browser_take_screenshot --params '{}'

# 3. 點擊元素
agentic-mcp call playwright browser_click --params '{"element": "Mac link", "ref": "e19"}'
```

### Hot Reload 配置

修改 `mcp-servers.json` 後重新載入：

```bash
agentic-mcp daemon reload
```

回應範例：

```
✓ Configuration reloaded
  Old servers: playwright_global
  New servers: playwright_global, filesystem_global
```

---

## 安裝為 Claude Code Skill

```bash
mkdir -p .claude/skills/agentic-mcp
cp SKILL.md .claude/skills/agentic-mcp/
```

---

## 相關資源

- [SKILL.md](./SKILL.md) - 完整使用說明
- [MCP 規範](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [agent-browser](https://github.com/vercel-labs/agent-browser) - 架構參考

---

<div align="center">

這是一個持續演進的專案，歡迎提供反饋

</div>
