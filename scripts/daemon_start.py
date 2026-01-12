#!/usr/bin/env python3
"""
Daemon Startup Script - Start MCP Daemon

Starts the MCP daemon process for managing persistent MCP server connections.

Usage:
    python daemon_start.py
    python daemon_start.py --daemon-port 13579
"""

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path


def find_daemon_entry() -> Path:
    """Find the daemon entry point (dist/daemon/index.js or src/daemon/index.ts for dev)"""
    project_root = Path(__file__).parent.parent

    # Check for compiled version first
    dist_entry = project_root / "daemon" / "dist" / "daemon" / "index.js"
    if dist_entry.exists():
        return dist_entry

    # Fallback to source with ts-node
    src_entry = project_root / "daemon" / "src" / "daemon" / "index.ts"
    if src_entry.exists():
        return src_entry

    raise FileNotFoundError(
        f"Daemon entry point not found. Tried:\n"
        f"  - {dist_entry}\n"
        f"  - {src_entry}\n\n"
        f"Please run: cd daemon && npm install && npm run build"
    )


def check_dependencies() -> bool:
    """Check if Node.js and npm dependencies are available"""
    try:
        # Check Node.js
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode != 0:
            return False
        print(f"✅ Node.js: {result.stdout.strip()}")
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("❌ Node.js not found")
        return False

    # Check if daemon dependencies are installed
    daemon_dir = Path(__file__).parent.parent / "daemon"
    node_modules = daemon_dir / "node_modules"

    if not node_modules.exists():
        print("⚠️  Daemon dependencies not installed")
        print(f"   Run: cd {daemon_dir} && npm install")
        return False

    print("✅ Dependencies installed")
    return True


def start_daemon(port: int, dev: bool = False) -> subprocess.Popen:
    """Start the MCP daemon process"""
    daemon_entry = find_daemon_entry()
    daemon_dir = daemon_entry.parent.parent

    # Prepare environment
    env = os.environ.copy()
    env["MCP_DAEMON_PORT"] = str(port)

    # Prepare command
    if daemon_entry.suffix == ".ts":
        # TypeScript source - use ts-node or tsx
        cmd = ["npx", "tsx", str(daemon_entry)]
    else:
        # Compiled JavaScript
        cmd = ["node", str(daemon_entry)]

    print(f"\n🚀 Starting MCP Daemon...")
    print(f"   Entry: {daemon_entry}")
    print(f"   Port: {port}")
    print(f"   Directory: {daemon_dir}\n")

    # Start daemon
    process = subprocess.Popen(
        cmd,
        cwd=str(daemon_dir),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    # Wait for startup
    print("⏳ Waiting for daemon to start...")
    for i in range(10):  # Wait up to 5 seconds
        try:
            import urllib.request
            import urllib.error
            # Use /health endpoint instead of root
            req = urllib.request.Request(f"http://localhost:{port}/health")
            response = urllib.request.urlopen(req, timeout=1)
            print(f"✅ Daemon started successfully on port {port}\n")
            print(f"📡 Daemon is running at: http://localhost:{port}")
            print(f"📝 Logs are being captured below (Ctrl+C to stop):\n")
            return process
        except (urllib.error.URLError, urllib.error.HTTPError):
            time.sleep(0.5)
        except Exception:
            time.sleep(0.5)

    # If we get here, startup failed
    print(f"❌ Daemon failed to start within timeout")
    process.terminate()
    process.wait()
    sys.exit(1)


def follow_logs(process: subprocess.Popen):
    """Follow daemon logs in real-time"""
    try:
        for line in process.stdout:
            print(line, end="")
    except KeyboardInterrupt:
        print("\n\n⏸️  Stopping daemon...")
        process.terminate()
        process.wait()
        print("✅ Daemon stopped")


def main():
    parser = argparse.ArgumentParser(description="Start MCP Daemon")
    parser.add_argument(
        "--daemon-port",
        type=int,
        default=13579,
        help="Daemon port (default: 13579)"
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help="Development mode (use ts-node for TypeScript source)"
    )
    parser.add_argument(
        "--no-follow",
        action="store_true",
        help="Start daemon but don't follow logs (run in background)"
    )

    args = parser.parse_args()

    # Check dependencies
    if not check_dependencies():
        print("\n❌ Dependencies check failed")
        sys.exit(1)

    # Start daemon
    try:
        process = start_daemon(args.daemon_port, args.dev)

        if args.no_follow:
            print(f"✅ Daemon running in background (PID: {process.pid})")
            print(f"   Stop with: python scripts/daemon_shutdown.py")
        else:
            # Follow logs
            follow_logs(process)

    except KeyboardInterrupt:
        print("\n\n⏸️  Interrupted")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
