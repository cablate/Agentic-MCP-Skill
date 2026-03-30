---
name: agentic-mcp
description: "Manage MCP servers via a Socket daemon — start the daemon, list available servers, discover tools, read tool schemas, and execute tool calls with progressive disclosure to minimize token usage. Use when the user needs to connect to MCP servers, start or stop the MCP daemon, list available MCP tools, run an MCP tool, check server status, or reload MCP configuration."
---

# Agentic MCP

## Workflow

1. **Start daemon**: `agentic-mcp daemon start --config <mcp-servers.json path>`
2. **Verify running**: `agentic-mcp daemon health` — confirm `✓ Daemon is running` before proceeding
3. **Layer 1 — Server info**: `agentic-mcp metadata <server>` — returns name, version, status (~50-100 tokens)
4. **Layer 2 — List tools**: `agentic-mcp list <server>` — returns tool names + descriptions (~200-400 tokens)
5. **Layer 3 — Tool schema**: `agentic-mcp schema <server> <tool>` — returns full input format (~300-500 tokens/tool)
6. **Call tool**: `agentic-mcp call <server> <tool> --params '{"argName":"value"}'`

All parameters must be a JSON object via `--params`. Append `--json` to any command for machine-readable output.

## Daemon management

```bash
agentic-mcp daemon start                           # Start daemon
agentic-mcp daemon start --config <path>           # Start with custom config
agentic-mcp daemon health                          # Check status
agentic-mcp daemon reload                          # Reload config without restart
agentic-mcp daemon stop                            # Stop daemon
```

**Isolated sessions** (run multiple daemons side by side):
```bash
MCP_DAEMON_SESSION=proj1 agentic-mcp daemon start
MCP_DAEMON_SESSION=proj2 agentic-mcp daemon start
```

## Configuration

**mcp-servers.json**:
```json
{
  "servers": {
    "<server-name>": {
      "command": "npx",
      "args": ["-y", "@scope/mcp-server"]
    }
  }
}
```

## Error recovery

| Error | Cause | Fix |
|-------|-------|-----|
| `✗ MCP daemon is not running` | Daemon not started or crashed | Run `agentic-mcp daemon start` |
| `✗ Server '<name>' not found` | Server missing from config | Add to `mcp-servers.json`, then `agentic-mcp daemon reload` |
| `✗ Tool '<name>' not found` | Wrong tool name | Run `agentic-mcp list <server>` to see available tools |
| `✗ Required argument '<name>' not provided` | Missing param in `--params` | Run `agentic-mcp schema <server> <tool>` to check required args |

## Socket protocol

Commands use newline-delimited JSON over Unix domain socket (or TCP on Windows):

```json
{"id":"1","action":"metadata","server":"<server>"}
```

Response: `{"id":"1","success":true,"data":{...}}`
