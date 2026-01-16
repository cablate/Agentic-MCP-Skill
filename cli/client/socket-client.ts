/**
 * Socket 客戶端封裝
 * 為所有命令提供統一的 Socket 請求介面（替換 HTTP）
 *
 * Socket Protocol (newline-delimited JSON):
 * - Command: {"id":"1","action":"metadata","server":"context7"}
 * - Response: {"id":"1","success":true,"data":{...}}
 */

import { SocketClient } from '../../src/socket-client.js';
import { SocketCommand, SocketResponse } from '../../src/socket-client.js';
import { DaemonNotRunningError, ConnectionFailedError } from '../errors.js';

/**
 * MCP Socket Client wrapper
 * 提供與舊 HTTP client 相同的 API，使命令轉移更容易
 */
export class MCPClient {
  private socketClient: SocketClient;

  constructor(_port?: number) {
    // Port 參數保留以相容舊 API，但不再使用（改用 session-based socket）
    this.socketClient = new SocketClient({
      session: process.env.MCP_DAEMON_SESSION || 'default',
      timeout: 30000
    });
  }

  /**
   * 發送 socket 命令（內部方法）
   */
  private async sendCommand<T = unknown>(command: Omit<SocketCommand, 'id'>): Promise<T> {
    try {
      const response = await this.socketClient.send<T>(command);

      if (!response.success) {
        throw new ConnectionFailedError(response.error || 'Unknown error');
      }

      return response.data as T;
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Failed to connect to daemon')) {
          throw new DaemonNotRunningError();
        }
        if (error instanceof ConnectionFailedError) {
          throw error;
        }
        throw new ConnectionFailedError(error.message);
      }
      throw new ConnectionFailedError(String(error));
    }
  }

  /**
   * GET 請求 - 映射到 Socket action
   * /metadata?sessionId=xxx → {"action":"metadata","server":xxx}
   */
  async get(path: string): Promise<any> {
    // 解析路徑和查詢參數
    const url = new URL(path, 'http://dummy');
    const pathname = url.pathname;
    const searchParams = url.searchParams;

    switch (pathname) {
      case '/metadata': {
        const server = searchParams.get('sessionId');
        if (!server) {
          throw new Error('Server name is required');
        }
        return this.sendCommand({ action: 'metadata', server });
      }

      case '/health': {
        // Health check - if no server specified, ping daemon
        const server = searchParams.get('server');
        if (!server) {
          return this.sendCommand({ action: 'ping' });
        }
        return this.sendCommand({ action: 'health', server });
      }

      case '/sessions': {
        return this.sendCommand({ action: 'sessions' });
      }

      case '/schema': {
        const server = searchParams.get('server');
        const tool = searchParams.get('tool');
        if (!server || !tool) {
          throw new Error('Server and tool name are required');
        }
        return this.sendCommand({ action: 'schema', server, tool });
      }

      default:
        throw new Error(`Unknown GET endpoint: ${pathname}`);
    }
  }

  /**
   * POST 請求 - 映射到 Socket action
   * /connect → {"action":"connect","server":xxx}
   * /call → {"action":"call","server":xxx,"tool":xxx,"arguments":{...}}
   */
  async post(path: string, data?: any): Promise<any> {
    switch (path) {
      case '/connect': {
        const server = data?.server;
        if (!server) {
          throw new Error('Server name is required');
        }
        // 連接檢查 - 使用 health action
        const healthData = await this.sendCommand<{ connectedAt: string }>({ action: 'health', server });
        return {
          success: true,
          sessionId: server,
          server,
          connectedAt: healthData.connectedAt
        };
      }

      case '/call': {
        const { sessionId, method, params } = data;

        // sessionId 就是 server 名稱
        const server = sessionId;
        if (!server) {
          throw new Error('Session ID is required');
        }

        // 映射方法到 action
        if (method === 'tools/list') {
          return this.sendCommand({ action: 'list', server });
        } else if (method === 'tools/call') {
          const toolName = (params as any).name;
          const toolArgs = (params as any).arguments;
          return this.sendCommand({
            action: 'call',
            server,
            tool: toolName,
            arguments: toolArgs
          });
        } else {
          throw new Error(`Unsupported method: ${method}`);
        }
      }

      case '/reload': {
        return this.sendCommand({ action: 'reload' });
      }

      case '/shutdown': {
        return this.sendCommand({ action: 'shutdown' });
      }

      default:
        throw new Error(`Unknown POST endpoint: ${path}`);
    }
  }

  /**
   * DELETE 請求 - 映射到 Socket action
   * /disconnect?sessionId=xxx
   * /sessions/:sessionId
   */
  async delete(path: string): Promise<any> {
    const url = new URL(path, 'http://dummy');
    const pathname = url.pathname;
    const searchParams = url.searchParams;

    if (pathname === '/disconnect') {
      const sessionId = searchParams.get('sessionId');
      if (!sessionId) {
        throw new Error('Session ID is required');
      }
      // Socket daemon 不支援 disconnect global session
      throw new Error('Global sessions cannot be disconnected via Socket API');
    }

    if (pathname.startsWith('/sessions/')) {
      // DELETE /sessions/:sessionId
      const parts = pathname.split('/');
      const sessionId = parts[2];
      // Socket daemon 不支援關閉 session
      throw new Error('Session management via Socket is not yet implemented');
    }

    throw new Error(`Unknown DELETE endpoint: ${path}`);
  }

  /**
   * 關閉連接
   */
  async close(): Promise<void> {
    await this.socketClient.disconnect();
  }
}
