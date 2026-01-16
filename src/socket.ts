/**
 * Socket Utilities for MCP Daemon
 *
 * Platform-specific IPC:
 * - Windows: TCP socket on localhost (port based on session hash)
 * - Unix/Linux/macOS: Unix domain socket
 *
 * Reference: agent-browser/src/daemon.ts
 */

import * as net from 'net';
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
export function getCurrentSession(): string {
  return process.env.MCP_DAEMON_SESSION || DEFAULT_SESSION;
}

/**
 * Get port number for TCP mode (Windows)
 * Uses a hash of the session name to get a consistent port
 */
function getPortForSession(session: string): number {
  let hash = 0;
  for (let i = 0; i < session.length; i++) {
    hash = (hash << 5) - hash + session.charCodeAt(i);
    hash |= 0;
  }
  // Port range 49152-65535 (dynamic/private ports)
  return 49152 + (Math.abs(hash) % 16383);
}

/**
 * Get the socket path for the current session (Unix) or port (Windows)
 */
export function getSocketPath(session?: string): string | number {
  const sess = session || getCurrentSession();
  if (isWindows) {
    return getPortForSession(sess);
  }
  return path.join(os.tmpdir(), `mcp-daemon-${sess}.sock`);
}

/**
 * Get the PID file path for the current session
 */
export function getPidFile(session?: string): string {
  const sess = session || getCurrentSession();
  return path.join(os.tmpdir(), `mcp-daemon-${sess}.pid`);
}

/**
 * Get the port file path for Windows (stores the port number)
 */
export function getPortFile(session?: string): string {
  const sess = session || getCurrentSession();
  return path.join(os.tmpdir(), `mcp-daemon-${sess}.port`);
}

/**
 * Get connection info for the current session
 * Returns { type: 'unix', path: string } or { type: 'tcp', port: number, host: string }
 */
export function getConnectionInfo(session?: string):
  | { type: 'unix'; path: string }
  | { type: 'tcp'; port: number; host: string } {
  const sess = session || getCurrentSession();
  if (isWindows) {
    return {
      type: 'tcp',
      port: getPortForSession(sess),
      host: '127.0.0.1'
    };
  }
  return {
    type: 'unix',
    path: path.join(os.tmpdir(), `mcp-daemon-${sess}.sock`)
  };
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

/**
 * Clean up socket and PID file for the current session
 */
export function cleanupSocket(session?: string): void {
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
      const socketPath = getSocketPath(session) as string;
      if (fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Create a socket server
 */
export function createSocketServer(
  handler: (socket: net.Socket) => void,
  session?: string
): net.Server {
  const server = net.createServer(handler);

  // Set up connection tracking
  const connections = new Set<net.Socket>();

  server.on('connection', (socket) => {
    connections.add(socket);
    socket.on('close', () => {
      connections.delete(socket);
    });
  });

  // Store connections for cleanup
  (server as any)._connections = connections;

  return server;
}

/**
 * Start listening on the socket
 */
export function startListening(
  server: net.Server,
  session?: string,
  callback?: () => void
): void {
  const connInfo = getConnectionInfo(session);

  if (connInfo.type === 'tcp') {
    // Windows: TCP socket
    const portFile = getPortFile(session);
    fs.writeFileSync(portFile, connInfo.port.toString());

    server.listen(connInfo.port, connInfo.host, callback);
  } else {
    // Unix: Unix domain socket
    // Clean up any existing socket file
    if (fs.existsSync(connInfo.path)) {
      fs.unlinkSync(connInfo.path);
    }

    server.listen(connInfo.path, callback);
  }
}

/**
 * Write PID file
 */
export function writePidFile(session?: string): void {
  const pidFile = getPidFile(session);
  fs.writeFileSync(pidFile, process.pid.toString());
}

/**
 * Connect to daemon socket
 */
export function connectToDaemon(
  session?: string,
  callback?: () => void
): net.Socket {
  const connInfo = getConnectionInfo(session);
  const socket = new net.Socket();

  if (connInfo.type === 'tcp') {
    socket.connect(connInfo.port, connInfo.host, callback);
  } else {
    socket.connect(connInfo.path, callback);
  }

  return socket;
}

/**
 * Gracefully close server and cleanup
 */
export function closeServer(server: net.Server, session?: string): Promise<void> {
  return new Promise((resolve) => {
    const connections = (server as any)._connections as Set<net.Socket> || new Set();

    // Close all connections
    for (const conn of connections) {
      conn.end();
    }

    server.close(() => {
      cleanupSocket(session);
      resolve();
    });
  });
}
