/**
 * MCP Progressive Client type definitions
 */

/**
 * Transport type enum
 */
export enum TransportType {
  STDIO = "stdio",
  HTTP_STREAMABLE = "http-streamable",
  SSE = "sse"
}

/**
 * MCP server metadata (Layer 1)
 */
export interface MCPServerMetadata {
  name: string;
  version: string;
  description?: string;
  capabilities?: Record<string, unknown>;
}

/**
 * MCP tool info (Layer 2) - without schema
 */
export interface MCPToolInfo {
  name: string;
  description: string;
}

/**
 * MCP tool schema (Layer 3)
 */
export interface MCPToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  /** Transport type */
  transportType: TransportType | string;
  /** Command (for stdio) */
  command?: string;
  /** Argument list */
  args?: string[];
  /** URL (for http/sse) */
  url?: string;
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * JSON-RPC request
 */
export interface JSONRPCRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC response
 */
export interface JSONRPCResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP initialization result
 */
export interface MCPInitializeResult {
  protocolVersion: string;
  serverInfo: {
    name: string;
    version: string;
  };
  capabilities: Record<string, unknown>;
}

/**
 * MCP tools list response
 */
export interface MCPToolsListResult {
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
}

/**
 * MCP tool call parameters
 */
export interface MCPToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP tool call result
 */
export interface MCPToolCallResult {
  content: Array<{
    type: string;
    text?: string;
    data?: unknown;
  }>;
  isError?: boolean;
}
