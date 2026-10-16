import { BadRequestException, Injectable } from '@nestjs/common';
import { generate, generateSecret, generateURI, verify } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';

const ISSUER = 'AXIUM';

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Gera um segredo e devolve o QR Code. O 2FA só é ativado após confirmação. */
  async setup(userId: string, email: string) {
    const secret = generateSecret();
    const otpauthUrl = generateURI({ issuer: ISSUER, label: email, secret });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret, twoFactorEnabled: false },
    });

    return { secret, otpauthUrl, qrDataUrl };
  }

  async enable(userId: string, code: string) {
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { twoFactorSecret: true },
    });
    if (!user?.twoFactorSecret) {
      throw new BadRequestException('Inicie a configuração do 2FA antes de ativar');
    }
    if (!(await this.check(user.twoFactorSecret, code))) {
      throw new BadRequestException('Código inválido. Verifique o aplicativo autenticador.');
    }
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, twoFactorConfirmedAt: new Date() },
    });
    await this.audit.log({ entityType: 'User', entityId: userId, action: '2FA_ENABLE', actorId: userId });
    return { enabled: true };
  }

  async disable(userId: string, code?: string) {
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { twoFactorEnabled: true, twoFactorSecret: true },
    });
    if (!user) throw new BadRequestException('Usuário não encontrado');
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!code || !(await this.check(user.twoFactorSecret, code))) {
        throw new BadRequestException('Informe um código válido para desativar o 2FA');
      }
    }
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorConfirmedAt: null },
    });
    await this.audit.log({ entityType: 'User', entityId: userId, action: '2FA_DISABLE', actorId: userId });
    return { enabled: false };
  }

  /** Reset administrativo: usado quando o usuário perde o dispositivo. */
  async resetFor(targetUserId: string, actorId: string) {
    await this.prisma.db.user.update({
      where: { id: targetUserId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorConfirmedAt: null },
    });
    await this.audit.log({
      entityType: 'User',
      entityId: targetUserId,
      action: '2FA_RESET',
      actorId,
    });
    return { ok: true };
  }

  async check(secret: string, code: string): Promise<boolean> {
    const token = (code ?? '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(token)) return false;
    try {
      const result = await verify({ secret, token, epochTolerance: 30 });
      return Boolean(result?.valid);
    } catch {
      return false;
    }
  }

  /** Utilizado nos testes/CLI para gerar um código atual. */
  currentCode(secret: string) {
    return generate({ secret });
  }
}
