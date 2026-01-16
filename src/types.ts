/**
 * MCP Progressive Client type definitions
 *
 * 使用 Claude Code 標準格式：
 * https://code.claude.com/docs/en/mcp
 */

/**
 * Transport type (使用 Claude Code 標準值)
 */
export enum TransportType {
  STDIO = "stdio",
  HTTP = "http",
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
 * MCP server configuration (Claude Code 標準格式)
 *
 * 標準欄位對應：
 * - type: "stdio" | "http" | "sse"
 * - url: HTTP/SSE endpoint URL
 * - headers: 自定義 HTTP headers
 * - command: stdio 執行命令
 * - args: stdio 命令參數
 * - env: 環境變數
 */
export interface MCPServerConfig {
  /** Transport type (stdio, http, sse) */
  type?: TransportType | string;
  /** HTTP/SSE endpoint URL */
  url?: string;
  /** Custom request headers (for http/sse) */
  headers?: Record<string, string>;
  /** Command to execute (for stdio) */
  command?: string;
  /** Command arguments (for stdio) */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Server description (optional, for AI context) */
  description?: string;
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
