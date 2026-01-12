#!/usr/bin/env python3
"""
MCP Session Tool - Session-based operations via Daemon

Maintain connection, execute multiple operations, then auto-disconnect.

Usage:
    python mcp_session.py --server playwright
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


async def main():
    parser = argparse.ArgumentParser(description="Daemon session-based operations")
    parser.add_argument("--server", default="playwright", help="Server name")
    parser.add_argument("--daemon-port", type=int, default=13579, help="Daemon port (default: 13579)")
    parser.add_argument("--script", help="Operation script file (JSON)")

    args = parser.parse_args()

    daemon_url = f"http://localhost:{args.daemon_port}"

    async with aiohttp.ClientSession() as session:
        # Connect
        print(f"📡 Connecting to {args.server}...")
        async with session.post(
            f"{daemon_url}/connect",
            json={"server": args.server},
            headers={"Content-Type": "application/json"}
        ) as resp:
            data = await resp.json()
            if not data.get("success"):
                raise Exception(f"Connection failed: {data}")
            session_id = data["sessionId"]
            print(f"✅ Session: {session_id}")

        await asyncio.sleep(2)

        # Built-in test script: Google search
        test_script = [
            {
                "tool": "browser_navigate",
                "params": {"url": "https://www.google.com"},
                "desc": "Navigate to Google"
            },
            {
                "tool": "browser_snapshot",
                "params": {},
                "desc": "Take snapshot"
            },
            {
                "tool": "browser_take_screenshot",
                "params": {},
                "desc": "Take screenshot"
            }
        ]

        # Use provided script or built-in test
        if args.script:
            with open(args.script, 'r', encoding='utf-8') as f:
                actions = json.load(f)
        else:
            actions = test_script
            print("\nUsing built-in test script...\n")

        # Execute operations
        results = []
        for i, action in enumerate(actions, 1):
            tool = action.get("tool")
            params = action.get("params", {})
            desc = action.get("desc", tool)

            print(f"[{i}/{len(actions)}] {desc}...")

            call_data = {
                "sessionId": session_id,
                "method": "tools/call",
                "params": {
                    "name": tool,
                    "arguments": params
                }
            }

            async with session.post(
                f"{daemon_url}/call",
                json=call_data,
                headers={"Content-Type": "application/json"}
            ) as resp:
                result_data = await resp.json()
                result = result_data.get("result", {})

                # Check if successful
                content_list = result.get("content", [])
                if content_list:
                    text = content_list[0].get("text", "")
                    if "Error" in text and "isError" in result:
                        print(f"  ❌ {text[:200]}")
                    else:
                        print(f"  ✅ Done")

                results.append({
                    "action": desc,
                    "tool": tool,
                    "result": result
                })

            await asyncio.sleep(0.5)

        # Output summary
        print(f"\n✅ Execution complete, {len(results)} operations performed")

        # Note: Global preconnected sessions don't need disconnect
        # Daemon will clean up connections when it stops


if __name__ == "__main__":
    asyncio.run(main())
