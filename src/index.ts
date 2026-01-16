/**
 * MCP Progressive Client - Progressive disclosure MCP client
 *
 * This is a wrapper around the official @modelcontextprotocol/sdk that provides
 * three-layer progressive disclosure to minimize initial data transfer.
 *
 * Three-layer disclosure:
 * 1. Metadata layer: returns only MCP server information
 * 2. Tool list layer: returns tool names and descriptions
 * 3. Tool Schema layer: returns complete schema for specific tool
 *
 * @version 0.2.0
 * @author CabLate
 */

// Core client (MCP Server connection)
export { ProgressiveMCPClient, createClient } from './client.js';

// Socket client (CLI → Daemon connection)
export { SocketClient, sendCommand, isDaemonRunning } from './socket-client.js';

// Daemon (long-running process)
export { MCPDaemon } from './daemon.js';

// Socket utilities
export {
  getConnectionInfo,
  isDaemonRunning as isDaemonRunningSocket,
  cleanupSocket,
  getCurrentSession
} from './socket.js';

export { TransportType } from './types.js';

export type {
  // Core types
  MCPServerConfig,
  MCPServerMetadata,
  MCPToolInfo,
  MCPToolSchema,
  MCPToolCallResult
} from './types.js';

// Socket client types
export type { SocketCommand, SocketResponse, SocketClientOptions } from './socket-client.js';

// Daemon config type
export type { DaemonConfig } from './daemon.js';

// Re-export official SDK transports for convenience
export { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
export { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
export { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
export type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
