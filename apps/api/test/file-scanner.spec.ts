import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:net';
import { ScannerService } from '../src/modules/files/scanner.service';

/**
 * Integração com o clamd (protocolo INSTREAM), usando um servidor TCP falso —
 * não é necessário subir o container para exercitar o fluxo.
 */
describe('ScannerService + ClamAV', () => {
  let server: Server;
  let port: number;
  let received = Buffer.alloc(0);
  let reply = 'stream: OK\0';

  const originalHost = process.env.CLAMAV_HOST;
  const originalPort = process.env.CLAMAV_PORT;
  const originalStrict = process.env.CLAMAV_STRICT;

  const useClamd = (p: number) => {
    process.env.CLAMAV_HOST = '127.0.0.1';
    process.env.CLAMAV_PORT = String(p);
  };

  beforeAll(async () => {
    server = createServer((socket) => {
      let data = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        data = Buffer.concat([data, chunk]);
        const header = data.indexOf('zINSTREAM\0');
        if (header < 0) return;
        const body = data.subarray(header + 'zINSTREAM\0'.length);
        let offset = 0;
        let ended = false;
        while (offset + 4 <= body.length) {
          const size = body.readUInt32BE(offset);
          if (size === 0) {
            ended = true;
            break;
          }
          if (offset + 4 + size > body.length) break;
          received = Buffer.concat([received, body.subarray(offset + 4, offset + 4 + size)]);
          offset += 4 + size;
        }
        if (ended) socket.write(reply);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterEach(() => {
    received = Buffer.alloc(0);
    reply = 'stream: OK\0';
    process.env.CLAMAV_HOST = originalHost;
    process.env.CLAMAV_PORT = originalPort;
    process.env.CLAMAV_STRICT = originalStrict;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('envia o conteúdo via INSTREAM e aceita arquivo limpo', async () => {
    useClamd(port);
    const scanner = new ScannerService();
    const verdict = await scanner.scan(Buffer.from('conteudo de teste'), 'nota.txt', 'text/plain');
    expect(verdict.clean).toBe(true);
    expect(received.toString()).toBe('conteudo de teste');
  });

  it('bloqueia arquivo quando o clamd detecta assinatura', async () => {
    useClamd(port);
    reply = 'stream: Eicar-Test-Signature FOUND\0';
    const scanner = new ScannerService();
    const verdict = await scanner.scan(Buffer.from('X5O!P%@AP'), 'eicar.txt', 'text/plain');
    expect(verdict.clean).toBe(false);
    expect(verdict.reason).toContain('Eicar-Test-Signature');
  });

  it('mantém a heurística local quando o clamd está indisponível', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const closedPort = (closed.address() as { port: number }).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    useClamd(closedPort);
    const scanner = new ScannerService();
    const verdict = await scanner.scan(Buffer.from('ok'), 'nota.txt', 'text/plain');
    expect(verdict.clean).toBe(true);
  });

  it('bloqueia por indisponibilidade do clamd quando CLAMAV_STRICT=true', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const closedPort = (closed.address() as { port: number }).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));

    useClamd(closedPort);
    process.env.CLAMAV_STRICT = 'true';
    const scanner = new ScannerService();
    const verdict = await scanner.scan(Buffer.from('ok'), 'nota.txt', 'text/plain');
    expect(verdict.clean).toBe(false);
    expect(verdict.reason).toContain('indisponível');
  });

  it('bloqueia executáveis pela heurística mesmo sem clamd', async () => {
    delete process.env.CLAMAV_HOST;
    const scanner = new ScannerService();
    const verdict = await scanner.scan(Buffer.from('MZ...'), 'setup.exe', 'application/pdf');
    expect(verdict.clean).toBe(false);
  });
});
