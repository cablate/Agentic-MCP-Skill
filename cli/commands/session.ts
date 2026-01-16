/**
 * Session 命令 - 管理 sessions
 */

import { MCPClient } from '../client/socket-client.js';
import { OutputFormatter, ApiResponse } from '../formatter.js';
import { DaemonNotRunningError } from '../errors.js';
import { ensureDaemon } from '../utils/daemon.js';

export async function session(options: any) {
  // 自動啟動 daemon (如果尚未運行)
  await ensureDaemon({ port: parseInt(options.port) });

  const client = new MCPClient(parseInt(options.port));

  try {
    if (options.list) {
      // 列出所有 sessions
      const resp = await client.get('/sessions');
      OutputFormatter.printResponse(resp, options.json);
      await client.close();
      process.exit(0);
    } else if (options.create) {
      // 建立新 session
      const body: any = { server: options.server };
      if (options.clientId) {
        body.clientId = options.clientId;
      }
      const resp = await client.post('/sessions', body);
      OutputFormatter.printResponse(resp, options.json);
      await client.close();
      process.exit(0);
    } else if (options.close) {
      // 關閉指定 session
      const resp = await client.delete(`/sessions/${options.close}`);
      OutputFormatter.printResponse(resp, options.json);
      await client.close();
      process.exit(0);
    } else if (options.switch) {
      // 切換預設 session（目前只是顯示，未實作持久化）
      const resp: ApiResponse = {
        success: true,
        data: {
          currentSession: options.switch,
          message: 'Session switched (note: default session not persisted yet)'
        }
      };
      OutputFormatter.printResponse(resp, options.json);
      await client.close();
      process.exit(0);
    } else {
      // 顯示當前 session (暫時使用固定值)
      const resp: ApiResponse = {
        success: true,
        data: {
          currentSession: 'playwright',
          message: 'Use --list to see all sessions'
        }
      };
      OutputFormatter.printResponse(resp, options.json);
      await client.close();
      process.exit(0);
    }
  } catch (error: unknown) {
    if (error instanceof DaemonNotRunningError) {
      const resp: ApiResponse = {
        success: false,
        error: error.format()
      };
      OutputFormatter.printResponse(resp, options.json);
      process.exit(1);
    }

    const resp: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
    OutputFormatter.printResponse(resp, options.json);
    process.exit(1);
  }
}
