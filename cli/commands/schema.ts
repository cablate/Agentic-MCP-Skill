/**
 * schema 命令 - Layer 3
 * 取得特定工具的完整輸入格式
 */

import { MCPClient } from '../client/socket-client.js';
import { OutputFormatter, ApiResponse } from '../formatter.js';
import { DaemonNotRunningError, ServerNotFoundError, ToolNotFoundError } from '../errors.js';
import { ensureDaemon } from '../utils/daemon.js';

export async function schema(server: string, tool: string, options: any) {
  // 自動啟動 daemon (如果尚未運行)
  await ensureDaemon({ port: parseInt(options.port) });

  const client = new MCPClient(parseInt(options.port));

  try {
    // 直接使用 socket 命令取得 schema
    // {action:"schema",server:xxx,tool:xxx}
    const schemaResp = await client.get(`/schema?server=${server}&tool=${tool}`);

    const resp: ApiResponse = {
      success: true,
      server,
      tool,
      sessionId: server,
      data: schemaResp
    };

    OutputFormatter.printResponse(resp, options.json);
    await client.close();
    process.exit(0);
  } catch (error) {
    if (error instanceof DaemonNotRunningError || error instanceof ToolNotFoundError) {
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
