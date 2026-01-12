#!/usr/bin/env python3
"""
Setup MCP Progressive Client daemon from source.

This script checks prerequisites and builds the daemon.
"""

import subprocess
import sys
from pathlib import Path

def check_nodejs() -> bool:
    """Check if Node.js is installed."""
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=5
        )
        print(f"✅ Node.js: {result.stdout.strip()}")
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        print("❌ Node.js not found")
        print("   Install from: https://nodejs.org/")
        return False

def check_npm() -> bool:
    """Check if npm is available."""
    try:
        # Try npm directly first
        result = subprocess.run(
            ["npm", "--version"],
            capture_output=True,
            text=True,
            timeout=5,
            shell=True
        )
        print(f"✅ npm: {result.stdout.strip()}")
        return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        # Try npm.cmd on Windows
        try:
            result = subprocess.run(
                ["npm.cmd", "--version"],
                capture_output=True,
                text=True,
                timeout=5,
                shell=True
            )
            print(f"✅ npm: {result.stdout.strip()}")
            return True
        except:
            print("❌ npm not found")
            return False

def install_dependencies() -> bool:
    """Run npm install in daemon directory."""
    daemon_dir = Path(__file__).parent.parent / "daemon"

    print("📦 Installing dependencies...")
    # Use shell=True for Windows compatibility
    result = subprocess.run(
        ["npm", "install"],
        cwd=str(daemon_dir),
        capture_output=True,
        text=True,
        shell=True
    )

    if result.returncode != 0:
        print("❌ npm install failed")
        if result.stderr:
            print(result.stderr)
        return False

    print("✅ Dependencies installed")
    return True

def build_daemon() -> bool:
    """Run npm run build."""
    daemon_dir = Path(__file__).parent.parent / "daemon"

    print("🔨 Building daemon...")
    # Use shell=True for Windows compatibility
    result = subprocess.run(
        ["npm", "run", "build"],
        cwd=str(daemon_dir),
        capture_output=True,
        text=True,
        shell=True
    )

    if result.returncode != 0:
        print("❌ Build failed")
        if result.stderr:
            print(result.stderr)
        return False

    print("✅ Build successful")
    return True

def verify_build() -> bool:
    """Verify dist/ exists."""
    daemon_dir = Path(__file__).parent.parent / "daemon"
    dist_entry = daemon_dir / "dist" / "daemon" / "index.js"

    if dist_entry.exists():
        print(f"✅ Build output: {dist_entry.relative_to(daemon_dir.parent)}")
        return True
    else:
        print("❌ Build output not found")
        return False

def main():
    print("🚀 Setting up MCP Progressive Client daemon...\n")

    # Check prerequisites
    if not check_nodejs():
        sys.exit(1)
    if not check_npm():
        sys.exit(1)

    # Install and build
    if not install_dependencies():
        sys.exit(1)
    if not build_daemon():
        sys.exit(1)

    # Verify
    if not verify_build():
        sys.exit(1)

    print("\n✅ Setup complete! You can now start the daemon:")
    print("   python scripts/daemon_start.py")

if __name__ == "__main__":
    main()
