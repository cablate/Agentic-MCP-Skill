/**
 * Daemon 工具函數
 * 參考 agent-browser 的 ensure_daemon() 設計
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { isDaemonRunning as checkDaemonRunning } from '../../src/socket.js';
import { SocketClient } from '../../src/socket-client.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface EnsureDaemonOptions {
  port: number;
  config?: string;
}

interface DaemonResult {
  alreadyRunning: boolean;
}

/**
 * 找到 daemon 入口點
 */
function findDaemonEntry(): string {
  // 使用 import.meta.url 找到當前模組的位置，然後計算專案根目錄
  const currentModulePath = fileURLToPath(import.meta.url);
  const currentDir = dirname(currentModulePath);

  // 從當前檔案位置往回找專案根目錄
  // 當前檔案：dist/cli/utils/daemon.js 或 cli/utils/daemon.ts
  let projectRoot = currentDir;

  // 往上找直到找到 node_modules 或 package.json
  while (projectRoot !== dirname(projectRoot)) {
    if (existsSync(join(projectRoot, 'package.json'))) {
      break;
    }
    projectRoot = dirname(projectRoot);
  }

  // 如果找不到 package.json，使用相對路徑推斷
  if (!existsSync(join(projectRoot, 'package.json'))) {
    // 當前在 dist/cli/utils 或 cli/utils
    // 往回 4 層到專案根目錄
    projectRoot = join(currentDir, '../../../');
  }

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
 * 取得配置檔路徑
 * 優先順序：1. options.config > 2. 環境變數 > 3. 當前目錄的 mcp-servers.json
 */
function getConfigPath(options: EnsureDaemonOptions): string | undefined {
  if (options.config) {
    if (existsSync(options.config)) {
      return options.config;
    }
    throw new Error(`Config file not found: ${options.config}`);
  }

  if (process.env.MCP_DAEMON_CONFIG) {
    return process.env.MCP_DAEMON_CONFIG;
  }

  // 嘗試當前目錄
  const currentDirConfig = join(process.cwd(), 'mcp-servers.json');
  if (existsSync(currentDirConfig)) {
    return currentDirConfig;
  }

  return undefined;
}

/**
 * 檢查 daemon 是否正在運行
 * 1. 先檢查 PID file
 * 2. 如果 PID file 不存在，嘗試實際連接 socket (兼容手動啟動)
 */
async function isDaemonRunning(): Promise<boolean> {
  // 先檢查 PID file
  if (checkDaemonRunning()) {
    return true;
  }

  // PID file 不存在，嘗試實際連接 socket (兼容手動啟動的情況)
  try {
    const client = new SocketClient({ timeout: 2000 });
    await client.connect();
    await client.disconnect();
    return true;
  } catch {
    return false;
  }
}

/**
 * 啟動 daemon 進程
 */
function spawnDaemon(options: EnsureDaemonOptions): void {
  const daemonEntry = findDaemonEntry();
  const env: NodeJS.ProcessEnv = { ...process.env, MCP_DAEMON: '1' };

  // 設定 config path
  const configPath = getConfigPath(options);
  if (configPath) {
    env.MCP_DAEMON_CONFIG = configPath;
  }

  const cmd = daemonEntry.endsWith('.ts') ? 'npx tsx' : 'node';
  const args = daemonEntry.endsWith('.ts') ? [daemonEntry] : [daemonEntry];

  const daemon = spawn(cmd, args, {
    env,
    detached: true,
    stdio: 'ignore'
  });

  daemon.unref();
}

/**
 * 等待 daemon 準備好 (最多 5 秒)
 */
async function waitForDaemon(): Promise<void> {
  const maxAttempts = 50;
  const delay = 100; // ms

  for (let i = 0; i < maxAttempts; i++) {
    if (await isDaemonRunning()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw new Error('Daemon failed to start within 5 seconds');
}

/**
 * 確保 daemon 正在運行
 * 如果未運行，則自動啟動
 *
 * @returns DaemonResult - { alreadyRunning: boolean }
 *
 * @example
 * const result = await ensureDaemon({ port: 13579 });
 * if (!result.alreadyRunning) {
 *   console.log('Daemon started successfully');
 * }
 */
export async function ensureDaemon(options: EnsureDaemonOptions): Promise<DaemonResult> {
  // 檢查是否已經在運行
  if (await isDaemonRunning()) {
    return { alreadyRunning: true };
  }

  // 啟動 daemon
  spawnDaemon(options);

  // 等待 daemon 準備好
  await waitForDaemon();

  return { alreadyRunning: false };
}
