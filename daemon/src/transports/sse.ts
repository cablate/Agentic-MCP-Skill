/**
 * SSE (Server-Sent Events) Transport Implementation
 * Communicates with MCP server via SSE
 */

import { BaseTransport } from './base.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult
} from '../types/index.js';

/**
 * SSE transport configuration
 */
export interface SseTransportConfig {
  /** Server URL */
  url: string;
  /** Request timeout (milliseconds) */
  timeout?: number;
  /** Custom request headers */
  headers?: Record<string, string>;
  /** Reconnection interval (milliseconds) */
  reconnectInterval?: number;
}

/**
 * SSE transport implementation
 */
export class SseTransport extends BaseTransport {
  private config: SseTransportConfig;
  private requestId: number = 0;
  private eventSource: EventSource | null = null;
  private pendingRequests: Map<number | string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(config: SseTransportConfig) {
    super();
    this.config = {
      timeout: 30000,
      reconnectInterval: 1000,
      ...config
    };
  }

  async connect(): Promise<void> {
    if (this.eventSource) {
      return; // Already connected
    }

    return new Promise((resolve, reject) => {
      try {
        // Create EventSource connection
        this.eventSource = new EventSource(this.config.url);

        // Listen for messages
        this.eventSource.onmessage = (event) => {
          try {
            const response: JSONRPCResponse = JSON.parse(event.data);
            this.handleResponse(response);
          } catch (error) {
            console.error('Failed to parse SSE message:', error);
          }
        };

        // Listen for errors
        this.eventSource.onerror = (error) => {
          console.error('SSE connection error:', error);
          // SSE auto-reconnects, don't reject here
        };

        // Listen for open event
        this.eventSource.onopen = () => {
          resolve();
        };

        // Set timeout
        setTimeout(() => {
          if (this.eventSource?.readyState !== EventSource.OPEN) {
            reject(new Error('SSE connection timeout'));
          }
        }, this.config.timeout!);
      } catch (error) {
        reject(error);
      }
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
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.pendingRequests.clear();
  }

  async sendRequest<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.eventSource || this.eventSource.readyState !== EventSource.OPEN) {
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
        // SSE uses POST request to send data
        fetch(this.config.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.config.headers
          },
          body: JSON.stringify(request)
        }).catch(reject);

        // Set timeout
        setTimeout(() => {
          if (this.pendingRequests.has(id)) {
            this.pendingRequests.delete(id);
            reject(new Error('Request timeout'));
          }
        }, this.config.timeout!);
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
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}
