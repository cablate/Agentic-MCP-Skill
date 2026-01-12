/**
 * Stdio Transport Implementation
 * Communicates with MCP server via standard input/output
 */

import { spawn, ChildProcess } from 'child_process';
import { Readable } from 'stream';
import { BaseTransport } from './base.js';
import type {
  MCPServerConfig,
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult
} from '../types/index.js';

/**
 * Stdio transport configuration
 */
export interface StdioTransportConfig {
  /** Command (e.g., python, node) */
  command: string;
  /** Argument list */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Stdio transport implementation
 */
export class StdioTransport extends BaseTransport {
  private process: ChildProcess | null = null;
  private config: StdioTransportConfig;
  private requestId: number = 0;
  private pendingRequests: Map<number | string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(config: StdioTransportConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    if (this.process) {
      return; // Already connected
    }

    return new Promise((resolve, reject) => {
      try {
        // Windows compatibility: handle .cmd extension
        let command = this.config.command;
        const isWindows = process.platform === 'win32';

        // For npx/pnpm/yarn etc., add .cmd on Windows
        if (isWindows && ['npx', 'pnpm', 'yarn', 'npm'].includes(command)) {
          command += '.cmd';
        }

        // Start child process
        this.process = spawn(command, this.config.args || [], {
          env: { ...process.env, ...this.config.env },
          stdio: ['pipe', 'pipe', 'inherit'],
          shell: isWindows // Use shell on Windows
        });

        // Set up error handling
        this.process.on('error', (error) => {
          reject(new Error(`Process start failed: ${error.message}`));
        });

        this.process.on('exit', (code, signal) => {
          if (code !== 0 && code !== null) {
            console.warn(`Process abnormal exit: code=${code}, signal=${signal}`);
          }
          // Clear all pending requests
          for (const [_, pending] of this.pendingRequests) {
            pending.reject(new Error('Process disconnected'));
          }
          this.pendingRequests.clear();
        });

        // Set up stdout handling
        if (this.process.stdout) {
          this.handleStdout(this.process.stdout);
        }

        // Wait briefly to ensure process started
        setTimeout(() => resolve(), 100);
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleStdout(stdout: Readable): void {
    let buffer = '';

    stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const response: JSONRPCResponse = JSON.parse(line);
          this.handleResponse(response);
        } catch (error) {
          console.error('Failed to parse response:', error, line);
        }
      }
    });

    stdout.on('error', (error) => {
      console.error('stdout error:', error);
    });
  }

  private handleResponse(response: JSONRPCResponse): void {
    const pending = this.pendingRequests.get(response.id);

    if (!pending) {
      console.warn('Received response for unknown request:', response.id);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(`RPC error ${response.error.code}: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      // Windows compatibility: Windows doesn't support SIGTERM
      if (process.platform === 'win32') {
        this.process.kill(); // Windows: default forced termination
      } else {
        this.process.kill('SIGTERM');
      }

      // Wait for process exit, but set timeout to prevent hanging
      const timeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          console.warn(`Process did not exit within 2 seconds, force kill`);
          this.process.kill('SIGKILL');
        }
      }, 2000);

      this.process.once('exit', () => clearTimeout(timeout));

      // Clear reference immediately, don't wait for exit event
      this.process = null;
    }
    this.pendingRequests.clear();
  }

  async sendRequest<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Not connected to server');
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      try {
        this.process!.stdin!.write(JSON.stringify(request) + '\n');
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  async initialize(): Promise<MCPInitializeResult> {
    const result = await this.sendRequest<MCPInitializeResult>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'mcp-progressive-client',
        version: '0.1.0'
      }
    });

    return result;
  }

  isConnected(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
