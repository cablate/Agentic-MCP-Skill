#!/usr/bin/env python3
"""
Daemon Shutdown Tool - Stop MCP Daemon

Usage:
    python daemon_shutdown.py
    python daemon_shutdown.py --daemon-port 13579
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


async def shutdown_daemon(daemon_port: int) -> dict:
    """Shutdown MCP Daemon"""
    daemon_url = f"http://localhost:{daemon_port}"

    async with aiohttp.ClientSession() as session:
        async with session.post(f"{daemon_url}/shutdown") as resp:
            if resp.status == 404:
                raise Exception("Daemon not running or /shutdown endpoint not available")

            data = await resp.json()

            if data.get('success'):
                return data
            else:
                raise Exception(data.get('error', 'Unknown error'))


async def main():
    parser = argparse.ArgumentParser(description="Stop MCP Daemon")
    parser.add_argument("--daemon-port", type=int, default=13579, help="Daemon port (default: 13579)")

    args = parser.parse_args()

    try:
        result = await shutdown_daemon(args.daemon_port)

        print("✅ Daemon stopped")
        if 'shutdownAt' in result:
            print(f"   Time: {result['shutdownAt']}")

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
