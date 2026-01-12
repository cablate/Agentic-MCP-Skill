#!/usr/bin/env python3
"""
MCP List Tools - List MCP server tools via Daemon

Usage:
    python mcp_list_tools.py --server playwright
    python mcp_list_tools.py --daemon-port 13579 --server playwright
"""

import argparse
import asyncio
import json
import sys
from typing import Any, Dict, List

try:
    import aiohttp
except ImportError:
    print("Error: aiohttp is required. Install with: pip install aiohttp", file=sys.stderr)
    sys.exit(1)


async def list_tools(daemon_port: int, server: str) -> Dict[str, Any]:
    """List MCP server tools through Daemon"""
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

        # Call tools/list
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

            # Extract tools - Layer 2 (name + description only)
            tools = result.get("tools", [])
            tools_info = [
                {
                    "name": tool.get("name"),
                    "description": tool.get("description")
                }
                for tool in tools
            ]

            return {
                "server": server,
                "sessionId": session_id,
                "count": len(tools_info),
                "tools": tools_info
            }


async def main():
    parser = argparse.ArgumentParser(description="List MCP server tools")
    parser.add_argument("--daemon-port", type=int, default=13579, help="Daemon port (default: 13579)")
    parser.add_argument("--server", required=True, help="Server name (e.g., playwright)")

    args = parser.parse_args()

    try:
        result = await list_tools(args.daemon_port, args.server)

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
