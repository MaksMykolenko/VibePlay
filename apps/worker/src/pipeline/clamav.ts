/**
 * Minimal clamd INSTREAM client (no third-party dependency).
 * Protocol: zINSTREAM\0 then <4-byte BE length><chunk>... terminated by zero length.
 */
import { createReadStream } from 'node:fs';
import net from 'node:net';

export interface ScanResult {
  engine: string;
  result: 'clean' | 'infected' | 'error' | 'disabled';
  signature?: string;
  detail?: string;
}

export interface Scanner {
  readonly driver: 'clamav' | 'off';
  scanFile(path: string): Promise<ScanResult>;
  ping(): Promise<boolean>;
}

export function createClamAvScanner(host: string, port: number, timeoutMs = 120_000): Scanner {
  return {
    driver: 'clamav',
    async ping() {
      try {
        const reply = await sendCommand(host, port, 'zPING\0', 5_000);
        return reply.trim() === 'PONG';
      } catch {
        return false;
      }
    },
    async scanFile(filePath) {
      try {
        const reply = await new Promise<string>((resolve, reject) => {
          const socket = net.connect({ host, port });
          const chunks: Buffer[] = [];
          const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error('clamd scan timed out'));
          }, timeoutMs);

          socket.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
          socket.on('data', (d) => chunks.push(d));
          socket.on('close', () => {
            clearTimeout(timer);
            resolve(Buffer.concat(chunks).toString('utf8'));
          });

          socket.on('connect', () => {
            socket.write('zINSTREAM\0');
            const file = createReadStream(filePath, { highWaterMark: 64 * 1024 });
            file.on('data', (chunk: string | Buffer) => {
              const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              const size = Buffer.alloc(4);
              size.writeUInt32BE(buf.length, 0);
              socket.write(size);
              socket.write(buf);
            });
            file.on('end', () => {
              const zero = Buffer.alloc(4);
              socket.write(zero);
            });
            file.on('error', (err) => {
              clearTimeout(timer);
              socket.destroy();
              reject(err);
            });
          });
        });

        const text = reply.replaceAll('\0', '').trim();
        if (text.endsWith('OK')) return { engine: 'clamav', result: 'clean' };
        const found = text.match(/stream: (.+) FOUND/);
        if (found) return { engine: 'clamav', result: 'infected', signature: found[1] };
        return { engine: 'clamav', result: 'error', detail: text.slice(0, 200) };
      } catch (err) {
        return { engine: 'clamav', result: 'error', detail: (err as Error).message };
      }
    },
  };
}

/**
 * Explicitly disabled scanner. Allowed only outside production (enforced by
 * @vibeplay/config) and honestly recorded in the validation report.
 */
export function createDisabledScanner(): Scanner {
  return {
    driver: 'off',
    async ping() {
      return true;
    },
    async scanFile() {
      return { engine: 'none', result: 'disabled', detail: 'SCAN_DRIVER=off (non-production)' };
    },
  };
}

async function sendCommand(
  host: string,
  port: number,
  cmd: string,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('clamd command timed out'));
    }, timeoutMs);
    socket.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    socket.on('data', (d) => chunks.push(d));
    socket.on('close', () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks).toString('utf8').replaceAll('\0', ''));
    });
    socket.on('connect', () => socket.write(cmd));
  });
}
