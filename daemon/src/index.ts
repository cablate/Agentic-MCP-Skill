/**
 * MCP Progressive Client - Progressive disclosure MCP client
 *
 * Supports three-layer progressive disclosure:
 * 1. Metadata layer: returns only MCP server information
 * 2. Tool list layer: returns tool names and descriptions
 * 3. Tool Schema layer: returns complete schema for specific tool
 *
 * Supports three transport methods:
 * - stdio: Standard input/output
 * - http-streamable: HTTP streaming
 * - sse: Server-Sent Events
 *
 * @version 0.1.0
 * @author CabLate
 */

export { ProgressiveMCPClient, createClient } from './client.js';

export { TransportType } from './types/index.js';

export type {
  // Core types
  MCPServerConfig,
  MCPServerMetadata,
  MCPToolInfo,
  MCPToolSchema,
  MCPToolCallParams,
  MCPToolCallResult,

  // JSON-RPC types
  JSONRPCRequest,
  JSONRPCResponse,
  MCPInitializeResult,
  MCPToolsListResult
} from './types/index.js';

export {
  // Transport implementations
  StdioTransport,
  HttpStreamableTransport,
  SseTransport
} from './transports/index.js';

// Export base class for extension
export { BaseTransport } from './transports/index.js';

export type {
  StdioTransportConfig,
  HttpStreamableTransportConfig,
  SseTransportConfig
} from './transports/index.js';
