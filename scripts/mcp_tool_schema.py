#!/usr/bin/env python3
"""
MCP Tool Schema - Get tool schema via Daemon

Usage:
    python mcp_tool_schema.py --server playwright --tool browser_navigate
    python mcp_tool_schema.py --daemon-port 13579 --server playwright --tool browser_navigate
"""

import argparse
import asyncio
import json
import sys
from typing import Any, Dict

try:
    import aiohttp
except ImportError:
    print("Error: aiohttp is required. Install with: pip install aiohttp", file=sys.stderr)
    sys.exit(1)


async def get_tool_schema(daemon_port: int, server: str, tool_name: str) -> Dict[str, Any]:
    """Get tool schema through Daemon"""
    daemon_url = f"http://localhost:{daemon_port}"

    async with aiohttp.ClientSession() as session:
        # Connect to get global session
        async with session.post(
            f"{daemon_url}/connect",
            json={"server": server},
            headers={"Content-Type": "application/json"}
        ) as resp:
            if resp.status != 200:
                error_data = await resp.json()
                raise Exception(f"Daemon connection failed: {error_data.get('error', 'Unknown error')}")

            connect_data = await resp.json()
            if not connect_data.get("success"):
                raise Exception(f"Daemon connection failed: {connect_data}")

            session_id = connect_data["sessionId"]

        # Call tools/list to get all tools
        async with session.post(
            f"{daemon_url}/call",
            json={
                "sessionId": session_id,
                "method": "tools/list",
                "params": {}
            },
            headers={"Content-Type": "application/json"}
        ) as resp:
            if resp.status != 200:
                error_data = await resp.json()
                raise Exception(f"Tools list failed: {error_data.get('error', 'Unknown error')}")

            call_data = await resp.json()
            result = call_data.get("result", {})
            tools = result.get("tools", [])

            # Find the requested tool
            target_tool = None
            for tool in tools:
                if tool.get("name") == tool_name:
                    target_tool = tool
                    break

            if not target_tool:
                raise Exception(f"Tool '{tool_name}' not found")

            # Return Layer 3 (full schema)
            return {
                "server": server,
                "sessionId": session_id,
                "tool": tool_name,
                "schema": {
                    "name": target_tool.get("name"),
                    "description": target_tool.get("description"),
                    "inputSchema": target_tool.get("inputSchema")
                }
            }


async def main():
    parser = argparse.ArgumentParser(description="Get tool schema")
    parser.add_argument("--daemon-port", type=int, default=13579, help="Daemon port (default: 13579)")
    parser.add_argument("--server", required=True, help="Server name (e.g., playwright)")
    parser.add_argument("--tool", required=True, help="Tool name")

    args = parser.parse_args()

    try:
        result = await get_tool_schema(args.daemon_port, args.server, args.tool)

        output = {
            "success": True,
            **result
        }

        print(json.dumps(output, ensure_ascii=False, indent=2))

    except Exception as e:
        error_output = {
            "success": False,
            "error": str(e)
        }
        print(json.dumps(error_output, ensure_ascii=False, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
