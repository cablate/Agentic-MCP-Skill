/**
 * MCP Progressive Client - Progressive disclosure MCP client main class
 *
 * Supports three-layer data disclosure:
 * 1. Metadata layer: getMetadata() - returns only server information
 * 2. Tool list layer: listTools() - returns tool names and descriptions
 * 3. Tool Schema layer: getToolSchema() - returns complete schema for specific tool
 *
 * Supports three transport methods:
 * - stdio: Standard input/output (local process)
 * - http-streamable: HTTP streaming
 * - sse: Server-Sent Events
 */

import { TransportType } from './types/index.js';
import type {
  MCPServerConfig,
  MCPServerMetadata,
  MCPToolInfo,
  MCPToolSchema,
  MCPToolCallParams,
  MCPToolCallResult
} from './types/index.js';

import {
  BaseTransport,
  StdioTransport,
  HttpStreamableTransport,
  SseTransport
} from './transports/index.js';

/**
 * MCP Progressive Client class
 */
export class ProgressiveMCPClient {
  private transport: BaseTransport | null = null;
  private config: MCPServerConfig;
  private _metadata: MCPServerMetadata | null = null;
  private _toolsCache: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> = [];

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  /**
   * Create transport instance
   */
  private createTransport(): BaseTransport {
    const transportType =
      typeof this.config.transportType === 'string'
        ? (this.config.transportType as TransportType)
        : this.config.transportType;

    switch (transportType) {
      case TransportType.STDIO:
        if (!this.config.command) {
          throw new Error('stdio transport requires command parameter');
        }
        return new StdioTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env
        });

      case TransportType.HTTP_STREAMABLE:
        if (!this.config.url) {
          throw new Error('http-streamable transport requires url parameter');
        }
        return new HttpStreamableTransport({
          url: this.config.url
        });

      case TransportType.SSE:
        if (!this.config.url) {
          throw new Error('sse transport requires url parameter');
        }
        return new SseTransport({
          url: this.config.url
        });

      default:
        throw new Error(`Unsupported transport type: ${transportType}`);
    }
  }

  /**
   * Connect to MCP server
   */
  async connect(): Promise<void> {
    if (this.transport?.isConnected()) {
      return; // Already connected
    }

    this.transport = this.createTransport();
    await this.transport.connect();

    // Initialize session
    const initResult = await this.transport.initialize();

    // Extract metadata
    this._metadata = {
      name: initResult.serverInfo.name,
      version: initResult.serverInfo.version,
      capabilities: initResult.capabilities
    };

    // Cache complete tool list (internal use)
    const toolsResponse = await this.transport.sendRequest<{ tools: unknown[] }>(
      'tools/list',
      {}
    );
    this._toolsCache = (toolsResponse.tools as any) || [];
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.disconnect();
    }
    this._metadata = null;
    this._toolsCache = [];
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.transport?.isConnected() ?? false;
  }

  // ========== Layer 1: Metadata ==========

  /**
   * Layer 1: Get MCP server metadata
   *
   * Returns only server info (name, version, description), without tool list
   */
  async getMetadata(): Promise<MCPServerMetadata> {
    if (!this.isConnected()) {
      throw new Error('Not connected to server, please call connect() first');
    }

    return this._metadata!;
  }

  // ========== Layer 2: Tool List ==========

  /**
   * Layer 2: Get tool list
   *
   * Returns only tool names and descriptions, without inputSchema
   */
  async listTools(): Promise<MCPToolInfo[]> {
    if (!this.isConnected()) {
      throw new Error('Not connected to server, please call connect() first');
    }

    // Return only name and description, filter out inputSchema
    return this._toolsCache.map((tool) => ({
      name: tool.name,
      description: tool.description
    }));
  }

  // ========== Layer 3: Tool Schema ==========

  /**
   * Layer 3: Get complete schema for specific tool
   *
   * @param toolName - Tool name
   * @returns Complete tool schema including inputSchema
   */
  async getToolSchema(toolName: string): Promise<MCPToolSchema> {
    if (!this.isConnected()) {
      throw new Error('Not connected to server, please call connect() first');
    }

    // Find specified tool from cache
    const tool = this._toolsCache.find((t) => t.name === toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    };
  }

  // ========== Generic Request ==========

  /**
   * Send generic JSON-RPC request
   *
   * @param method - MCP method name
   * @param params - Method parameters
   * @returns Server response
   */
  async sendRequest<T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> {
    if (!this.isConnected()) {
      throw new Error('Not connected to server, please call connect() first');
    }

    return this.transport!.sendRequest<T>(method, params);
  }

  // ========== Tool Call ==========

  /**
   * Call MCP tool
   *
   * @param toolName - Tool name
   * @param args - Tool parameters
   * @returns Tool execution result
   */
  async callTool(
    toolName: string,
    args?: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    if (!this.isConnected()) {
      throw new Error('Not connected to server, please call connect() first');
    }

    const params: MCPToolCallParams = {
      name: toolName,
      arguments: args
    };

    return this.transport!.sendRequest<MCPToolCallResult>(
      'tools/call',
      params as any
    );
  }

  // ========== Context Management ==========

  /**
   * Async context manager
   * Allows using `await using` or `async with` syntax
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.disconnect();
  }
}

// ========== Convenience Functions ==========

/**
 * Convenience function to create and connect MCP client
 *
 * @param config - Server configuration
 * @returns Connected ProgressiveMCPClient instance
 */
export async function createClient(config: MCPServerConfig): Promise<ProgressiveMCPClient> {
  const client = new ProgressiveMCPClient(config);
  await client.connect();
  return client;
}
