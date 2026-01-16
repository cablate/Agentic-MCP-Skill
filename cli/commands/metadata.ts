/**
 * metadata 命令 - Layer 1
 * 取得 MCP 伺服器資訊（名稱、版本、描述）
 */

import { MCPClient } from '../client/socket-client.js';
import { OutputFormatter, ApiResponse } from '../formatter.js';
import { DaemonNotRunningError, ServerNotFoundError } from '../errors.js';
import { ensureDaemon } from '../utils/daemon.js';

export async function metadata(server: string, options: any) {
  // 自動啟動 daemon (如果尚未運行)
  await ensureDaemon({ port: parseInt(options.port) });

  const client = new MCPClient(parseInt(options.port));

  try {
    // 直接使用 socket 命令取得 metadata
    // /metadata?sessionId=xxx → {action:"metadata",server:xxx}
    const metadataResp = await client.get(`/metadata?sessionId=${server}`);

    const resp: ApiResponse = {
      success: true,
      server,
      sessionId: server,
      data: metadataResp
    };

    OutputFormatter.printResponse(resp, options.json);
    await client.close();
    process.exit(0);
  } catch (error) {
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
