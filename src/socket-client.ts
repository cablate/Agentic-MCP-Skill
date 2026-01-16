/**
 * MCP Socket Client - Connect to MCP Daemon via Socket
 *
 * Provides a simple client for CLI commands to communicate with the MCP Daemon
 * using Unix domain sockets (Linux/Mac) or TCP sockets (Windows).
 *
 * Protocol: newline-delimited JSON
 * - Command: {"id":"1","action":"metadata","server":"context7"}
 * - Response: {"id":"1","success":true,"data":{...}}
 */

import * as net from 'net';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

// Platform detection
const isWindows = process.platform === 'win32';

// Default session name
const DEFAULT_SESSION = 'default';

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
 * Get the socket path for the session (Unix) or port (Windows)
 */
function getSocketPath(session: string): string {
  if (isWindows) {
    return String(getPortForSession(session));
  }
  return path.join(os.tmpdir(), `mcp-daemon-${session}.sock`);
}

/**
 * Get the PID file path for the session
 */
function getPidFile(session: string): string {
  return path.join(os.tmpdir(), `mcp-daemon-${session}.pid`);
}

/**
 * Check if daemon is running
 */
export async function isDaemonRunning(session: string = DEFAULT_SESSION): Promise<boolean> {
  const pidFile = getPidFile(session);

  try {
    await fs.access(pidFile);

    // Check if PID file exists and process is running
    const pid = parseInt(await fs.readFile(pidFile, 'utf8'), 10);

    // Try to signal the process (works on both Unix and Windows)
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Command interface
 */
export interface SocketCommand {
  id: string;
  action: string;
  server?: string;
  tool?: string;
  arguments?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Response interface
 */
export interface SocketResponse<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Socket Client options
 */
export interface SocketClientOptions {
  session?: string;
  timeout?: number;
}

/**
 * MCP Socket Client class
 *
 * Connects to MCP Daemon via socket and sends commands
 */
export class SocketClient {
  private session: string;
  private socket: net.Socket | null = null;
  private connected: boolean = false;
  private timeout: number;
  private pendingRequests: Map<string, {
    resolve: (value: SocketResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private requestId = 0;

  constructor(options: SocketClientOptions = {}) {
    this.session = options.session || DEFAULT_SESSION;
    this.timeout = options.timeout || 30000; // 30 seconds default
  }

  /**
   * Connect to daemon
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      const socketPath = getSocketPath(this.session);

      if (isWindows) {
        // Windows: use TCP socket
        const port = parseInt(socketPath, 10);
        this.socket = net.createConnection(port, '127.0.0.1');
      } else {
        // Unix: use Unix domain socket
        this.socket = net.createConnection(socketPath);
      }

      this.socket.on('connect', () => {
        this.connected = true;
        this.setupSocket();
        resolve();
      });

      this.socket.on('error', (err) => {
        this.connected = false;
        reject(new Error(`Failed to connect to daemon: ${err.message}`));
      });

      // Connection timeout
      setTimeout(() => {
        if (!this.connected) {
          this.socket?.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  /**
   * Setup socket event handlers
   */
  private setupSocket(): void {
    if (!this.socket) return;

    let buffer = '';

    this.socket.on('data', (data: Buffer) => {
      buffer += data.toString();

      // Process complete lines (newline-delimited JSON)
      while (buffer.includes('\n')) {
        const newlineIdx = buffer.indexOf('\n');
        const line = buffer.substring(0, newlineIdx);
        buffer = buffer.substring(newlineIdx + 1);

        if (!line.trim()) continue;

        try {
          const response = JSON.parse(line) as SocketResponse;
          this.handleResponse(response);
        } catch (err) {
          // Invalid JSON, ignore
        }
      }
    });

    this.socket.on('close', () => {
      this.connected = false;
      // Reject all pending requests
      for (const pending of this.pendingRequests.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('Connection closed'));
      }
      this.pendingRequests.clear();
    });

    this.socket.on('error', () => {
      this.connected = false;
    });
  }

  /**
   * Handle incoming response
   */
  private handleResponse(response: SocketResponse): void {
    const pending = this.pendingRequests.get(response.id);

    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRequests.delete(response.id);
      pending.resolve(response);
    }
  }

  /**
   * Send command and wait for response
   */
  async send<T = unknown>(command: Omit<SocketCommand, 'id'>): Promise<SocketResponse<T>> {
    if (!this.connected || !this.socket) {
      await this.connect();
    }

    const id = String(++this.requestId);
    const fullCommand: SocketCommand = { ...command, id } as SocketCommand;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, this.timeout);

      this.pendingRequests.set(id, { resolve, reject, timer } as any);

      this.socket!.write(JSON.stringify(fullCommand) + '\n', (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Disconnect from daemon
   */
  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.connected = false;
    this.pendingRequests.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Quick helper for one-shot commands
 */
export async function sendCommand<T = unknown>(
  command: Omit<SocketCommand, 'id'>,
  options?: SocketClientOptions
): Promise<SocketResponse<T>> {
  const client = new SocketClient(options);
  try {
    const response = await client.send<T>(command);
    return response;
  } finally {
    await client.disconnect();
  }
}
