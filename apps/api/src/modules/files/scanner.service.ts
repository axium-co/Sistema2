import { Injectable, Logger } from '@nestjs/common';
import { createConnection } from 'node:net';

export interface ScanVerdict {
  clean: boolean;
  reason?: string;
}

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.cpl',
  '.js', '.jse', '.vbs', '.vbe', '.wsf', '.wsh', '.ps1', '.psm1',
  '.msi', '.msp', '.dll', '.jar', '.app', '.sh', '.bin', '.gadget',
]);

/** Retorna a extensão perigosa encontrada no nome (final ou intermediária) ou null. */
export function dangerousExtension(name: string): string | null {
  const parts = name.toLowerCase().split('.');
  if (parts.length >= 2 && DANGEROUS_EXTENSIONS.has(`.${parts[parts.length - 1]}`)) {
    return `.${parts[parts.length - 1]}`;
  }
  for (let i = 1; i < parts.length - 1; i++) {
    if (DANGEROUS_EXTENSIONS.has(`.${parts[i]}`)) return `.${parts[i]}`;
  }
  return null;
}

/**
 * Verificação de arquivos enviados.
 *
 * Quando `CLAMAV_HOST` está definido, usa o protocolo INSTREAM do clamd para
 * escanear o conteúdo. Sempre executa antes a heurística local (magic bytes,
 * extensões executáveis, SVG ativo), que também serve de fallback quando o
 * antivírus está indisponível. Com `CLAMAV_STRICT=true`, a indisponibilidade do
 * clamd bloqueia o arquivo em vez de liberar pela heurística.
 *
 * `FILE_SCAN_ENABLED=false` desliga toda a verificação (arquivos seguem direto
 * para AVAILABLE) — útil para ambientes controlados.
 */
@Injectable()
export class ScannerService {
  private readonly logger = new Logger('FileScanner');
  private readonly enabled = process.env.FILE_SCAN_ENABLED !== 'false';
  private readonly clamHost = process.env.CLAMAV_HOST;
  private readonly clamPort = Number(process.env.CLAMAV_PORT ?? 3310);
  private readonly clamStrict = process.env.CLAMAV_STRICT === 'true';

  async scan(buffer: Buffer, name: string, mimeType: string): Promise<ScanVerdict> {
    if (!this.enabled) return { clean: true };

    const heuristic = this.inspect(buffer, name, mimeType);
    if (!heuristic.clean) {
      this.logger.warn(`Arquivo potencialmente malicioso "${name}" (${mimeType}): ${heuristic.reason}`);
      return heuristic;
    }

    if (!this.clamHost) return heuristic;

    try {
      return await this.scanWithClamd(buffer, name);
    } catch (err) {
      if (this.clamStrict) {
        this.logger.error(`ClamAV indisponível para "${name}": ${err}`);
        return { clean: false, reason: 'verificação antivírus indisponível' };
      }
      this.logger.warn(`ClamAV indisponível para "${name}", mantendo verificação heurística: ${err}`);
      return heuristic;
    }
  }

  /** Envia o buffer via INSTREAM e interpreta a resposta do clamd. */
  private scanWithClamd(buffer: Buffer, name: string): Promise<ScanVerdict> {
    return new Promise<ScanVerdict>((resolve, reject) => {
      const socket = createConnection({ host: this.clamHost, port: this.clamPort });
      let response = '';
      let settled = false;
      const finish = (err: Error | null, verdict?: ScanVerdict) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        if (err) reject(err);
        else resolve(verdict!);
      };
      const timer = setTimeout(() => finish(new Error('timeout na conexão com o clamd')), 20000);

      socket.once('connect', () => {
        try {
          socket.write('zINSTREAM\0');
          const chunkSize = 64 * 1024;
          for (let offset = 0; offset < buffer.length; offset += chunkSize) {
            const chunk = buffer.subarray(offset, offset + chunkSize);
            const size = Buffer.alloc(4);
            size.writeUInt32BE(chunk.length, 0);
            socket.write(size);
            socket.write(chunk);
          }
          socket.write(Buffer.from([0, 0, 0, 0]));
        } catch (err) {
          finish(err as Error);
        }
      });

      socket.on('data', (data) => {
        response += data.toString('utf8');
        if (response.includes('\0') || /(OK|FOUND)\s*$/.test(response)) {
          finish(null, this.parseClamdResponse(response, name));
        }
      });
      socket.once('error', (err) => finish(err));
      socket.once('close', () => {
        if (!settled && response) finish(null, this.parseClamdResponse(response, name));
      });
    });
  }

  private parseClamdResponse(raw: string, name: string): ScanVerdict {
    const response = raw.replace(/\0/g, '').trim();
    if (/FOUND/i.test(response)) {
      const signature = response.replace(/^stream:\s*/i, '').replace(/\s*FOUND.*$/i, '').trim();
      this.logger.warn(`ClamAV detectou ameaça em "${name}": ${signature}`);
      return { clean: false, reason: `Assinatura detectada: ${signature || 'desconhecida'}` };
    }
    if (/\bOK\b/i.test(response)) return { clean: true };
    throw new Error(`resposta inesperada do clamd: ${response.slice(0, 120)}`);
  }

  private inspect(buffer: Buffer, name: string, mimeType: string): ScanVerdict {
    const dangerous = dangerousExtension(name);
    if (dangerous) {
      return { clean: false, reason: `Extensão de arquivo não permitida: ${dangerous}` };
    }

    const lower = name.toLowerCase();
    const parts = lower.split('.');

    const sig = (bytes: number[]) =>
      buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);
    const startsWith = (text: string) =>
      buffer.slice(0, text.length).toString('latin1') === text;

    const isPdf = startsWith('%PDF');
    const isPng = sig([0x89, 0x50, 0x4e, 0x47]);
    const isJpg = sig([0xff, 0xd8, 0xff]);
    const isGif = startsWith('GIF8');
    const isWebp = startsWith('RIFF') && buffer.slice(8, 12).toString('latin1') === 'WEBP';
    const isZip = sig([0x50, 0x4b, 0x03, 0x04]) || sig([0x50, 0x4b, 0x05, 0x06]);
    const isMz = sig([0x4d, 0x5a]);
    const isElf = sig([0x7f, 0x45, 0x4c, 0x46]);

    if (isMz || isElf) {
      return { clean: false, reason: 'Assinatura de executável detectada no conteúdo' };
    }

    if (mimeType.startsWith('image/')) {
      if (mimeType === 'image/svg+xml') {
        const text = buffer.slice(0, 8192).toString('utf8').toLowerCase();
        if (
          text.includes('<script') ||
          text.includes('javascript:') ||
          text.includes('<!entity') ||
          /\son\w+\s*=/.test(text)
        ) {
          return { clean: false, reason: 'SVG contém conteúdo ativo (script/evento)' };
        }
        return { clean: true };
      }
      const matches =
        (mimeType === 'image/png' && isPng) ||
        (mimeType === 'image/jpeg' && isJpg) ||
        (mimeType === 'image/gif' && isGif) ||
        (mimeType === 'image/webp' && isWebp);
      if (!matches) {
        return { clean: false, reason: 'Conteúdo não corresponde ao tipo de imagem declarado' };
      }
      return { clean: true };
    }

    if (mimeType === 'application/pdf' && !isPdf) {
      return { clean: false, reason: 'Conteúdo não é um PDF válido' };
    }

    const zipBased =
      mimeType === 'application/zip' ||
      mimeType.includes('openxmlformats') ||
      mimeType.includes('officedocument');
    if (zipBased && !isZip) {
      return { clean: false, reason: 'Conteúdo não corresponde ao arquivo declarado' };
    }

    return { clean: true };
  }
}
