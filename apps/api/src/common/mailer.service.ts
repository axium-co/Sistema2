import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Envio de e-mail do AXIUM.
 *
 * Com `SMTP_HOST` configurado usa SMTP real (nodemailer). Sem SMTP, opera em
 * modo "console": registra a mensagem no log e sinaliza `mocked: true`, o que
 * mantém convites e avisos funcionais em desenvolvimento/testes sem depender
 * de um servidor de e-mail.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger('Mailer');
  private transporter?: Transporter;

  get enabled(): boolean {
    return Boolean(process.env.SMTP_HOST);
  }

  private getTransporter(): Transporter | null {
    if (!process.env.SMTP_HOST) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      });
    }
    return this.transporter;
  }

  async send(message: MailMessage): Promise<{ delivered: boolean; mocked: boolean }> {
    const from = process.env.MAIL_FROM ?? 'AXIUM <nao-responder@axium.local>';
    const transport = this.getTransporter();
    if (!transport) {
      this.logger.log(
        `[dev-mail] para=${message.to} assunto="${message.subject}"\n${message.text ?? message.html}`,
      );
      return { delivered: false, mocked: true };
    }
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    return { delivered: true, mocked: false };
  }

  sendInvitation(params: {
    to: string;
    name?: string | null;
    tenantName: string;
    role: string;
    inviteUrl: string;
    expiresAt: Date;
  }) {
    const greeting = params.name ? `Olá, ${params.name}!` : 'Olá!';
    const html = `
      <div style="font-family:Inter,Arial,sans-serif;background:#0A0A0A;color:#FAFAFA;padding:32px">
        <h1 style="font-size:20px;margin:0 0 12px">Convite para ${params.tenantName}</h1>
        <p style="color:#A1A1AA;font-size:14px;line-height:1.6">${greeting} Você foi convidado(a) para acessar o AXIUM como <strong>${params.role}</strong>.</p>
        <p style="margin:24px 0">
          <a href="${params.inviteUrl}" style="background:#FAFAFA;color:#0A0A0A;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;font-size:14px">Aceitar convite</a>
        </p>
        <p style="color:#71717A;font-size:12px">Ou copie este link: ${params.inviteUrl}</p>
        <p style="color:#71717A;font-size:12px">Este convite expira em ${params.expiresAt.toLocaleDateString('pt-BR')}.</p>
      </div>`;
    return this.send({
      to: params.to,
      subject: `Convite para acessar ${params.tenantName} no AXIUM`,
      html,
      text: `${greeting} Aceite o convite para ${params.tenantName} (${params.role}): ${params.inviteUrl}`,
    });
  }
}
