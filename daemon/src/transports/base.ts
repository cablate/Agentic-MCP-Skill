/**
 * Transport abstract base class
 * All transport types (stdio, http-streamable, sse) must implement this interface
 */

import type {
  MCPInitializeResult
} from '../types/index.js';

export abstract class BaseTransport {
  /**
   * Establish connection
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect
   */
  abstract disconnect(): Promise<void>;

  /**
   * Send JSON-RPC request
   */
  abstract sendRequest<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T>;

  /**
   * Initialize MCP session
   */
  abstract initialize(): Promise<MCPInitializeResult>;

  /**
   * Check connection status
   */
  abstract isConnected(): boolean;
}
