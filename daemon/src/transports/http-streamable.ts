/**
 * HTTP Streamable Transport Implementation
 * Communicates with MCP server via HTTP streaming
 */

import { BaseTransport } from './base.js';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult
} from '../types/index.js';

/**
 * HTTP Streamable transport configuration
 */
export interface HttpStreamableTransportConfig {
  /** Server URL */
  url: string;
  /** Request timeout (milliseconds) */
  timeout?: number;
  /** Custom request headers */
  headers?: Record<string, string>;
}

/**
 * HTTP Streamable transport implementation
 */
export class HttpStreamableTransport extends BaseTransport {
  private config: HttpStreamableTransportConfig;
  private requestId: number = 0;
  private _isConnected: boolean = false;

  constructor(config: HttpStreamableTransportConfig) {
    super();
    this.config = {
      timeout: 30000,
      ...config
    };
  }

  async connect(): Promise<void> {
    // HTTP connection is immediate, real connection established on first request
    this._isConnected = true;
  }

  async disconnect(): Promise<void> {
    this._isConnected = false;
  }

  async sendRequest<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this._isConnected) {
      throw new Error('Not connected to server');
    }

    const id = ++this.requestId;
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    try {
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(this.config.timeout!)
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const jsonResponse = await response.json() as JSONRPCResponse<T>;

      if (jsonResponse.error) {
        throw new Error(`RPC error ${jsonResponse.error.code}: ${jsonResponse.error.message}`);
      }

      return jsonResponse.result as T;
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new Error('Network connection failed, please check server URL');
      }
      throw error;
    }
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
    return this._isConnected;
  }
}
