/**
 * Daemon 命令 - 管理 MCP daemon
 */

import { MCPClient } from '../client/socket-client.js';
import { OutputFormatter, ApiResponse } from '../formatter.js';
import { DaemonNotRunningError } from '../errors.js';
import { spawn, exec } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
// 內聯 socket 工具函數，避免 TypeScript ESM 解析問題
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEFAULT_SESSION = 'default';

function getCurrentSession(): string {
  return process.env.MCP_DAEMON_SESSION || DEFAULT_SESSION;
}

function getPidFile(session?: string): string {
  const sess = session || getCurrentSession();
  return path.join(os.tmpdir(), `mcp-daemon-${sess}.pid`);
}

function cleanupSocket(session?: string): void {
  const pidFile = getPidFile(session);
  try {
    if (fs.existsSync(pidFile)) {
      fs.unlinkSync(pidFile);
    }
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      const portFile = path.join(os.tmpdir(), `mcp-daemon-${session || getCurrentSession()}.port`);
      if (fs.existsSync(portFile)) {
        fs.unlinkSync(portFile);
      }
    }
  } catch {}
}

function isDaemonRunning(session?: string): boolean {
  const pidFile = getPidFile(session);
  if (!fs.existsSync(pidFile)) {
    return false;
  }
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    process.kill(pid, 0);
    return true;
  } catch {
    cleanupSocket(session);
    return false;
  }
}

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * 找到 daemon 入口點
 */
function findDaemonEntry(): string {
  const projectRoot = join(__dirname, '../../..');

  // 檢查編譯版本 (daemon 服務入口點)
  const distEntry = join(projectRoot, 'dist/src/daemon.js');
  if (existsSync(distEntry)) {
    return distEntry;
  }

  // 回退到源碼
  const srcEntry = join(projectRoot, 'src/daemon.ts');
  if (existsSync(srcEntry)) {
    return srcEntry;
  }

  throw new Error(
    'Daemon entry point not found. Please run: npm run build'
  );
}

/**
 * 啟動 daemon
 */
export async function daemonStart(options: any) {
  try {
    // 檢查 daemon 是否已經運行（使用 PID file）
    const session = options.session || 'default';
    if (isDaemonRunning(session)) {
      console.log('✓ Daemon is already running');
      return;
    }

    const daemonEntry = findDaemonEntry();

    // 啟動 daemon 進程
    const env: NodeJS.ProcessEnv = { ...process.env, MCP_DAEMON: '1' };

    // 設定 config path
    // 優先順序：1. --config 參數 > 2. 環境變數 > 3. 當前目錄的 mcp-servers.json
    if (options.config) {
      // 用戶指定的配置文件
      if (existsSync(options.config)) {
        env.MCP_DAEMON_CONFIG = options.config;
        console.log(`Using config: ${options.config}`);
      } else {
        console.error(`✗ Config file not found: ${options.config}`);
        process.exit(1);
      }
    } else if (!process.env.MCP_DAEMON_CONFIG) {
      // 沒有環境變數，嘗試當前目錄
      const currentDirConfig = join(process.cwd(), 'mcp-servers.json');
      if (existsSync(currentDirConfig)) {
        env.MCP_DAEMON_CONFIG = currentDirConfig;
      }
    }

    const cmd = daemonEntry.endsWith('.ts') ? 'npx tsx' : 'node';
    const args = daemonEntry.endsWith('.ts') ? [daemonEntry] : [daemonEntry];

    console.log(`Starting daemon...`);
    if (env.MCP_DAEMON_CONFIG) {
      console.log(`  Config: ${env.MCP_DAEMON_CONFIG}`);
    }

    // 啟動 daemon（重導向 stdio 到 NUL 保持 daemon 運行）
    const daemon = spawn(cmd, [daemonEntry], {
      env,
      detached: true,
      stdio: ['ignore', 'ignore', 'ignore'],
      windowsHide: true
    });

    // 不關閉 stdout/stderr，讓 daemon 繼續運行
    // Detach 後，daemon 會成為新 process group 的 leader
    daemon.unref();

    // 等待 daemon 完全啟動（定期檢查 health endpoint）
    const waitForReady = new Promise<{ success: boolean; error?: string }>((resolve) => {
      const maxAttempts = 60; // 最多 60 秒
      let attempts = 0;

      const checkReady = async () => {
        attempts++;

        // 檢查 daemon 是否還活著
        try {
          const client = new MCPClient(parseInt(options.port));
          await client.get('/health');
          // Health check 成功 = daemon ready
          resolve({ success: true });
          return;
        } catch {
          // Health check 失敗，繼續等待
        }

        // 檢查 daemon 是否已經退出
        if (daemon.exitCode !== null) {
          resolve({ success: false, error: `Daemon exited with code ${daemon.exitCode}` });
          return;
        }

        if (attempts >= maxAttempts) {
          resolve({ success: false, error: 'Daemon failed to start within timeout' });
          return;
        }

        // 繼續等待
        setTimeout(checkReady, 1000);
      };

      // 開始檢查
      setTimeout(checkReady, 500);
    });

    const result = await waitForReady;

    if (!result.success) {
      console.error(`\n✗ Failed to start daemon: ${result.error}`);
      process.exit(1);
    }

    // Daemon 已經在背景獨立運行
    console.log(`\n✓ Daemon started successfully`);
    console.log(`  Use 'agentic-mcp daemon health' to check status`);

    // 確保父進程立即退出
    process.exit(0);
  } catch (error) {
    const resp: ApiResponse = {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
    OutputFormatter.printResponse(resp, options.json);
    process.exit(1);
  }
}

/**
 * 停止 daemon
 */
export async function daemonStop(options: any) {
  try {
    const client = new MCPClient(parseInt(options.port));

    const resp = await client.post('/shutdown');

    const apiResp: ApiResponse = {
      success: true,
      data: resp
    };

    OutputFormatter.printResponse(apiResp, options.json);
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

/**
 * 重新載入 daemon 配置
 */
export async function daemonReload(options: any) {
  try {
    const client = new MCPClient(parseInt(options.port));

    const resp = await client.post('/reload');

    const apiResp: ApiResponse = {
      success: true,
      data: {
        oldServers: resp.oldServers,
        newServers: resp.newServers,
        servers: resp.servers
      }
    };

    OutputFormatter.printResponse(apiResp, options.json);
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
