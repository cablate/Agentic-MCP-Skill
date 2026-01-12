#!/usr/bin/env python3
"""
MCP Close Tool - Close MCP session in Daemon

Usage:
    python mcp_close.py --session playwright_global
    python mcp_close.py --server playwright  # infers session_id as {server}_global
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


async def close_session(daemon_port: int, session_id: str) -> dict:
    """Close MCP session through Daemon"""
    daemon_url = f"http://localhost:{daemon_port}"

    async with aiohttp.ClientSession() as session:
        async with session.delete(f"{daemon_url}/sessions/{session_id}") as resp:
            if resp.status == 404:
                data = await resp.json()
                raise Exception(data.get('error', 'Session not found'))
            elif resp.status == 400:
                data = await resp.json()
                raise Exception(data.get('error', 'Bad request'))

            data = await resp.json()
            return data


async def main():
    parser = argparse.ArgumentParser(description="Close MCP session")
    parser.add_argument("--daemon-port", type=int, default=13579, help="Daemon port (default: 13579)")
    parser.add_argument("--session", help="Session ID (e.g., playwright_global)")
    parser.add_argument("--server", help="Server name (infers session_id as {server}_global)")

    args = parser.parse_args()

    # Infer session_id
    session_id = args.session
    if not session_id:
        if args.server:
            session_id = f"{args.server}_global"
        else:
            print("Error: please provide --session or --server")
            sys.exit(1)

    try:
        result = await close_session(args.daemon_port, session_id)

        session_type = result.get('type', 'unknown')
        if session_type == 'global':
            print(f"✅ Global session closed")
            print(f"   Session: {result.get('sessionId')}")
            print(f"   Type: Global preconnected")
        else:
            print(f"✅ Session closed")
            print(f"   Session: {result.get('sessionId')}")
            print(f"   Type: Dynamic")

        disconnected_at = result.get('disconnectedAt', '')
        if disconnected_at:
            print(f"   Time: {disconnected_at}")

        print(f"\n💡 To reconnect:")
        print(f"   curl -X POST http://localhost:{args.daemon_port}/sessions/{session_id}/reconnect")

    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
