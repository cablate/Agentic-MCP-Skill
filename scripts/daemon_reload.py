#!/usr/bin/env python3
"""
Daemon Reload Tool - Reload MCP configuration

Usage:
    python daemon_reload.py
    python daemon_reload.py --daemon-port 13579
"""

import argparse
import asyncio
import json
import sys

try:
    import aiohttp
except ImportError:
    print("Error: aiohttp is required. Install with: pip install aiohttp", file=sys.stderr)
    sys.exit(1)


async def reload_daemon(daemon_port: int) -> dict:
    """Reload MCP Daemon configuration"""
    daemon_url = f"http://localhost:{daemon_port}"

    async with aiohttp.ClientSession() as session:
        async with session.post(f"{daemon_url}/reload") as resp:
            if resp.status == 404:
                raise Exception("Daemon not running or /reload endpoint not available")

            data = await resp.json()

            if data.get('success'):
                return data
            else:
                raise Exception(data.get('error', 'Unknown error'))


async def main():
    parser = argparse.ArgumentParser(description="Reload MCP Daemon configuration")
    parser.add_argument("--daemon-port", type=int, default=13579, help="Daemon port (default: 13579)")

    args = parser.parse_args()

    try:
        result = await reload_daemon(args.daemon_port)

        print("✅ Configuration reloaded")
        if 'oldServers' in result:
            print(f"   Old servers: {result['oldServers']}")
        if 'newServers' in result:
            print(f"   New servers: {result['newServers']}")
        if 'servers' in result:
            print(f"   Available: {result['servers']}")
        if 'timestamp' in result:
            print(f"   Time: {result['timestamp']}")

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
