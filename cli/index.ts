#!/usr/bin/env node
/**
 * MCP Progressive Client CLI
 * 效仿 agent-browser 的設計模式
 */

import { Command } from 'commander';
import { metadata } from './commands/metadata.js';
import { list } from './commands/list.js';
import { schema } from './commands/schema.js';
import { call } from './commands/call.js';
import { session } from './commands/session.js';
import { daemonStart, daemonStop, daemonReload } from './commands/daemon.js';
import { MCPClient } from './client/socket-client.js';
import { OutputFormatter, ApiResponse } from './formatter.js';
import { DaemonNotRunningError } from './errors.js';

const program = new Command();

program
  .name('mcp')
  .description('MCP Progressive Client CLI - Three-layer progressive disclosure for MCP servers')
  .version('0.2.0');

// 全局選項
const globalPortOption = '--port <port>';

// 核心命令
program
  .command('metadata <server>')
  .description('Get MCP server metadata (Layer 1)')
  .option('--port <port>', 'Daemon port', '13579')
  .option('--json', 'JSON output mode')
  .action(metadata);

program
  .command('list <server>')
  .description('List available tools (Layer 2)')
  .option('--port <port>', 'Daemon port', '13579')
  .option('--json', 'JSON output mode')
  .action(list);

program
  .command('schema <server> <tool>')
  .description('Get tool schema (Layer 3)')
  .option('--port <port>', 'Daemon port', '13579')
  .option('--json', 'JSON output mode')
  .action(schema);

program
  .command('call <server> <tool>')
  .description('Call MCP tool')
  .option('--port <port>', 'Daemon port', '13579')
  .option('--params <json>', 'Tool parameters (JSON)')
  .option('--session-id <id>', 'Reuse session')
  .option('--json', 'JSON output mode')
  .action(call);

// Daemon 管理
const daemonCmd = program
  .command('daemon')
  .description('Manage MCP daemon');

daemonCmd
  .command('start')
  .description('Start MCP daemon')
  .option('--port <port>', 'Daemon port', '13579')
  .option('--config <path>', 'Path to mcp-servers.json configuration file')
  .option('--json', 'JSON output mode')
  .action(daemonStart);

daemonCmd
  .command('stop')
  .description('Stop MCP daemon')
  .option('--port <port>', 'Daemon port', '13579')
  .option('--json', 'JSON output mode')
  .action(daemonStop);

daemonCmd
  .command('reload')
  .description('Reload MCP daemon configuration')
  .option('--port <port>', 'Daemon port', '13579')
  .option('--json', 'JSON output mode')
  .action(daemonReload);

daemonCmd
  .command('health')
  .description('Check MCP daemon health')
  .option('--port <port>', 'Daemon port', '13579')
  .option('--json', 'JSON output mode')
  .action(async (options) => {
    try {
      const client = new MCPClient(parseInt(options.port));
      const resp = await client.get('/health');

      const apiResp: ApiResponse = {
        success: true,
        data: resp
      };

      OutputFormatter.printResponse(apiResp, options.json);
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
  });

// Session 管理
program
  .command('session')
  .description('Manage sessions')
  .option('--list', 'List active sessions')
  .option('--create', 'Create new dynamic session')
  .option('--server <name>', 'Server name (for --create)')
  .option('--client-id <id>', 'Client ID for new session (for --create)')
  .option('--close <id>', 'Close session')
  .option('--switch <id>', 'Switch session')
  .option('--port <port>', 'Daemon port', '13579')
  .option('--json', 'JSON output mode')
  .action(session);

// 解析命令
program.parse();
