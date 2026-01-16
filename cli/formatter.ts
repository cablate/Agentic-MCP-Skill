/**
 * 輸出格式化 - Pattern 5 from agent-browser
 * 支持雙模式：JSON（AI）+ Human（人類）
 */

import chalk from 'chalk';

/**
 * API 響應介面
 */
export interface ApiResponse {
  success: boolean;
  error?: string;
  data?: any;
  server?: string;
  tool?: string;
  sessionId?: string;
}

/**
 * 輸出格式化器
 */
export class OutputFormatter {
  /**
   * 列印響應
   * @param resp API 響應
   * @param jsonMode JSON 模式
   */
  static printResponse(resp: ApiResponse, jsonMode: boolean = false): void {
    if (jsonMode) {
      console.log(JSON.stringify(resp));
      return;
    }

    if (!resp.success) {
      console.error(chalk.red('✗'), resp.error || 'Unknown error');
      return;
    }

    const data = resp.data || {};

    // Metadata 響應
    if (data.name && data.version) {
      console.log(chalk.green('✓'), `${data.name} (${data.version})`);
      if (data.description) {
        console.log('  ', chalk.gray(data.description));
      }
      return;
    }

    // Tools 響應
    if (Array.isArray(data.tools)) {
      const tools = data.tools;
      console.log(chalk.blue('📋'), `Available tools (${tools.length}):`);
      tools.forEach((tool: any) => {
        console.log('  -', chalk.cyan(tool.name), ':', tool.description || 'No description');
      });
      return;
    }

    // Tool schema 響應
    if (data.inputSchema) {
      console.log(chalk.green('✓'), `${data.name}`);
      console.log('  Description:', data.description || 'No description');
      console.log('  Schema:');
      console.log('  ', JSON.stringify(data.inputSchema, null, 2));
      return;
    }

    // Tool call 響應
    if (resp.tool) {
      console.log(chalk.green('✓'), `Called ${resp.tool}`);
      const resultData = data.result || data;
      if (resultData) {
        if (Array.isArray(resultData.content)) {
          resultData.content.forEach((item: any) => {
            if (item.type === 'text') {
              console.log('  Result:', item.text);
            } else if (item.type === 'resource') {
              console.log('  Resource:', JSON.stringify(item.data));
            }
          });
        } else {
          console.log('  Result:', JSON.stringify(resultData, null, 2));
        }
      }
      return;
    }

    // Session 響應
    if (data.sessionId) {
      console.log(chalk.green('✓'), `Session: ${data.sessionId}`);
      if (data.server) {
        console.log('  Server:', data.server);
      }
      return;
    }

    // Health 響應
    if (data.status === 'healthy' || data.status === 'ok' || data.uptime) {
      console.log(chalk.green('✓'), `Daemon is ${data.status || 'healthy'}`);
      if (data.session) {
        console.log('  Session:', data.session);
      }
      if (data.servers !== undefined) {
        console.log('  Active servers:', data.servers);
      }
      if (data.sessions !== undefined) {
        console.log('  Active sessions:', data.sessions);
      }
      return;
    }

    // 預設成功訊息
    console.log(chalk.green('✓'), 'Done');
  }
}
