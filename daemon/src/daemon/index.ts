/**
 * MCP Daemon entry point
 *
 * Usage:
 *   node dist/daemon/index.js
 *
 * Environment variables:
 *   MCP_DAEMON_PORT - Listen port (default: 13579)
 */

import { MCPDaemon } from './mcp-daemon.js';

const port = process.env.MCP_DAEMON_PORT ?
  parseInt(process.env.MCP_DAEMON_PORT, 10) :
  13579;

const daemon = new MCPDaemon({
  port,
  cors: true
});

console.log('Starting MCP Daemon...');

daemon.start()
  .then(() => {
    console.log('Daemon started successfully');
  })
  .catch((error) => {
    console.error('Daemon start failed:', error);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\nStopping MCP Daemon...');
  await daemon.stop();
  process.exit(0);
});
