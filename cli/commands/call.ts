/**
 * call 命令
 * 呼叫 MCP 工具
 */

import { MCPClient } from '../client/socket-client.js';
import { OutputFormatter, ApiResponse } from '../formatter.js';
import { DaemonNotRunningError, ServerNotFoundError, InvalidParamsError } from '../errors.js';
import { ensureDaemon } from '../utils/daemon.js';

export async function call(server: string, tool: string, options: any) {
  // 自動啟動 daemon (如果尚未運行)
  await ensureDaemon({ port: parseInt(options.port) });

  const client = new MCPClient(parseInt(options.port));

  try {
    // 解析參數
    let params = {};
    if (options.params) {
      try {
        params = JSON.parse(options.params);
      } catch (error) {
        throw new InvalidParamsError('--params must be valid JSON');
      }
    }

    // 直接使用 socket 命令呼叫 tool
    const callResp = await client.post('/call', {
      sessionId: server,
      method: 'tools/call',
      params: {
        name: tool,
        arguments: params
      }
    });

    const resp: ApiResponse = {
      success: true,
      server,
      tool,
      sessionId: server,
      data: callResp
    };

    OutputFormatter.printResponse(resp, options.json);
    await client.close();
    process.exit(0);
  } catch (error) {
    if (error instanceof DaemonNotRunningError ||
        error instanceof InvalidParamsError) {
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
