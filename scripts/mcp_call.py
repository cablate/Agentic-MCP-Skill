#!/usr/bin/env python3
"""
MCP Call Tool - Call MCP tools via Daemon

Usage:
    python mcp_call.py --server playwright --tool browser_navigate --url "https://google.com"
    python mcp_call.py --daemon-port 13579 --server playwright --tool browser_take_screenshot
"""

import argparse
import asyncio
import json
import sys
from typing import Any, Dict, Optional

try:
    import aiohttp
except ImportError:
    print("Error: aiohttp is required. Install with: pip install aiohttp", file=sys.stderr)
    sys.exit(1)


async def call_tool(
    daemon_port: int,
    server: str,
    tool: str,
    tool_args: Dict[str, Any],
    session_id: Optional[str] = None
) -> Dict[str, Any]:
    """Call MCP tool through Daemon"""
    daemon_url = f"http://localhost:{daemon_port}"

    async with aiohttp.ClientSession() as session:
        # Connect to get session (if not provided)
        if not session_id:
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

        # Call tool
        call_data = {
            "sessionId": session_id,
            "method": "tools/call",
            "params": {
                "name": tool,
                "arguments": tool_args
            }
        }

        async with session.post(
            f"{daemon_url}/call",
            json=call_data,
            headers={"Content-Type": "application/json"}
        ) as resp:
            if resp.status != 200:
                error_data = await resp.json()
                raise Exception(f"Tool call failed: {error_data.get('error', 'Unknown error')}")

            result_data = await resp.json()
            return result_data.get("result", {}), session_id


async def main():
    parser = argparse.ArgumentParser(description="Call MCP tool via Daemon")
    parser.add_argument("--daemon-port", type=int, default=13579, help="Daemon port (default: 13579)")
    parser.add_argument("--server", required=True, help="Server name (e.g., playwright)")
    parser.add_argument("--tool", required=True, help="Tool name")
    parser.add_argument("--params", help="Tool parameters (JSON format)")
    parser.add_argument("--session-id", help="Reuse existing Daemon Session ID")

    args = parser.parse_args()

    # Parse tool parameters
    tool_args = {}
    if args.params:
        try:
            tool_args = json.loads(args.params)
        except json.JSONDecodeError:
            print("Error: --params must be valid JSON format")
            sys.exit(1)

    try:
        result, session_id = await call_tool(
            args.daemon_port,
            args.server,
            args.tool,
            tool_args,
            args.session_id
        )

        output = {
            "success": True,
            "server": args.server,
            "tool": args.tool,
            "params": tool_args,
            "sessionId": session_id,
            "result": result
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
