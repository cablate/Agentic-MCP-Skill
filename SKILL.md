---
name: mcp-progressive-client
description: Progressive MCP client with daemon architecture for persistent connections. Use this Skill when you need to interact with MCP servers through a long-running daemon that maintains connections and provides three-layer progressive disclosure (metadata → tool list → tool schema). This enables efficient MCP server interactions without reconnection overhead.
---

# MCP Progressive Client

## Overview

Progressive MCP Client with daemon architecture - maintains persistent connections to MCP servers through an HTTP API, supporting three-layer progressive disclosure for efficient token usage.

**Three-Layer Progressive Disclosure**:
1. **Layer 1**: Server metadata (name, version, description)
2. **Layer 2**: Tool list (names + descriptions)
3. **Layer 3**: Tool schema (full input schema for specific tool)

---

# Process

## High-Level Workflow

Using MCP Progressive Client involves four main phases:

1. **Setup**: Install dependencies, configure MCP servers, start daemon
2. **Basic Usage**: Three-layer progressive disclosure (metadata → tools → schema → call)
3. **Advanced Usage**: Multi-tool sessions, session management
4. **Troubleshooting**: Debug common issues, clean shutdown

---

## Phase 1: Setup

### 1.1 Install and Build

First time setup - install dependencies and build daemon from source:

```bash
python scripts/setup.py
```

This script will:
- Check Node.js and npm are installed
- Run `npm install` in daemon/
- Run `npm run build` to compile TypeScript
- Verify build output

**Prerequisites**: Node.js 18+ and npm

### 1.2 Configure MCP Servers

Edit `mcp-servers.json` in the project root to configure which MCP servers to load:

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

**Supported transport types**:
- `stdio`: Standard input/output (local processes)
- `http-streamable`: HTTP streaming transport
- `sse`: Server-Sent Events

### 1.3 Start Daemon

Start the daemon using the startup script:

```bash
python scripts/daemon_start.py
```

Or run in background:

```bash
python scripts/daemon_start.py --no-follow
```

**Default port**: 13579 (configurable via `MCP_DAEMON_PORT` env var)

Verify daemon is running:

```bash
curl http://localhost:13579/health
```

Expected response:
```json
{"status":"ok","sessions":1}
```

### 1.4 Reload Configuration

After modifying `mcp-servers.json`, reload the daemon to apply changes:

```bash
python scripts/daemon_reload.py
```

**Response**:
```json
{
  "success": true,
  "reloaded": true,
  "oldServers": ["playwright_global"],
  "newServers": ["playwright_global"],
  "servers": ["playwright"],
  "timestamp": "2025-01-12T10:30:00.000Z"
}
```

This will:
1. Disconnect all current sessions
2. Reload configuration from `mcp-servers.json`
3. Reconnect to all servers
4. Return old/new server lists

---

## Phase 2: Basic Usage

### 2.1 Layer 1: Get Metadata

Get server information without tool details (most lightweight):

```bash
python scripts/mcp_metadata.py --server playwright
```

**Response**:
```json
{
  "success": true,
  "server": "playwright",
  "sessionId": "playwright_global",
  "metadata": {
    "name": "playwright",
    "version": "1.0.0"
  }
}
```

**Token usage**: ~50-100 tokens

### 2.2 Layer 2: List Tools

List available tools with names and descriptions:

```bash
python scripts/mcp_list_tools.py --server playwright
```

**Response**:
```json
{
  "tools": [
    {"name": "browser_navigate", "description": "Navigate to URL"},
    {"name": "browser_take_screenshot", "description": "Take screenshot"}
  ]
}
```

**Token usage**: ~200-400 tokens

### 2.3 Layer 3: Get Tool Schema

Get full input schema for a specific tool:

```bash
python scripts/mcp_tool_schema.py --server playwright --tool browser_navigate
```

**Response**:
```json
{
  "name": "browser_navigate",
  "description": "Navigate to URL",
  "inputSchema": {
    "type": "object",
    "properties": {
      "url": {"type": "string"}
    }
  }
}
```

**Token usage**: ~300-500 tokens per tool

### 2.4 Call Tool

Execute a tool with parameters:

```bash
python scripts/mcp_call.py \
  --server playwright \
  --tool browser_navigate \
  --params '{"url": "https://example.com"}'
```

**Scripts reuse sessions**: The `sessionId` from the response can be reused for subsequent calls to avoid reconnecting.

---

## Phase 3: Advanced Usage

### 3.1 Multi-Tool Sessions

Execute multiple tools in sequence using session scripts:

Create a session script (`session.json`):
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
  }
]
```

Execute:
```bash
python scripts/mcp_session.py --server playwright --script session.json
```

For session management, reuse the `sessionId` returned by scripts.

### 3.2 Session Management

**Global Sessions**: Pre-connected at daemon startup, shared by all requests
- Session ID format: `{server_name}_global`
- Automatically managed by daemon

**Session Lifecycle**:
1. Connect: `POST /connect` returns session ID
2. Use: Include `sessionId` in `/call` requests
3. Close: `DELETE /sessions/:id` or `mcp_close.py`

---

## Phase 4: Troubleshooting

### 4.1 Common Issues

**Daemon won't start**:
```bash
# Check if port is in use
netstat -ano | findstr :13579

# Kill process if needed
taskkill /PID <PID> /F
```

**Connection fails**:
1. Verify daemon is running: `curl http://localhost:13579/health`
2. Check MCP server configuration in `mcp-servers.json`
3. Verify MCP server command works independently

**Script errors**:
1. Ensure aiohttp is installed: `pip install aiohttp`
2. Check daemon port matches script default (13579)
3. Verify session ID is valid

For troubleshooting, check daemon logs and verify server configuration.

### 4.2 Debug Commands

**Check daemon status**:
```bash
curl http://localhost:13579/health
```

**List active sessions**:
```bash
python scripts/mcp_session.py --list
```

**View daemon logs**:
```bash
python scripts/daemon_start.py
# Logs are printed to stdout
```

**Shutdown daemon gracefully**:
```bash
python scripts/daemon_shutdown.py
```

---

## Project Structure

```
mcp-progressive-client/
├── SKILL.md               # This file - usage workflow
├── scripts/               # Python scripts
│   ├── setup.py          # Setup: install & build
│   ├── daemon_start.py   # Start daemon
│   ├── mcp_metadata.py   # Layer 1: Get metadata
│   ├── mcp_list_tools.py # Layer 2: List tools
│   ├── mcp_tool_schema.py# Layer 3: Get schema
│   ├── mcp_call.py        # Call tools
│   ├── mcp_session.py     # Multi-tool sessions
│   ├── mcp_close.py       # Close session
│   └── daemon_shutdown.py    # Shutdown daemon
├── daemon/                # Daemon implementation
│   ├── src/              # TypeScript source
│   ├── dist/             # Compiled JavaScript
│   ├── mcp-servers.json  # Server configuration
│   └── package.json
└── README.md              # Original project README
```

---

## License

MIT
