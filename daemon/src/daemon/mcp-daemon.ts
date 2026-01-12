/**
 * MCP Daemon - Long-running MCP proxy server
 *
 * Responsibilities:
 * - Maintain persistent connections to MCP Servers
 * - Accept HTTP requests and forward to MCP Servers
 * - Manage multiple client sessions
 * - Generic JSON-RPC forwarding
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { ProgressiveMCPClient } from '../client.js';
import { TransportType } from '../types/index.js';
import type { MCPServerConfig } from '../types/index.js';

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

interface DaemonConfig {
  port: number;
  cors?: boolean;
  servers?: string[];
  configPath?: string;
}

/**
 * MCP Daemon class
 */
export class MCPDaemon {
  private server: Server;
  private port: number;
  private sessions: Map<string, SessionInfo> = new Map();
  private cors: boolean;
  private predefinedServers: string[];
  private serverConfigs: Record<string, Omit<MCPServerConfig, 'env'>> = {};

  constructor(config: DaemonConfig) {
    this.port = config.port;
    this.cors = config.cors !== false;
    this.predefinedServers = config.servers || ['playwright'];

    this.loadServerConfigs(config.configPath);

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((err) => {
        console.error('Request handling error:', err);
        this.sendError(res, 500, 'Internal server error');
      });
    });
  }

  /**
   * Load MCP servers configuration file
   */
  private loadServerConfigs(configPath?: string): void {
    const defaultPaths = [
      configPath,
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
          transportType: TransportType.STDIO,
          command: 'npx',
          args: ['@playwright/mcp@latest', '--isolated']
        }
      };
    }
  }

  /**
   * Preconnect to MCP Servers
   */
  private async preconnectServers(): Promise<void> {
    for (const serverName of this.predefinedServers) {
      try {
        const config = this.getServerConfig({ server: serverName });
        const client = new ProgressiveMCPClient(config);
        await client.connect();

        const sessionId = `${serverName}_global`;
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
   * Handle HTTP request
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (this.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
    }

    const url = new URL(req.url || '', `http://${req.headers.host}`);

    try {
      const pathname = url.pathname;

      if (pathname === '/connect' && req.method === 'POST') {
        await this.handleConnect(req, res);
      } else if (pathname === '/call' && req.method === 'POST') {
        await this.handleCall(req, res);
      } else if (pathname === '/request' && req.method === 'POST') {
        await this.handleRequestForward(req, res);
      } else if (pathname === '/disconnect' && req.method === 'DELETE') {
        await this.handleDisconnect(req, res);
      } else if (pathname === '/reload' && req.method === 'POST') {
        await this.handleReload(req, res);
      } else if (pathname === '/shutdown' && req.method === 'POST') {
        await this.handleShutdown(req, res);
      } else if (pathname.startsWith('/sessions/') && req.method === 'DELETE') {
        await this.handleCloseSession(req, res);
      } else if (pathname.match(/\/sessions\/[^/]+\/reconnect/) && req.method === 'POST') {
        await this.handleReconnectSession(req, res);
      } else if (pathname === '/health' && req.method === 'GET') {
        this.handleHealth(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Internal server error',
        message: (error as Error).message
      }));
    }
  }

  /**
   * Send error response
   */
  private sendError(res: ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: statusCode,
        message
      },
      id: null
    }));
  }

  /**
   * Get request body
   */
  private getBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Handle connect request
   * POST /connect
   * Body: {"server": "playwright"}
   *
   * Returns existing global session ID (does not create new connection)
   */
  private async handleConnect(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const request = await this.getBody(req) as ConnectRequest;
      const server = request.server;

      const sessionId = `${server}_global`;
      const session = this.sessions.get(sessionId);

      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          error: `Server '${server}' not preconfigured. Configure at daemon startup.`
        }));
        return;
      }

      session.lastActivityAt = new Date();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        sessionId,
        server,
        connectedAt: session.createdAt.toISOString()
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: (error as Error).message
      }));
    }
  }

  /**
   * Handle tool call request
   * POST /call
   * Body: {"sessionId": "xxx", "method": "tools/call", "params": {...}}
   */
  private async handleCall(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const request = await this.getBody(req);
      const { sessionId, method, params } = request;

      const session = this.sessions.get(sessionId);
      if (!session) {
        this.sendError(res, 404, 'Session not found');
        return;
      }

      session.lastActivityAt = new Date();

      const result = await session.client.sendRequest(method, params);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        result,
        id: null
      }));
    } catch (error) {
      this.sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * Handle generic request forwarding
   * POST /request
   * Body: Full JSON-RPC request
   */
  private async handleRequestForward(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const rpcRequest = await this.getBody(req);
      const sessionId = rpcRequest.sessionId as string | undefined;

      if (sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
          this.sendError(res, 404, 'Session not found');
          return;
        }

        session.lastActivityAt = new Date();

        const result = await session.client.sendRequest(rpcRequest.method, rpcRequest.params);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: rpcRequest.id,
          result
        }));
      } else {
        this.sendError(res, 400, 'sessionId is required for /request endpoint');
      }
    } catch (error) {
      this.sendError(res, 500, (error as Error).message);
    }
  }

  /**
   * Handle disconnect request
   * DELETE /disconnect?sessionId=xxx
   *
   * Note: Global preconnected sessions cannot be disconnected via this endpoint
   * Use DELETE /sessions/{sessionId} to close global sessions
   */
  private async handleDisconnect(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'sessionId is required'
      }));
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Session not found'
      }));
      return;
    }

    if (sessionId.endsWith('_global')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Global session '${sessionId}' must use DELETE /sessions/${sessionId} to close`
      }));
      return;
    }

    await session.client.disconnect();
    this.sessions.delete(sessionId);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      sessionId,
      disconnectedAt: new Date().toISOString()
    }));
  }

  /**
   * Close specific session (including global sessions)
   * DELETE /sessions/:sessionId
   */
  private async handleCloseSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/');
    const sessionId = pathParts[pathParts.length - 1];

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'sessionId is required'
      }));
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Session '${sessionId}' not found`
      }));
      return;
    }

    await session.client.disconnect();
    this.sessions.delete(sessionId);

    const isGlobal = sessionId.endsWith('_global');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      sessionId,
      type: isGlobal ? 'global' : 'dynamic',
      disconnectedAt: new Date().toISOString()
    }));
  }

  /**
   * Reconnect global session
   * POST /sessions/:sessionId/reconnect
   */
  private async handleReconnectSession(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const pathParts = url.pathname.split('/');
    const sessionId = pathParts[pathParts.length - 2];

    if (!sessionId.endsWith('_global')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Only global sessions can be reconnected'
      }));
      return;
    }

    const serverName = sessionId.replace('_global', '');

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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        sessionId,
        server: serverName,
        reconnectedAt: new Date().toISOString()
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: (error as Error).message
      }));
    }
  }

  /**
   * Reload Daemon Configuration
   * POST /reload
   *
   * Reloads MCP servers configuration and reconnects to all servers
   */
  private async handleReload(req: IncomingMessage, res: ServerResponse): Promise<void> {
    console.log('\nReload request received, reloading configuration...');

    try {
      // 1. Get current sessions before closing
      const oldServers = Array.from(this.sessions.keys());

      // 2. Disconnect all current sessions
      for (const [sessionId, session] of this.sessions) {
        console.log(`  - Disconnecting ${session.server} (${sessionId})`);
        await session.client.disconnect().catch(() => {});
      }
      this.sessions.clear();

      // 3. Reload configuration
      this.loadServerConfigs();

      // 4. Reconnect to all servers
      await this.preconnectServers();

      const newServers = Array.from(this.sessions.keys());

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        reloaded: true,
        oldServers,
        newServers,
        servers: Object.keys(this.serverConfigs),
        timestamp: new Date().toISOString()
      }));

      console.log(`  Reloaded ${Object.keys(this.serverConfigs).length} servers: ${Object.keys(this.serverConfigs).join(', ')}`);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: (error as Error).message
      }));
    }
  }

  /**
   * Shutdown Daemon
   * POST /shutdown
   */
  private async handleShutdown(req: IncomingMessage, res: ServerResponse): Promise<void> {
    console.log('\nShutdown request received, stopping Daemon...');

    const shutdownResponse = JSON.stringify({
      success: true,
      message: 'Daemon stopped',
      shutdownAt: new Date().toISOString()
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(shutdownResponse);

    for (const [sessionId, session] of this.sessions) {
      console.log(`  - Closing ${session.server} (${sessionId})`);
      session.client.disconnect().catch(() => {});
    }
    this.sessions.clear();

    const serverCloseTimeout = setTimeout(() => {
      console.log('Server close timeout, forcing exit');
      process.exit(0);
    }, 1000);

    this.server.close(() => {
      clearTimeout(serverCloseTimeout);
      console.log('MCP Daemon stopped');
      process.exit(0);
    });
  }

  /**
   * Health check
   * GET /health
   */
  private handleHealth(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      port: this.port,
      sessions: this.sessions.size,
      uptime: process.uptime()
    }));
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
   * Cleanup idle sessions (optional implementation)
   */
  private cleanupIdleSessions(): void {
    // TODO: Cleanup long inactive sessions
  }

  /**
   * Start Daemon
   */
  async start(): Promise<void> {
    console.log('Preconnecting MCP Servers...');
    await this.preconnectServers();

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(`\nMCP Daemon running at http://localhost:${this.port}`);
        console.log(`Health check: http://localhost:${this.port}/health`);
        console.log(`\nAPI Endpoints:`);
        console.log(`  POST /connect              - Get global session ID`);
        console.log(`  POST /call                 - Call tools`);
        console.log(`  POST /request             - Generic JSON-RPC`);
        console.log(`  DELETE /disconnect        - Disconnect dynamic session`);
        console.log(`  POST /reload              - Reload MCP servers config`);
        console.log(`  DELETE /sessions/:id       - Close specific session (includes global)`);
        console.log(`  POST /sessions/:id/reconnect - Reconnect global session`);
        console.log(`  POST /shutdown            - Stop Daemon`);
        console.log(`  GET  /health               - Health check`);
        console.log();

        resolve();
      });

      this.server.on('error', (error) => {
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
        this.server.close(() => {
          console.log('MCP Daemon stopped');
          resolve();
        });
      });
    });
  }
}
