import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SocketClient } from '../../src/socket-client.js';
import * as net from 'net';

vi.mock('net', async (importOriginal) => {
  const actual = await importOriginal<typeof net>();
  return {
    ...actual,
    createConnection: vi.fn()
  };
});

describe('SocketClient', () => {
  let mockSocket: any;
  let dataCallback: any;
  let connectCallback: any;
  let errorCallback: any;

  beforeEach(() => {
    // Create fresh mock socket for each test
    mockSocket = {
      on: vi.fn((event: string, callback: (...args: any[]) => void) => {
        if (event === 'data') {
          dataCallback = callback;
        } else if (event === 'connect') {
          connectCallback = callback;
        } else if (event === 'error') {
          errorCallback = callback;
        }
        return mockSocket;
      }),
      write: vi.fn((data: string, cb?: (err?: Error) => void) => {
        cb?.();
      }),
      end: vi.fn(),
      destroy: vi.fn()
    };

    (net.createConnection as any).mockReturnValue(mockSocket);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('sendCommand', () => {
    it('should format request with id field', async () => {
      const client = new SocketClient({ session: 'test', timeout: 5000 });

      // Simulate connection
      process.nextTick(() => {
        connectCallback();
      });

      await client.connect();

      // Mock response
      process.nextTick(() => {
        dataCallback('{"id":"1","success":true,"data":{"test":"value"}}\n');
      });

      const response = await client.send({ action: 'metadata', server: 'test' });

      expect(response.id).toBe('1');
      expect(response.success).toBe(true);
      expect(response.data).toEqual({ test: 'value' });

      await client.disconnect();
    });

    it('should parse newline-delimited JSON response', async () => {
      const client = new SocketClient({ session: 'test', timeout: 5000 });

      process.nextTick(() => {
        connectCallback();
      });

      await client.connect();

      // Multiple responses
      process.nextTick(() => {
        dataCallback('{"id":"1","success":true}\n{"id":"2","success":false}\n');
      });

      const response = await client.send({ action: 'test' });

      expect(response.success).toBe(true);
      expect(response.id).toBe('1');

      await client.disconnect();
    });

    it('should extract success and data fields from response', async () => {
      const client = new SocketClient({ session: 'test', timeout: 5000 });

      process.nextTick(() => {
        connectCallback();
      });

      await client.connect();

      process.nextTick(() => {
        dataCallback('{"id":"1","success":true,"data":{"name":"test-server"}}\n');
      });

      const response = await client.send({ action: 'metadata' });

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ name: 'test-server' });

      await client.disconnect();
    });

    it('should handle error response', async () => {
      const client = new SocketClient({ session: 'test', timeout: 5000 });

      process.nextTick(() => {
        connectCallback();
      });

      await client.connect();

      process.nextTick(() => {
        dataCallback('{"id":"1","success":false,"error":"Server not found"}\n');
      });

      const response = await client.send({ action: 'invalid' });

      expect(response.success).toBe(false);
      expect(response.error).toBe('Server not found');

      await client.disconnect();
    });
  });

  describe('Connection', () => {
    it('should connect to daemon', async () => {
      const client = new SocketClient({ session: 'test', timeout: 5000 });

      process.nextTick(() => {
        connectCallback();
      });

      await client.connect();

      expect(client.isConnected()).toBe(true);
      expect(net.createConnection).toHaveBeenCalled();

      await client.disconnect();
    });

    it('should handle connection error', async () => {
      const client = new SocketClient({ session: 'test', timeout: 5000 });

      process.nextTick(() => {
        errorCallback(new Error('Connection refused'));
      });

      await expect(client.connect()).rejects.toThrow('Failed to connect to daemon');
      expect(client.isConnected()).toBe(false);
    });

    it('should disconnect from daemon', async () => {
      const client = new SocketClient({ session: 'test', timeout: 5000 });

      process.nextTick(() => {
        connectCallback();
      });

      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();

      expect(client.isConnected()).toBe(false);
      expect(mockSocket.end).toHaveBeenCalled();
    });
  });
});
