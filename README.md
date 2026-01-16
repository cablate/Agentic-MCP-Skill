<div align="center">

  # Agentic-MCP with Skill

  ### AgentSkill for MCP - Three-layer progressive disclosure validates AgentSkills.io pattern for efficient MCP token usage

  [![Node.js Version](https://img.shields.io/badge/node-%3E=18.0.0-brightgreen)](https://nodejs.org)

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
3. Is Socket-based daemon architecture more practical than direct MCP usage?

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
- npm

**⚠️ Note**: Python scripts are now archived in `archive/python-legacy/`. The project now uses a unified npm CLI.

### 1. Install and Build

```bash
npm install
npm run build
```

### 2. Configure

Edit `mcp-servers.json` in the project root:

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

**Configuration File Location Priority**:
1. `MCP_DAEMON_CONFIG` environment variable (if set)
2. `mcp-servers.json` in project root
3. `config/mcp-servers.json` (relative to daemon working directory)

### 3. Start Daemon

```bash
node dist/cli/index.js daemon start
```

Or add to PATH for global usage:
```bash
npm link

# Then use from anywhere
agentic-mcp daemon start
```

### 4. Test Connection

```bash
# Check daemon health
agentic-mcp daemon health

# Layer 1: Check server status
agentic-mcp metadata playwright

# Layer 2: List available tools
agentic-mcp list playwright

# Layer 3: View specific tool format
agentic-mcp schema playwright browser_navigate
```

### 5. Call Tool

```bash
agentic-mcp call playwright browser_navigate --params '{"url": "https://example.com"}'
```

---

## Multi-Session Support

### Concept

agentic-mcp supports **multiple concurrent sessions** for the same MCP server, inspired by [agent-browser](https://github.com/vercel-labs/agent-browser) design patterns.

**Session Types**:
- **Global Sessions**: `{server}_global` - Auto-created at daemon startup
- **Dynamic Sessions**: `{server}_{clientId}` or `{server}_{timestamp}` - Created on-demand

### Why Multiple Sessions?

| Use Case | Description |
|:---------|:------------|
| **Multi-Agent Parallel** | Different AI Agents work simultaneously without interference |
| **Multi-User Isolation** | Separate sessions for different users with their own state |
| **Environment Separation** | Dev/Test/Prod environments with different configurations |
| **Resource Optimization** | Shared daemon process, isolated connections |

### Session Management API

#### List All Sessions
```bash
agentic-mcp session --list

# Output:
Active sessions (0):
  (no active sessions)
```

#### Create Dynamic Session
```bash
# With custom client ID
agentic-mcp session --create --server serena --client-id agent_a

# Auto-generated session ID (timestamp)
agentic-mcp session --create --server serena
```

#### Close Session
```bash
agentic-mcp session --close serena_agent_a
```

#### Switch Session
```bash
agentic-mcp session --switch serena_agent_b
```

### Session Lifecycle

```
┌─────────────────────────────────────────────┐
│ Daemon Startup                              │
│ ├─ Preconnect: serena → serena_global     │
│ └─ Start cleanup timer (every 5 min)       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ Runtime (Dynamic Sessions)                  │
│ ├─ agentic-mcp session --create → serena_agent1    │
│ ├─ agentic-mcp session --create → serena_agent2    │
│ └─ Auto-cleanup after 30 min idle          │
└─────────────────────────────────────────────┘
```

### Advanced Usage

**Multi-Agent Scenario**:
```bash
# Terminal 1 - Agent A
agentic-mcp call serena find_file --session-id serena_agent_a --params '{"file_mask": "*.ts"}'

# Terminal 2 - Agent B (different project state)
agentic-mcp call serena activate_project --session-id serena_agent_b --params '{"project": "MyProject"}'
```

**Environment Isolation**:
```bash
# Development environment
agentic-mcp session --create --server serena --client-id dev
agentic-mcp call serena activate_project --session-id serena_dev --params '{"project": "MyProject_Dev"}'

# Test environment
agentic-mcp session --create --server serena --client-id test
agentic-mcp call serena activate_project --session-id serena_test --params '{"project": "MyProject_Test"}'
```

---

## Usage Examples

### Web Automation

Automate browser operations using Playwright MCP server:

```bash
# 1. Navigate to website
agentic-mcp call playwright browser_navigate --params '{"url": "https://www.apple.com/tw"}'

# 2. Take screenshot
agentic-mcp call playwright browser_take_screenshot

# 3. Click element
agentic-mcp call playwright browser_click --params '{"element": "Mac link", "ref": "e19"}'
```

### Hot Reload Configuration

Reload after modifying `mcp-servers.json` without restarting daemon:

```bash
agentic-mcp daemon reload
```

Response example:

```
✓ Configuration reloaded
  Old servers: playwright_global
  New servers: playwright_global, filesystem_global
```

---

## Architecture

### System Architecture

```
+-----------------------------+
|     AI / CLI Layer          |
|  (CLI commands)              |
|  - agentic-mcp metadata      |
|  - agentic-mcp list          |
|  - agentic-mcp schema        |
|  - agentic-mcp call          |
+-----------+-----------------+
            | Socket (newline-delimited JSON)
            v
+-----------------------------+
|   MCP Daemon (Long-Running)  |
|  - Maintain persistent MCP   |
|    connections               |
|  - Socket communication      |
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
| `MCP_DAEMON_CONFIG` | - | Path to custom `mcp-servers.json` configuration file |

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
      "description": "Browser automation tool for web navigation, screenshots, clicks, and form filling",
      "transportType": "stdio",
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--isolated"]
    }
  }
}
```

**Configuration Notes**:
- `description` (optional): Server description for AI to understand the MCP server's purpose. If not provided, Layer 1 metadata will not include this field.

---

## Resources
- [SKILL.md](./SKILL.md) - Complete usage guide
- [docs/AGENT_BROWSER_DESIGN_PATTERNS.md](./docs/AGENT_BROWSER_DESIGN_PATTERNS.md) - Design patterns learned from agent-browser
- [MCP Specification](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [AgentSkills.io](https://agentskills.io/home)

---

<div align="center">

This is a concept validation project, feedback welcome

</div>
