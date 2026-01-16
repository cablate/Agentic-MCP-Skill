/**
 * MCP Progressive Client - Progressive disclosure MCP client main class
 *
 * This is a wrapper around the official @modelcontextprotocol/sdk Client
 * that provides three-layer progressive disclosure:
 * 1. Metadata layer: getMetadata() - returns only server information
 * 2. Tool list layer: listTools() - returns tool names and descriptions
 * 3. Tool Schema layer: getToolSchema() - returns complete schema for specific tool
 *
 * The key difference from the official SDK is that we control WHEN to fetch
 * data, allowing progressive disclosure to minimize initial data transfer.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type {
  MCPServerConfig,
  MCPServerMetadata,
  MCPToolInfo,
  MCPToolSchema,
  MCPToolCallResult
} from './types.js';

/**
 * MCP Progressive Client class
 *
 * Wraps the official SDK Client to provide three-layer progressive disclosure
 */
export class ProgressiveMCPClient {
  private client: Client;
  private transport: Transport | null = null;
  private config: MCPServerConfig;
  private _metadata: MCPServerMetadata | null = null;
  private _toolsCache: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> = [];

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.client = new Client(
      {
        name: 'agentic-mcp',
        version: '0.2.0'
      },
      {
        capabilities: {}
      }
    );
  }

  /**
   * Create transport instance using official SDK
   * 直接使用標準配置格式 (type: "stdio" | "http" | "sse")
   */
  private createTransport(): Transport {
    // 使用標準 type 欄位，自動推斷如果未指定
    let type = this.config.type?.toLowerCase();

    if (!type) {
      // 自動推斷：根據配置欄位判斷 transport type
      if (this.config.command) {
        type = 'stdio';
      } else if (this.config.url) {
        // 有 headers 且有 url → http，否則 → sse
        type = this.config.headers ? 'http' : 'sse';
      } else {
        throw new Error('Cannot infer transport type: please specify type, url, or command');
      }
    }

    switch (type) {
      case 'stdio':
        if (!this.config.command) {
          throw new Error('stdio transport requires command parameter');
        }
        return new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env
        });

      case 'http':
        if (!this.config.url) {
          throw new Error('http transport requires url parameter');
        }
        return new StreamableHTTPClientTransport(
          new URL(this.config.url),
          {
            requestInit: {
              headers: this.config.headers
            }
          }
        );

      case 'sse':
        if (!this.config.url) {
          throw new Error('sse transport requires url parameter');
        }
        return new SSEClientTransport(
          new URL(this.config.url),
          {
            requestInit: {
              headers: this.config.headers
            }
          }
        );

      default:
        throw new Error(`Unsupported transport type: ${type}. Supported types: stdio, http, sse`);
    }
  }

  /**
   * Connect to MCP server
   */
  async connect(): Promise<void> {
    if (this.transport) {
      return; // Already connected
    }

    this.transport = this.createTransport();
    await this.client.connect(this.transport);

    // Extract metadata from official SDK client
    const serverVersion = this.client.getServerVersion();
    const serverCapabilities = this.client.getServerCapabilities();

    this._metadata = {
      name: serverVersion?.name ?? 'unknown',
      version: serverVersion?.version ?? '0.0.0',
      capabilities: serverCapabilities ?? {}
    };

    // Use custom description from config if provided
    if (this.config.description) {
      this._metadata.description = this.config.description;
    }

    // Cache complete tool list (internal use) using official SDK
    const toolsResponse = await this.client.listTools();
    this._toolsCache = toolsResponse.tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  /**
   * Disconnect
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    this._metadata = null;
    this._toolsCache = [];
  }

  /**
   * Check connection status
   */
  isConnected(): boolean {
    return this.transport !== null;
  }

  /**
   * Get cached metadata (for internal use by daemon)
   */
  getCachedMetadata(): MCPServerMetadata | null {
    return this._metadata;
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

  // ========== Generic Request (for daemon use) ==========

  /**
   * Send generic JSON-RPC request through official SDK
   * This method is used by the daemon to forward arbitrary MCP requests
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

    // Directly use transport for generic requests (daemon use)
    // This allows forwarding arbitrary MCP methods without schema validation
    return new Promise<T>((resolve, reject) => {
      const requestId = Date.now() + Math.random();
      const request = {
        jsonrpc: '2.0' as const,
        id: requestId,
        method,
        params
      };

      // Set up one-time message handler
      const originalOnMessage = this.transport!.onmessage;
      this.transport!.onmessage = (message: any) => {
        if (message.id === requestId) {
          this.transport!.onmessage = originalOnMessage;
          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result as T);
          }
        }
      };

      // Send the request
      this.transport!.send(request).catch((err) => {
        this.transport!.onmessage = originalOnMessage;
        reject(err);
      });
    });
  }

  // ========== Tool Call ==========

  /**
   * Call MCP tool using official SDK
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

    const result = await this.client.callTool({
      name: toolName,
      arguments: args
    });

    return result as MCPToolCallResult;
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
 * @param config - Server configuration (使用 Claude Code 標準格式)
 * @returns Connected ProgressiveMCPClient instance
 */
export async function createClient(config: MCPServerConfig): Promise<ProgressiveMCPClient> {
  const client = new ProgressiveMCPClient(config);
  await client.connect();
  return client;
}
