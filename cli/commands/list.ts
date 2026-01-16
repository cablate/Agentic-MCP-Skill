/**
 * list 命令 - Layer 2
 * 列出 MCP 伺服器的可用工具（名稱 + 描述）
 */

import { MCPClient } from '../client/socket-client.js';
import { OutputFormatter, ApiResponse } from '../formatter.js';
import { DaemonNotRunningError, ServerNotFoundError } from '../errors.js';
import { ensureDaemon } from '../utils/daemon.js';

export async function list(server: string, options: any) {
  // 自動啟動 daemon (如果尚未運行)
  await ensureDaemon({ port: parseInt(options.port) });

  const client = new MCPClient(parseInt(options.port));

  try {
    // 直接使用 socket 命令列出 tools
    const toolsResp = await client.post('/call', {
      sessionId: server,
      method: 'tools/list',
      params: {}
    });

    const tools = toolsResp.tools || [];

    // Layer 2：只返回 name 和 description，不包含 inputSchema
    const simplifiedTools = tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description
    }));

    const resp: ApiResponse = {
      success: true,
      server,
      sessionId: server,
      data: { tools: simplifiedTools, count: simplifiedTools.length }
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
