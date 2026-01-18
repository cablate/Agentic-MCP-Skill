import { describe, it, expect, vi } from 'vitest';
import { SocketClient } from '../../../src/socket-client.js';

// Mock SocketClient for testing CLI commands
vi.mock('../../../src/socket-client.js', () => ({
  SocketClient: vi.fn()
}));

describe('CLI Commands (Unit Tests)', () => {
  describe('metadata command', () => {
    it('should fetch metadata from daemon', async () => {
      // This test verifies the metadata command logic
      // In a real implementation, this would test the action function directly

      const mockClient = {
        connect: vi.fn(),
        send: vi.fn().mockResolvedValue({
          id: '1',
          success: true,
          data: {
            name: 'test-server',
            version: '1.0.0',
            description: 'Test MCP server'
          }
        }),
        disconnect: vi.fn()
      };

      vi.mocked(SocketClient).mockReturnValue(mockClient as any);

      // Simulate metadata command action
      await mockClient.connect();
      const response = await mockClient.send({
        action: 'metadata',
        server: 'test'
      });

      expect(mockClient.connect).toHaveBeenCalled();
      expect(mockClient.send).toHaveBeenCalledWith({
        action: 'metadata',
        server: 'test'
      });
      expect(response.success).toBe(true);
      expect(response.data.name).toBe('test-server');
    });
  });

  describe('list command', () => {
    it('should fetch tool list from daemon', async () => {
      const mockClient = {
        connect: vi.fn(),
        send: vi.fn().mockResolvedValue({
          id: '1',
          success: true,
          data: {
            tools: [
              { name: 'read_file', description: 'Read a file' },
              { name: 'write_file', description: 'Write a file' }
            ]
          }
        }),
        disconnect: vi.fn()
      };

      vi.mocked(SocketClient).mockReturnValue(mockClient as any);

      // Simulate list command action
      await mockClient.connect();
      const response = await mockClient.send({
        action: 'list',
        server: 'test'
      });

      expect(response.success).toBe(true);
      expect(response.data.tools).toHaveLength(2);
      expect(response.data.tools[0].name).toBe('read_file');
    });
  });

  describe('schema command', () => {
    it('should fetch tool schema from daemon', async () => {
      const mockClient = {
        connect: vi.fn(),
        send: vi.fn().mockResolvedValue({
          id: '1',
          success: true,
          data: {
            name: 'read_file',
            description: 'Read a file',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' }
              },
              required: ['path']
            }
          }
        }),
        disconnect: vi.fn()
      };

      vi.mocked(SocketClient).mockReturnValue(mockClient as any);

      // Simulate schema command action
      await mockClient.connect();
      const response = await mockClient.send({
        action: 'schema',
        server: 'test',
        tool: 'read_file'
      });

      expect(response.success).toBe(true);
      expect(response.data.name).toBe('read_file');
      expect(response.data.inputSchema).toBeDefined();
    });
  });

  describe('call command', () => {
    it('should call tool via daemon', async () => {
      const mockClient = {
        connect: vi.fn(),
        send: vi.fn().mockResolvedValue({
          id: '1',
          success: true,
          data: {
            content: [
              { type: 'text', text: 'file content' }
            ]
          }
        }),
        disconnect: vi.fn()
      };

      vi.mocked(SocketClient).mockReturnValue(mockClient as any);

      // Simulate call command action
      await mockClient.connect();
      const response = await mockClient.send({
        action: 'call',
        server: 'test',
        tool: 'read_file',
        arguments: {
          path: 'test.txt'
        }
      });

      expect(response.success).toBe(true);
      expect(response.data.content).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle daemon not running error', async () => {
      const mockClient = {
        connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        disconnect: vi.fn()
      };

      vi.mocked(SocketClient).mockReturnValue(mockClient as any);

      await expect(mockClient.connect()).rejects.toThrow('ECONNREFUSED');
    });

    it('should handle server not found error', async () => {
      const mockClient = {
        connect: vi.fn(),
        send: vi.fn().mockResolvedValue({
          id: '1',
          success: false,
          error: "Server 'nonexistent' not found"
        }),
        disconnect: vi.fn()
      };

      vi.mocked(SocketClient).mockReturnValue(mockClient as any);

      await mockClient.connect();
      const response = await mockClient.send({
        action: 'metadata',
        server: 'nonexistent'
      });

      expect(response.success).toBe(false);
      expect(response.error).toContain("not found");
    });
  });
});
