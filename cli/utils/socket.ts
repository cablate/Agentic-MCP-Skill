/**
 * Socket Utilities for MCP Daemon (CLI copy)
 *
 * This is a minimal copy of socket utilities needed by CLI to check daemon status.
 * The full implementation is in src/socket.ts.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Platform detection
const isWindows = process.platform === 'win32';

// Default session name
const DEFAULT_SESSION = 'default';

/**
 * Get the current session from environment or default
 */
function getCurrentSession(): string {
  return process.env.MCP_DAEMON_SESSION || DEFAULT_SESSION;
}

/**
 * Get the PID file path for the current session
 */
function getPidFile(session?: string): string {
  const sess = session || getCurrentSession();
  return path.join(os.tmpdir(), `mcp-daemon-${sess}.pid`);
}

/**
 * Get the port file path for Windows (stores the port number)
 */
function getPortFile(session?: string): string {
  const sess = session || getCurrentSession();
  return path.join(os.tmpdir(), `mcp-daemon-${sess}.port`);
}

/**
 * Clean up socket and PID file for the current session
 */
function cleanupSocket(session?: string): void {
  const pidFile = getPidFile(session);
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    if (isWindows) {
      const portFile = getPortFile(session);
      if (fs.existsSync(portFile)) {
        fs.unlinkSync(portFile);
      }
    } else {
      const socketPath = path.join(os.tmpdir(), `mcp-daemon-${session || getCurrentSession()}.sock`);
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Check if daemon is running for the current session
 */
export function isDaemonRunning(session?: string): boolean {
  const pidFile = getPidFile(session);
  if (!fs.existsSync(pidFile)) {
    return false;
  }

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    // Check if process exists (works on both Unix and Windows)
    process.kill(pid, 0);
    return true;
  } catch {
    // Process doesn't exist, clean up stale files
    cleanupSocket(session);
    return false;
  }
}
