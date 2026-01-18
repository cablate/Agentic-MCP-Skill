import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressiveMCPClient } from '../../src/client.js';
import { resolve } from 'path';

describe('ProgressiveMCPClient', () => {
  let client: ProgressiveMCPClient;

  beforeEach(() => {
    // 使用 filesystem MCP server 測試專案根目錄
    // Windows 路徑有特殊字符問題，使用簡單的相對路徑
    const testDir = 'C:/temp/mcp-test';

    client = new ProgressiveMCPClient({
      type: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', testDir]
    });
  });

  describe('Connection', () => {
    it('should connect to MCP server', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);
      await client.disconnect();
    });

    it('should disconnect from MCP server', async () => {
      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle multiple connect calls gracefully', async () => {
      await client.connect();
      await client.connect(); // Should not throw

      expect(client.isConnected()).toBe(true);
      await client.disconnect();
    });
  });

  describe('Layer 1: Metadata', () => {
    it('should get metadata (Layer 1)', async () => {
      await client.connect();
      const metadata = await client.getMetadata();

      expect(metadata).toBeDefined();
      expect(metadata.name).toBeDefined();
      expect(metadata.version).toBeDefined();
      expect(metadata.capabilities).toBeDefined();

      await client.disconnect();
    });

    it('should throw error when getting metadata while disconnected', async () => {
      expect(client.isConnected()).toBe(false);

      await expect(client.getMetadata()).rejects.toThrow(
        'Not connected to server'
      );
    });
  });

  describe('Layer 2: Tool List', () => {
    it('should list tools (Layer 2) without inputSchema', async () => {
      await client.connect();
      const tools = await client.listTools();

      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);

      // filesystem server 應該有 read_file 等工具
      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('read_file');

      // Layer 2 不應該包含 inputSchema
      tools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).not.toHaveProperty('inputSchema');
      });

      await client.disconnect();
    });

    it('should throw error when listing tools while disconnected', async () => {
      expect(client.isConnected()).toBe(false);

      await expect(client.listTools()).rejects.toThrow(
        'Not connected to server'
      );
    });
  });

  describe('Layer 3: Tool Schema', () => {
    it('should get tool schema (Layer 3) with inputSchema', async () => {
      await client.connect();

      const schema = await client.getToolSchema('read_file');
      expect(schema).toBeDefined();
      expect(schema.name).toBe('read_file');
      expect(schema.description).toBeDefined();
      expect(schema.inputSchema).toBeDefined();
      expect(typeof schema.inputSchema).toBe('object');

      await client.disconnect();
    });

    it('should throw error for non-existent tool', async () => {
      await client.connect();

      await expect(client.getToolSchema('non_existent_tool')).rejects.toThrow(
        'Tool not found: non_existent_tool'
      );

      await client.disconnect();
    });

    it('should throw error when getting schema while disconnected', async () => {
      expect(client.isConnected()).toBe(false);

      await expect(client.getToolSchema('read_file')).rejects.toThrow(
        'Not connected to server'
      );
    });
  });

  describe('Tool Call', () => {
    it('should call tool successfully', async () => {
      await client.connect();

      const result = await client.callTool('read_file', {
        path: 'package.json'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();

      await client.disconnect();
    });

    it('should throw error when calling tool while disconnected', async () => {
      expect(client.isConnected()).toBe(false);

      await expect(client.callTool('read_file', { path: 'test' })).rejects.toThrow(
        'Not connected to server'
      );
    });
  });
});
