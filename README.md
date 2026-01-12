<div align="center">

  # MCP Progressive AgentSkill

  ### AgentSkill for MCP - Three-layer progressive disclosure validates AgentSkills.io pattern

  [![Node.js Version](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen)](https://nodejs.org)
  [![Python Version](https://img.shields.io/badge/python-3.8+-blue)](https://python.org)

  Daemon-based AgentSkill with three-layer progressive disclosure for efficient MCP token usage

  **[English](./README.md)** | **[繁體中文](./README_zhTW.md)**

</div>

---

## Design Intent

### Proven AgentSkills Pattern

In the AgentSkills.io ecosystem, **Progressive Disclosure** combined with **Script linkage** has been validated as effective:

- AI only loads specific information when needed, significantly reducing token usage
- Scripts can be invoked via AI commands, providing high customization potential
- Sharing tools via scripts is far less costly than developing and using complex MCP Servers

The impact of this pattern is **significant and substantial**.

### Current MCP Skill Dilemma

Despite this, many Skills using MCP still face two extreme options:

**Option 1: Install MCP directly in Claude Code, Skill only guides AI to call MCP**
- MCP server occupies AI context long-term
- Full tool list loaded every conversation
- Token waste, and MCP itself cannot be progressively explored

**Option 2: Write custom scripts yourself**
- Tests user's programming skills
- High customization but lacks standards
- Each MCP has its own format/specs, high adaptation cost for both open and closed source
- Difficult to maintain and share

### This Skill's Goal

**Validate whether AgentSkills.io pattern applies to improving MCP usage**

This concept validation attempts to port AgentSkills' successful pattern to the MCP domain:

1. Can AgentSkills architecture apply to MCP server management?
2. Is three-layer progressive disclosure effective in MCP scenarios?
3. Is Python scripts + Simple MCP Client architecture more practical than direct MCP usage?

### Experimental Nature

This is not a mature product, but an experiment:

- Test AgentSkills pattern applicability in MCP domain
- Explore actual effectiveness of three-layer loading
- Validate pros/cons of Daemon architecture
- Serve as reference prototype for future development

### Important Disclaimer

**This is a very early, rushed AI-assisted demo version** with current goals:

- Validate concept feasibility
- Explore usage patterns
- Collect feedback for improvements

**Not recommended for production use**.
Expect many issues and optimization opportunities. If you find any problems or have suggestions, please open an Issue or contribute a PR.

---

## Core Concepts

### Three-Layer Progressive Disclosure

Like AgentSkills, you don't need to load everything at once:

**Layer 1: Know which servers are available**
```
Load only basic info (name, version, status)
Usage: ~50-100 tokens
Use case: Check availability, choose server
```

**Layer 2: Know what tools this server provides**
```
Load tool list (names + brief descriptions)
Usage: ~200-400 tokens
Use case: Browse available tools, decide what to use
```

**Layer 3: Load only the tools you need**
```
Load complete input format for specific tool
Usage: ~300-500 tokens/tool
Use case: Before calling tool
```

### Why This Approach

Assume an MCP server has 20 tools, you only need 2:

| Loading Method | Token Usage | Description |
|:---|:---:|:---|
| Load All | 6,000 | 20 tools × 300 tokens |
| Three-Layer Progressive | 850 | Metadata(50) + List(200) + 2 tools(600) |
| Savings | 86% | Only load what you need |

---

## Development Status

### Future Plans

Based on concept validation results, future directions include:

**Short-term Goals**
- More convenient MCP Servers management (UI, auto-discovery, one-click install)
- Implement Auth features (API Key management, permission control)

**Mid-term Goals**
- Enhance MCP Server tool calling experience (better error messages, parameter validation, result formatting)
- Intercept MCP Server output with customizable Script data processing, avoid massive messy data entering conversation memory

This project's direction depends on:

- Concept validation results
- Community feedback
- Actual usage needs

Feedback and suggestions welcome.

---

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- Python >= 3.8
- npm

### 1. Install

```bash
python scripts/setup.py
```

This command automatically checks environment, installs dependencies, and compiles the daemon.

### 2. Configure

Edit `mcp-servers.json`:

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

### 3. Start Daemon

```bash
python scripts/daemon_start.py --no-follow
```

### 4. Test Connection

```bash
# Layer 1: Check server status
python scripts/mcp_metadata.py --server playwright

# Layer 2: List available tools
python scripts/mcp_list_tools.py --server playwright

# Layer 3: View specific tool format
python scripts/mcp_tool_schema.py --server playwright --tool browser_navigate
```

### 5. Call Tool

```bash
python scripts/mcp_call.py \
  --server playwright \
  --tool browser_navigate \
  --params '{"url": "https://example.com"}'
```

---

## Usage Examples

### Web Automation

Automate browser operations using Playwright MCP server:

```bash
# 1. Navigate to website
python scripts/mcp_call.py \
  --server playwright \
  --tool browser_navigate \
  --params '{"url": "https://www.apple.com/tw"}'

# 2. Take screenshot
python scripts/mcp_call.py \
  --server playwright \
  --tool browser_take_screenshot

# 3. Click element
python scripts/mcp_call.py \
  --server playwright \
  --tool browser_click \
  --params '{"element": "Mac link", "ref": "e19"}'
```

### Multi-Tool Batch Execution

Create `session.json` to execute a series of operations:

```json
[
  {
    "tool": "browser_navigate",
    "params": {"url": "https://example.com"},
    "desc": "Navigate to example.com"
  },
  {
    "tool": "browser_take_screenshot",
    "params": {},
    "desc": "Take screenshot"
  },
  {
    "tool": "browser_click",
    "params": {"element": "Submit", "ref": "e42"},
    "desc": "Click submit button"
  }
]
```

Execute:

```bash
python scripts/mcp_session.py --server playwright --script session.json
```

### Hot Reload Configuration

Reload after modifying `mcp-servers.json` without restarting daemon:

```bash
python scripts/daemon_reload.py
```

Response example:

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

## Architecture

### System Architecture

```
+-----------------------------+
|     AI / Skill Layer        |
|  (Python scripts call API)   |
|  - mcp_metadata.py           |
|  - mcp_list_tools.py         |
|  - mcp_call.py               |
+-----------+-----------------+
            | HTTP (13579)
            v
+-----------------------------+
|   MCP Daemon (Long-Running)  |
|  - Maintain persistent MCP   |
|    connections               |
|  - Provide HTTP API          |
|  - Manage shared sessions    |
|  - Support Hot Reload        |
+-----------+-----------------+
            | MCP Protocol
            v
+-----------------------------+
|        MCP Servers           |
|  - playwright (browser)      |
|  - filesystem (files)        |
|  - github (Git)              |
|  - custom servers            |
+-----------------------------+
```

### Session Management

| Session Type | Purpose | Lifecycle |
|:---|:---|:---|
| **Global Session** | Pre-connected, shared by all requests | Daemon start → shutdown |
| **Dynamic Session** | Independent connection, specific use | On-demand → manual close |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|:---|:---:|:---|
| `MCP_DAEMON_PORT` | 13579 | Daemon HTTP port |

### Transport Types

| Type | Description | Use Case |
|:---|:---|:---|
| `stdio` | Standard input/output | Local MCP server (default) |
| `http-streamable` | HTTP streaming | Remote MCP server |
| `sse` | Server-Sent Events | Event-driven MCP server |

### MCP Servers Configuration

Edit `mcp-servers.json`:

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

## Resources

- [SKILL.md](./SKILL.md) - Complete usage guide
- [MCP Specification](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [AgentSkills.io](https://agentskills.io/home)

---

<div align="center">

This is a concept validation project, feedback welcome

</div>
