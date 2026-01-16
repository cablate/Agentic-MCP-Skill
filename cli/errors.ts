/**
 * 結構化錯誤處理 - Pattern 4 from agent-browser
 * 定義錯誤類型 + 提供上下文信息 + 友好提示
 */

/**
 * 錯誤類型枚舉
 */
export enum ErrorType {
  UnknownCommand = 'unknown_command',
  MissingArguments = 'missing_arguments',
  DaemonNotRunning = 'daemon_not_running',
  InvalidParams = 'invalid_params',
  ServerNotFound = 'server_not_found',
  ToolNotFound = 'tool_not_found',
  ConnectionFailed = 'connection_failed'
}

/**
 * 基礎命令錯誤類
 */
export class CommandError extends Error {
  constructor(
    public readonly type: ErrorType,
    public readonly context: Record<string, any>,
    message?: string
  ) {
    super(message || `Command error: ${type}`);
    this.name = 'CommandError';
    Error.captureStackTrace(this, this.constructor);
  }

  format(): string {
    switch (this.type) {
      case ErrorType.UnknownCommand:
        const valid = this.context.valid_commands?.join(', ') || 'none';
        return `Unknown command: ${this.context.command}\nAvailable commands: ${valid}`;

      case ErrorType.MissingArguments:
        return `Missing arguments for: ${this.context.context}\nUsage: agentic-mcp${this.context.usage}`;

      case ErrorType.DaemonNotRunning:
        return 'MCP daemon is not running. Start with: agentic-mcpdaemon start';

      case ErrorType.ServerNotFound:
        const available = this.context.available_servers?.join(', ') || 'none';
        return `Server not found: ${this.context.server}\nAvailable servers: ${available}`;

      case ErrorType.ToolNotFound:
        return `Tool not found: ${this.context.tool}`;

      case ErrorType.InvalidParams:
        return `Invalid parameters: ${this.context.reason}`;

      case ErrorType.ConnectionFailed:
        return `Failed to connect to daemon: ${this.context.detail}`;

      default:
        return this.message || 'Unknown error';
    }
  }
}

/**
 * 未知命令錯誤
 */
export class UnknownCommandError extends CommandError {
  constructor(command: string, validCommands: string[]) {
    super(
      ErrorType.UnknownCommand,
      { command, valid_commands: validCommands },
      `Unknown command: ${command}`
    );
  }
}

/**
 * 缺少參數錯誤
 */
export class MissingArgumentsError extends CommandError {
  constructor(context: string, usage: string) {
    super(
      ErrorType.MissingArguments,
      { context, usage },
      `Missing arguments for: ${context}`
    );
  }
}

/**
 * Daemon 未運行錯誤
 */
export class DaemonNotRunningError extends CommandError {
  constructor() {
    super(ErrorType.DaemonNotRunning, {}, 'MCP daemon is not running');
  }
}

/**
 * Server 未找到錯誤
 */
export class ServerNotFoundError extends CommandError {
  constructor(server: string, availableServers: string[]) {
    super(
      ErrorType.ServerNotFound,
      { server, available_servers: availableServers },
      `Server not found: ${server}`
    );
  }
}

/**
 * Tool 未找到錯誤
 */
export class ToolNotFoundError extends CommandError {
  constructor(tool: string) {
    super(ErrorType.ToolNotFound, { tool }, `Tool not found: ${tool}`);
  }
}

/**
 * 無效參數錯誤
 */
export class InvalidParamsError extends CommandError {
  constructor(reason: string) {
    super(ErrorType.InvalidParams, { reason }, `Invalid parameters: ${reason}`);
  }
}

/**
 * 連接失敗錯誤
 */
export class ConnectionFailedError extends CommandError {
  constructor(detail: string) {
    super(ErrorType.ConnectionFailed, { detail }, `Failed to connect to daemon: ${detail}`);
  }
}
