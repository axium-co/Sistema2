import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { JWT_SECRET } from '../../common/auth';
import { TenantContext } from '../../common/tenant-context';

const AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar';

const STATUS_MAP: Record<string, string> = {
  confirmed: 'CONFIRMED',
  tentative: 'TENTATIVE',
  cancelled: 'CANCELLED',
};

/** Converte um evento do Google Calendar no payload de `Event` do AXIUM. */
export function mapGoogleEvent(item: any, calendarId: string, userId: string, tenantId: string) {
  const allDay = !item?.start?.dateTime;
  const startsAt = new Date(item?.start?.dateTime ?? item?.start?.date);
  const endsAt = new Date(item?.end?.dateTime ?? item?.end?.date ?? item?.start?.dateTime ?? item?.start?.date);
  if (Number.isNaN(startsAt.getTime())) return null;
  if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    endsAt.setTime(startsAt.getTime() + 30 * 60 * 1000);
  }
  return {
    tenantId,
    externalId: String(item.id),
    externalSource: 'google',
    title: item.summary?.trim() || '(sem título)',
    description: item.description ?? null,
    location: item.location ?? null,
    videoLink: item.hangoutLink ?? null,
    startsAt,
    endsAt,
    allDay,
    status: STATUS_MAP[item.status] ?? 'CONFIRMED',
    type: 'MEETING',
    calendarId,
    createdById: userId,
  };
}

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger(GoogleCalendarService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  get configured() {
    return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  private get redirectUri() {
    const base = process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3333}`;
    return process.env.GOOGLE_REDIRECT_URI ?? `${base}/api/integrations/google/callback`;
  }

  private async integration(userId?: string) {
    const uid = userId ?? TenantContext.get()?.userId;
    if (!uid) throw new BadRequestException('Usuário não identificado');
    return this.prisma.db.calendarIntegration.findFirst({ where: { userId: uid, provider: 'google' } });
  }

  async status() {
    const integration = await this.integration();
    return {
      configured: this.configured,
      connected: !!integration?.enabled,
      lastSyncAt: integration?.lastSyncAt ?? null,
      remoteCalendarId: integration?.remoteCalendarId ?? null,
    };
  }

  /**
   * Monta a URL de consentimento OAuth. Em modo simulado (sem credenciais)
   * devolve uma URL marcada com `mock=1` para que o front indique o estado.
   */
  authUrl() {
    const store = TenantContext.get();
    if (!store?.userId) throw new BadRequestException('Usuário não identificado');
    if (!this.configured) {
      return { mocked: true, url: `${this.redirectUri}?mock=1&state=${this.signState(store.userId, store.tenantId!)}` };
    }
    const state = this.signState(store.userId, store.tenantId!);
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    });
    return { mocked: false, url: `${AUTH_BASE}?${params.toString()}` };
  }

  private signState(userId: string, tenantId: string) {
    return jwt.sign({ userId, tenantId }, JWT_SECRET(), { expiresIn: '10m' });
  }

  /** Conclui o fluxo OAuth: troca o `code` por tokens e persiste a integração. */
  async handleCallback(code: string, state?: string) {
    if (!this.configured) {
      return { mocked: true, ok: true };
    }
    if (!code) throw new BadRequestException('Código de autorização ausente');
    if (!state) throw new BadRequestException('State ausente');
    let payload: { userId: string; tenantId: string };
    try {
      payload = jwt.verify(state, JWT_SECRET()) as any;
    } catch {
      throw new BadRequestException('State inválido ou expirado');
    }

    const tokens = await this.tokenRequest({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: this.redirectUri,
      grant_type: 'authorization_code',
    });

    return TenantContext.run({ ...(TenantContext.get() ?? {}), tenantId: payload.tenantId }, async () => {
      const calendarId = await this.fetchPrimaryCalendar(tokens.access_token).catch(() => 'primary');
      const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
      const existing = await this.prisma.db.calendarIntegration.findFirst({
        where: { userId: payload.userId, provider: 'google' },
      });
      const data = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? existing?.refreshToken ?? null,
        expiresAt,
        remoteCalendarId: calendarId,
        enabled: true,
      };
      if (existing) {
        await this.prisma.db.calendarIntegration.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.db.calendarIntegration.create({ data: { ...data, userId: payload.userId, provider: 'google' } });
      }
      await this.audit.log({ entityType: 'CalendarIntegration', entityId: payload.userId, action: 'CREATE' });
      return { ok: true };
    });
  }

  async disconnect() {
    const integration = await this.integration();
    if (integration) {
      await this.prisma.db.calendarIntegration.delete({ where: { id: integration.id } });
      await this.audit.log({ entityType: 'CalendarIntegration', entityId: integration.userId, action: 'DELETE' });
    }
    return { ok: true };
  }

  /** Sincroniza a agenda: importa eventos do Google e envia os locais pendentes. */
  async sync() {
    const store = TenantContext.get();
    if (!store?.userId) throw new BadRequestException('Usuário não identificado');
    const integration = await this.integration();
    if (!integration) throw new BadRequestException('Integração não conectada');

    if (!this.configured) {
      await this.touchSync(integration.id);
      return { mocked: true, imported: 0, updated: 0, exported: 0 };
    }

    const accessToken = await this.validAccessToken(integration);
    const calendarId = integration.remoteCalendarId ?? 'primary';

    const timeMin = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const url = `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&maxResults=250&timeMin=${timeMin}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new BadRequestException(`Falha ao consultar o Google Calendar (${res.status})`);
    const body: any = await res.json();

    const counts = await this.importEvents(body.items ?? []);
    const exported = await this.exportEvents(accessToken, calendarId);
    await this.touchSync(integration.id);

    return { mocked: false, ...counts, exported };
  }

  /**
   * Importa (upsert) eventos do Google para a agenda local. Idempotente via
   * `externalId`/`externalSource`. Exposto para testes sem rede.
   */
  async importEvents(items: any[]) {
    const store = TenantContext.get();
    if (!store?.tenantId || !store?.userId) throw new BadRequestException('Contexto ausente');
    if (!Array.isArray(items) || items.length === 0) return { imported: 0, updated: 0 };

    const calendarId = await this.localCalendarId(store.userId);
    let imported = 0;
    let updated = 0;

    for (const item of items) {
      if (!item?.id) continue;
      const data = mapGoogleEvent(item, calendarId, store.userId, store.tenantId);
      if (!data) continue;
      const existing = await this.prisma.db.event.findFirst({
        where: { externalSource: 'google', externalId: data.externalId },
      });
      if (existing) {
        const { tenantId, externalId, externalSource, ...rest } = data as any;
        await this.prisma.db.event.update({ where: { id: existing.id }, data: rest });
        updated += 1;
      } else {
        await this.prisma.db.event.create({ data });
        imported += 1;
      }
    }
    return { imported, updated };
  }

  /** Envia eventos locais ainda sem `externalId` para o Google (máx. 50). */
  private async exportEvents(accessToken: string, calendarId: string) {
    const store = TenantContext.get()!;
    const pending = await this.prisma.db.event.findMany({
      where: { externalId: null, deletedAt: null, recurrenceRule: null },
      orderBy: { startsAt: 'asc' },
      take: 50,
    });
    let exported = 0;
    for (const event of pending) {
      const res = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: event.title,
          description: event.description ?? undefined,
          location: event.location ?? undefined,
          start: { dateTime: new Date(event.startsAt).toISOString() },
          end: { dateTime: new Date(event.endsAt).toISOString() },
        }),
      });
      if (!res.ok) {
        this.logger.warn(`Falha ao exportar evento ${event.id} (${res.status})`);
        continue;
      }
      const created: any = await res.json();
      await this.prisma.db.event.update({
        where: { id: event.id },
        data: { externalId: String(created.id), externalSource: 'google' },
      });
      exported += 1;
    }
    void store;
    return exported;
  }

  private async localCalendarId(userId: string) {
    const existing = await this.prisma.db.calendar.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' } });
    if (existing) return existing.id;
    const created = await this.prisma.db.calendar.create({ data: { userId, name: 'Google Calendar', isDefault: true } });
    return created.id;
  }

  private async touchSync(integrationId: string) {
    await this.prisma.db.calendarIntegration.update({ where: { id: integrationId }, data: { lastSyncAt: new Date() } });
  }

  private async validAccessToken(integration: any) {
    const notExpired = integration.expiresAt && new Date(integration.expiresAt).getTime() > Date.now() + 60_000;
    if (notExpired && integration.accessToken) return integration.accessToken;
    if (!integration.refreshToken) throw new BadRequestException('Integração expirada; reconecte o Google Calendar');

    const tokens = await this.tokenRequest({
      refresh_token: integration.refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    });
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null;
    await this.prisma.db.calendarIntegration.update({
      where: { id: integration.id },
      data: { accessToken: tokens.access_token, expiresAt },
    });
    return tokens.access_token;
  }

  private async tokenRequest(payload: Record<string, any>) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(payload as any).toString(),
    });
    if (!res.ok) throw new BadRequestException('Falha ao autenticar com o Google');
    return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;
  }

  private async fetchPrimaryCalendar(accessToken: string) {
    const res = await fetch(`${CALENDAR_API}/calendars/primary`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return 'primary';
    const body: any = await res.json();
    return body.id ?? 'primary';
  }
}
