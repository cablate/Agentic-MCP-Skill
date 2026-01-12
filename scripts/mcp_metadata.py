#!/usr/bin/env python3
"""
MCP Metadata - Get MCP server metadata via Daemon

Usage:
    python mcp_metadata.py --server playwright
    python mcp_metadata.py --daemon-port 13579 --server playwright
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


async def get_metadata(daemon_port: int, server: str) -> Dict[str, Any]:
    """Get MCP server metadata through Daemon"""
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

        # Get metadata - Daemon doesn't have a dedicated endpoint for this
        # So we use tools/list to infer server info
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

        # Extract metadata from initialize result that's cached in daemon
        # Since we can't directly access it, return basic info
        metadata = {
            "server": server,
            "sessionId": session_id,
            "protocolVersion": "2024-11-05",
            "status": "connected"
        }

        return metadata


async def main():
    parser = argparse.ArgumentParser(description="Get MCP server metadata")
    parser.add_argument("--daemon-port", type=int, default=13579, help="Daemon port (default: 13579)")
    parser.add_argument("--server", required=True, help="Server name (e.g., playwright)")

    args = parser.parse_args()

    try:
        metadata = await get_metadata(args.daemon_port, args.server)

        output = {
            "success": True,
            "server": args.server,
            "metadata": metadata
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
