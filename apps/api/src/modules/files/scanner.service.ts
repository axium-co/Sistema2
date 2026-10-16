import { Injectable, Logger } from '@nestjs/common';

export interface ScanVerdict {
  clean: boolean;
  reason?: string;
}

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.cpl',
  '.js', '.jse', '.vbs', '.vbe', '.wsf', '.wsh', '.ps1', '.psm1',
  '.msi', '.msp', '.dll', '.jar', '.app', '.sh', '.bin', '.gadget',
]);

/**
 * Verificação de arquivos enviados.
 *
 * Implementa uma análise heurística local (sem serviço externo): compara os
 * "magic bytes" do conteúdo com o tipo MIME declarado, bloqueia extensões
 * executáveis (inclusive dupla extensão) e inspeciona SVG em busca de conteúdo
 * ativo. Pode ser substituída por ClamAV/VirusTotal mantendo a interface.
 *
 * Variável de ambiente `FILE_SCAN_ENABLED=false` desliga o bloqueio (arquivos
 * seguem direto para AVAILABLE) — útil para ambientes controlados.
 */
@Injectable()
export class ScannerService {
  private readonly logger = new Logger('FileScanner');
  private readonly enabled = process.env.FILE_SCAN_ENABLED !== 'false';

  async scan(buffer: Buffer, name: string, mimeType: string): Promise<ScanVerdict> {
    if (!this.enabled) return { clean: true };
    const verdict = this.inspect(buffer, name, mimeType);
    if (!verdict.clean) {
      this.logger.warn(`Arquivo potencialmente malicioso "${name}" (${mimeType}): ${verdict.reason}`);
    }
    return verdict;
  }

  private inspect(buffer: Buffer, name: string, mimeType: string): ScanVerdict {
    const lower = name.toLowerCase();
    const parts = lower.split('.');

    if (parts.length >= 2 && DANGEROUS_EXTENSIONS.has(`.${parts[parts.length - 1]}`)) {
      return { clean: false, reason: `Extensão de arquivo não permitida: .${parts[parts.length - 1]}` };
    }
    for (let i = 1; i < parts.length - 1; i++) {
      if (DANGEROUS_EXTENSIONS.has(`.${parts[i]}`)) {
        return { clean: false, reason: `Extensão dupla suspeita (.${parts[i]} seguido de ${parts[parts.length - 1]})` };
      }
    }

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
