<div align="center">

  # MCP Progressive AgentSkill

  ### AgentSkill for MCP - Three-layer progressive disclosure validates AgentSkills.io pattern

  [![Node.js Version](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen)](https://nodejs.org)
  [![Python Version](https://img.shields.io/badge/python-3.8+-blue)](https://python.org)

  Daemon-based AgentSkill with three-layer progressive disclosure for efficient MCP token usage

  **[English](./README.md)** | **[繁體中文](./README_zhTW.md)**
  
</div>

---

## 設計初衷

### AgentSkills 模式的成功經驗

在 AgentSkills.io 生態系中，**漸進式揭露 (Progressive Disclosure)** 配合 **Script 連動** 的模式已經被驗證是有效的：

- AI 只在需要時載入特定資訊，大幅降低 token 用量
- 透過 AI 可使用指令調用 scripts 的概念，使 Script 的客製化空間相當高
- 透過 Scripts 進行工具分享的成本遠低於開發與使用都相對複雜的 MCP Server

這種模式帶來的成效是**顯著且巨大**的。

### 目前 MCP 在 Skill 場景的困境

儘管如此，許多使用到 MCP 的 Skill，其實作仍然面臨兩個極端選擇：

**選項 1：直接在 Claude Code 等工具安裝 MCP，Skill 僅作為引導讓 AI 調用 MCP**
- MCP server 長期占據 AI 上下文
- 每次對話都載入完整工具列表
- Token 浪費，且 MCP 本身無法漸進探索

**選項 2：自己寫客製 Script**
- 考驗使用者的程式撰寫功力
- 客製化程度高，但缺乏標準
- 每個 MCP 都有自己的格式和規範、不論開源或閉源的前期調適成本高昂
- 難以維護和分享

### 這個 Skill 的目標

**驗證 AgentSkills.io 的模式是否適用於改善 MCP 的使用場景**

這個概念驗證嘗試將 AgentSkills 的成功模式移植到 MCP 領域：

1. AgentSkills 的架構模式能否套用到 MCP server 的管理？
2. 三層漸進載入（Progressive Disclosure）在 MCP 場景中是否有效？
3. Python scripts + Simple MCP Client 的架構是否比直接使用 MCP 更實用？

### 實驗性質

這不是一個成熟的產品，而是一個實驗：

- 測試 AgentSkills 模式在 MCP 領域的適用性
- 探索三層載入機制的實際效果
- 驗證 Daemon 架構的優缺點
- 作為後續開發的參考原型

### 重要聲明

**這是一個十分早期、臨時用 AI 協助趕工的 demo 版本**，目前的目標是：

- 驗證概念可行性
- 探索使用模式
- 收集反饋改進

**不建議直接用於生產環境**。
可以預期會有非常多問題和可優化的空間。如果你發現任何問題或有改進建議，歡迎開 Issue 或貢獻 PR。

---

## 核心概念

### 三層漸進載入

就像 AgentSkills 一樣，不需要一次載入所有內容：

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

### 為什麼這樣做

假設一個 MCP server 有 20 個工具，你只需要用其中 2 個：

| 載入方式 | Token 用量 | 說明 |
|:---|:---:|:---|
| 全載入 | 6,000 | 20 個工具 × 300 tokens |
| 三層漸進 | 850 | Metadata(50) + List(200) + 2 tools(600) |
| 節省 | 86% | 只載入需要的部分 |

---

## 開發狀態

### 後續規劃

基於概念驗證的結果，後續發展方向包括：

**短期目標**
- 更便捷的 MCP Servers 管理（UI、自動發現、一鍵安裝）
- 實現 Auth 相關功能（API Key 管理、權限控制）

**中期目標**
- 補強 MCP Server 工具的調用體驗（更好的錯誤提示、參數驗證、結果格式化）
- 攔截 MCP Server 的輸出並且可自訂 Script 做資料處理，避免大量雜亂資訊進入對話記憶

這個專案的發展方向取決於：

- 概念驗證的結果
- 社群反饋
- 實際使用需求

歡迎提供意見與建議。

---

## 快速體驗

### 前置需求

- Node.js >= 18.0.0
- Python >= 3.8
- npm

### 1. 安裝

```bash
python scripts/setup.py
```

這個指令會自動檢查環境、安裝依賴、編譯 daemon。

### 2. 配置

編輯 `mcp-servers.json`：

```json
{
  "servers": {
    "playwright": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--isolated"]
    }
  }
}
```

### 3. 啟動 Daemon

```bash
python scripts/daemon_start.py --no-follow
```

### 4. 測試連線

```bash
# Layer 1: 檢查 server 狀態
python scripts/mcp_metadata.py --server playwright

# Layer 2: 列出可用工具
python scripts/mcp_list_tools.py --server playwright

# Layer 3: 查看特定工具格式
python scripts/mcp_tool_schema.py --server playwright --tool browser_navigate
```

### 5. 呼叫工具

```bash
python scripts/mcp_call.py \
  --server playwright \
  --tool browser_navigate \
  --params '{"url": "https://example.com"}'
```

---

## 使用範例

### 網頁自動化

使用 Playwright MCP server 自動化瀏覽器操作：

```bash
# 1. 導航到網站
python scripts/mcp_call.py \
  --server playwright \
  --tool browser_navigate \
  --params '{"url": "https://www.apple.com/tw"}'

# 2. 截圖
python scripts/mcp_call.py \
  --server playwright \
  --tool browser_take_screenshot

# 3. 點擊元素
python scripts/mcp_call.py \
  --server playwright \
  --tool browser_click \
  --params '{"element": "Mac link", "ref": "e19"}'
```

### 多工具批次執行

建立 `session.json` 來執行一連串操作：

```json
[
  {
    "tool": "browser_navigate",
    "params": {"url": "https://example.com"},
    "desc": "導航到 example.com"
  },
  {
    "tool": "browser_take_screenshot",
    "params": {},
    "desc": "截圖"
  },
  {
    "tool": "browser_click",
    "params": {"element": "Submit", "ref": "e42"},
    "desc": "點擊提交按鈕"
  }
]
```

執行：

```bash
python scripts/mcp_session.py --server playwright --script session.json
```

### Hot Reload 配置

修改 `mcp-servers.json` 後重新載入，無需重啟 daemon：

```bash
python scripts/daemon_reload.py
```

回應範例：

```json
{
  "success": true,
  "reloaded": true,
  "oldServers": ["playwright_global"],
  "newServers": ["playwright_global", "filesystem_global"],
  "servers": ["playwright", "filesystem"]
}
```

---

## 架構設計

### 系統架構

```
+-----------------------------+
|     AI / Skill Layer        |
|  (Python scripts 調用 API)   |
|  - mcp_metadata.py           |
|  - mcp_list_tools.py         |
|  - mcp_call.py               |
+-----------+-----------------+
            | HTTP (13579)
            v
+-----------------------------+
|   MCP Daemon (Long-Running)  |
|  - 維持持久化 MCP 連接        |
|  - 提供 HTTP API             |
|  - 管理共享 sessions         |
|  - 支援 Hot Reload           |
+-----------+-----------------+
            | MCP Protocol
            v
+-----------------------------+
|        MCP Servers           |
|  - playwright (瀏覽器)        |
|  - filesystem (檔案)          |
|  - github (Git)              |
|  - custom servers            |
+-----------------------------+
```

### Session 管理

| Session 類型 | 用途 | 生命週期 |
|:---|:---|:---|
| **Global Session** | 預連接，所有請求共享 | Daemon 啟動 → 關閉 |
| **Dynamic Session** | 獨立連接，特定用途 | 按需創建 → 手動關閉 |

---

## 配置說明

### 環境變量

| 變量 | 預設值 | 說明 |
|:---|:---:|:---|
| `MCP_DAEMON_PORT` | 13579 | Daemon HTTP port |

### Transport 類型

| 類型 | 說明 | 使用場景 |
|:---|:---|:---|
| `stdio` | 標準輸入/輸出 | 本地 MCP server（預設） |
| `http-streamable` | HTTP 串流 | 遠端 MCP server |
| `sse` | Server-Sent Events | 事件驅動的 MCP server |

### MCP Servers 配置範例

編輯 `mcp-servers.json`：

```json
{
  "servers": {
    "playwright": {
      "transportType": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--isolated"]
    }
  }
}
```
---

## 相關資源

- [SKILL.md](./SKILL.md) - 完整使用說明
- [MCP 規範](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [AgentSkills.io](https://agentskills.io/home)
---

<div align="center">

這是一個概念驗證專案，歡迎提供反饋

</div>
