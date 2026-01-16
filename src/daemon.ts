/**
 * MCP Daemon - Long-running MCP proxy server
 *
 * Responsibilities:
 * - Maintain persistent connections to MCP Servers
 * - Accept socket commands from CLI (agent-browser style protocol)
 * - Manage multiple client sessions
 * - Forward commands to MCP Servers using three-layer API
 *
 * Socket Protocol (newline-delimited JSON):
 * - Command: {"id":"1","action":"metadata","server":"context7"}
 * - Response: {"id":"1","success":true,"data":{...}}
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ProgressiveMCPClient } from './client.js';
import { TransportType } from './types.js';
import type { MCPServerConfig } from './types.js';
import * as net from 'net';
import {
  getConnectionInfo,
  isDaemonRunning,
  cleanupSocket,
  writePidFile,
  createSocketServer,
  startListening,
  closeServer,
  getCurrentSession
} from './socket.js';

interface ConnectRequest {
  server: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

interface SessionInfo {
  id: string;
  server: string;
  client: ProgressiveMCPClient;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface DaemonConfig {
  servers?: string[];
  configPath?: string;
  session?: string;      // Session name for socket
}

/**
 * MCP Daemon class
 */
export class MCPDaemon {
  private socketServer?: net.Server;
  private sessions: Map<string, SessionInfo> = new Map();
  private predefinedServers: string[];
  private serverConfigs: Record<string, Omit<MCPServerConfig, 'env'>> = {};
  private session: string;
  private configPath?: string;

  constructor(config: DaemonConfig) {
    this.predefinedServers = config.servers || ['playwright'];
    this.session = config.session || getCurrentSession();
    this.configPath = config.configPath;

    this.loadServerConfigs(this.configPath);

    // Always use socket (like agent-browser)
    this.socketServer = createSocketServer((socket) => {
      this.handleSocketConnection(socket).catch((err) => {
        console.error('Socket connection error:', err);
      });
    }, this.session);
  }

  /**
   * Handle socket connection
   */
  private async handleSocketConnection(socket: net.Socket): Promise<void> {
    let buffer = '';

    socket.on('data', async (data) => {
      buffer += data.toString();

      // Process complete lines (newline-delimited JSON)
      while (buffer.includes('\n')) {
        const newlineIdx = buffer.indexOf('\n');
        const line = buffer.substring(0, newlineIdx);
        buffer = buffer.substring(newlineIdx + 1);

        if (!line.trim()) continue;

        let request;
        try {
          request = JSON.parse(line);
          const response = await this.handleSocketRequest(request);
          socket.write(JSON.stringify(response) + '\n');
        } catch (err) {
          const errorResponse = {
            id: request?.id || null,
            success: false,
            error: err instanceof Error ? err.message : String(err)
          };
          socket.write(JSON.stringify(errorResponse) + '\n');
        }
      }
    });

    socket.on('error', () => {
      // Client disconnected, ignore
    });
  }

  /**
   * Handle socket request (agent-browser style protocol)
   *
   * Command format: {"id":"1","action":"metadata","server":"context7"}
   * Response format: {"id":"1","success":true,"data":{...}}
   */
  private async handleSocketRequest(request: any): Promise<any> {
    const { id, action, server, tool, arguments: toolArgs } = request;

    // Special actions that don't require a server (daemon-level operations)
    if (action === 'ping') {
      return {
        id,
        success: true,
        data: {
          status: 'ok',
          session: this.session,
          servers: Array.from(this.sessions.keys())
        }
      };
    }

    if (action === 'reload') {
      // Reload server configurations
      this.loadServerConfigs(this.configPath);
      const reconnected = await this.reconnectServers();
      return {
        id,
        success: true,
        data: {
          message: 'Configuration reloaded',
          reconnected
        }
      };
    }

    if (action === 'shutdown') {
      // Gracefully shutdown the daemon
      await this.stop();
      return { id, success: true, data: { message: 'Daemon shutdown' } };
    }

    // Get session for this server (required for server-specific actions)
    const sessionId = server;
    const session = this.sessions.get(sessionId);

    if (!session) {
      return {
        id,
        success: false,
        error: `Server '${server}' not found or not connected`
      };
    }

    session.lastActivityAt = new Date();

    // Route by action
    switch (action) {
      case 'metadata':
        const metadata = session.client.getCachedMetadata();
        if (!metadata) {
          return { id, success: false, error: 'Metadata not available' };
        }
        return { id, success: true, data: metadata };

      case 'list':
        const tools = await session.client.listTools();
        return { id, success: true, data: { tools } };

      case 'schema':
        if (!tool) {
          return { id, success: false, error: 'Tool name is required for schema' };
        }
        // 使用 getToolSchema 獲取完整 schema（包含 inputSchema）
        try {
          const toolSchema = await session.client.getToolSchema(tool);
          return { id, success: true, data: toolSchema };
        } catch (error) {
          return { id, success: false, error: `Tool '${tool}' not found` };
        }

      case 'call':
        if (!tool) {
          return { id, success: false, error: 'Tool name is required for call' };
        }
        const result = await session.client.callTool(tool, toolArgs || {});
        return { id, success: true, data: result };

      case 'health':
        return {
          id,
          success: true,
          data: {
            status: 'healthy',
            server,
            connectedAt: session.createdAt.toISOString(),
            uptime: Math.floor((Date.now() - session.createdAt.getTime()) / 1000)
          }
        };

      case 'sessions':
        const sessions = Array.from(this.sessions.values()).map(s => ({
          id: s.id,
          server: s.server,
          createdAt: s.createdAt.toISOString(),
          uptime: Math.floor((Date.now() - s.createdAt.getTime()) / 1000)
        }));
        return { id, success: true, data: { sessions } };

      default:
        return { id, success: false, error: `Unknown action: ${action}` };
    }
  }

  /**
   * Load MCP servers configuration file
   */
  private loadServerConfigs(configPath?: string): void {
    const defaultPaths = [
      process.env.MCP_DAEMON_CONFIG,  // Environment variable (highest priority)
      configPath,                        // Passed config path
      join(process.cwd(), 'mcp-servers.json'),
      join(process.cwd(), 'config', 'mcp-servers.json'),
    ];

    const configFilePath = defaultPaths.find(p => p && existsSync(p));

    if (configFilePath) {
      try {
        const configContent = readFileSync(configFilePath, 'utf-8');
        const config = JSON.parse(configContent);

        if (config.servers && typeof config.servers === 'object') {
          this.serverConfigs = config.servers;
          console.log(`Loaded MCP servers config: ${configFilePath}`);
          console.log(`Available servers: ${Object.keys(this.serverConfigs).join(', ')}`);
        } else {
          throw new Error('Invalid config format: missing "servers" object');
        }
      } catch (error) {
        console.error(`Failed to load config file:`, error);
        throw new Error(`Cannot load MCP servers config: ${(error as Error).message}`);
      }
    } else {
      console.warn('mcp-servers.json not found, using builtin default');
      this.serverConfigs = {
        'playwright': {
          type: TransportType.STDIO,
          command: 'npx',
          args: ['@playwright/mcp@latest', '--isolated']
        }
      };
    }
  }

  /**
   * Preconnect to MCP Servers
   * Connects to all servers defined in mcp-servers.json
   */
  private async preconnectServers(): Promise<void> {
    // Use all servers from config if available, otherwise fall back to predefinedServers
    const serversToConnect = Object.keys(this.serverConfigs).length > 0
      ? Object.keys(this.serverConfigs)
      : this.predefinedServers;

    for (const serverName of serversToConnect) {
      try {
        const config = this.getServerConfig({ server: serverName });
        const client = new ProgressiveMCPClient(config);
        await client.connect();

        const sessionId = serverName;
        this.sessions.set(sessionId, {
          id: sessionId,
          server: serverName,
          client,
          createdAt: new Date(),
          lastActivityAt: new Date()
        });
        console.log(`${serverName} preconnected (Session: ${sessionId})`);
      } catch (error) {
        console.error(`${serverName} preconnect failed:`, error);
      }
    }
  }

  /**
   * Reconnect to MCP Servers (for reload)
   * Reconnects to all servers after config reload
   */
  private async reconnectServers(): Promise<string[]> {
    const reconnected: string[] = [];
    const currentServers = Object.keys(this.serverConfigs);

    for (const serverName of currentServers) {
      const sessionId = serverName;
      const existing = this.sessions.get(sessionId);

      // Disconnect existing session if any
      if (existing) {
        await existing.client.disconnect();
        this.sessions.delete(sessionId);
      }

      // Reconnect
      try {
        const config = this.getServerConfig({ server: serverName });
        const client = new ProgressiveMCPClient(config);
        await client.connect();

        this.sessions.set(sessionId, {
          id: sessionId,
          server: serverName,
          client,
          createdAt: new Date(),
          lastActivityAt: new Date()
        });
        reconnected.push(serverName);
        console.log(`${serverName} reconnected (Session: ${sessionId})`);
      } catch (error) {
        console.error(`${serverName} reconnect failed:`, error);
      }
    }

    return reconnected;
  }

  /**
   * Get MCP Server configuration
   */
  private getServerConfig(request: ConnectRequest): MCPServerConfig {
    const baseConfig = this.serverConfigs[request.server];

    if (!baseConfig) {
      const availableServers = Object.keys(this.serverConfigs).join(', ');
      throw new Error(
        `Unknown MCP server: ${request.server}\n` +
        `Available servers: ${availableServers || '(none)'}`
      );
    }

    return {
      ...baseConfig,
      env: request.env
    };
  }

  /**
   * Cleanup idle sessions (periodic task)
   * Removes dynamic sessions that have been inactive for >30 minutes
   * Global sessions are never auto-cleaned
   */
  private cleanupIdleSessions(): void {
    const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      // Skip preconnected server sessions (server config exists)
      if (this.serverConfigs[session.server]) {
        continue;
      }

      const idleTime = now - session.lastActivityAt.getTime();

      if (idleTime > IDLE_TIMEOUT) {
        console.log(`Cleaning up idle session: ${sessionId} (idle for ${Math.floor(idleTime / 1000 / 60)} minutes)`);
        session.client.disconnect().catch((err) => {
          console.error(`Error disconnecting session ${sessionId}:`, err);
        });
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} idle session(s)`);
    }
  }

  /**
   * Start session cleanup timer
   * Runs every 5 minutes to clean up idle sessions
   */
  private startSessionCleanupTimer(): NodeJS.Timeout {
    // Run cleanup every 5 minutes
    return setInterval(() => {
      this.cleanupIdleSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Start Daemon
   */
  async start(): Promise<void> {
    // Clean up any stale socket files
    cleanupSocket(this.session);

    console.log('Preconnecting MCP Servers...');
    await this.preconnectServers();

    // Start session cleanup timer
    this.startSessionCleanupTimer();
    console.log('Session cleanup timer started (runs every 5 minutes)');

    // Write PID file for health checking
    writePidFile(this.session);

    return new Promise((resolve, reject) => {
      startListening(this.socketServer!, this.session, () => {
        const connInfo = getConnectionInfo(this.session);
        if (connInfo.type === 'tcp') {
          console.log(`\nMCP Daemon running on TCP port ${connInfo.port}`);
        } else {
          console.log(`\nMCP Daemon running on socket ${connInfo.path}`);
        }
        console.log(`Session: ${this.session}`);
        console.log(`\nSocket Protocol (newline-delimited JSON):`);
        console.log(`  {"id":"1","action":"metadata","server":"context7"}`);
        console.log(`  {"id":"2","action":"list","server":"context7"}`);
        console.log(`  {"id":"3","action":"call","server":"context7","tool":"query-docs","arguments":{...}}`);
        console.log(`  {"id":"4","action":"health","server":"context7"}`);
        console.log();

        resolve();
      });

      this.socketServer!.on('error', (error: Error) => {
        console.error('Daemon start failed:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop Daemon
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      const disconnectPromises = Array.from(this.sessions.values()).map(async (session) => {
        await session.client.disconnect();
      });

      Promise.all(disconnectPromises).finally(() => {
        closeServer(this.socketServer!, this.session).then(() => {
          cleanupSocket(this.session);
          console.log('MCP Daemon stopped');
          resolve();
        });
      });
    });
  }
}

// Run daemon if this is the entry point
if (process.argv[1]?.endsWith('daemon.js') || process.env.MCP_DAEMON === '1') {
  const session = process.env.MCP_DAEMON_SESSION || 'default';

  const daemon = new MCPDaemon({
    session
  });

  console.log('Starting MCP Daemon (Socket mode)...');

  daemon.start()
    .then(() => {
      console.log('Daemon started successfully');
    })
    .catch((error) => {
      console.error('Daemon start failed:', error);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nStopping MCP Daemon...');
    await daemon.stop();
    process.exit(0);
  });
}
