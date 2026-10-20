import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

type Handler = (payload: unknown) => void;

/**
 * Barramento de eventos usado pelas notificações em tempo real (SSE).
 *
 * Com `REDIS_URL` configurada, publica/assina via Redis pub/sub para que
 * eventos cheguem a clientes conectados em qualquer instância da API. Sem
 * Redis (ou se a conexão falhar), opera em processo (fallback), mantendo a
 * mesma interface para os consumidores.
 */
@Injectable()
export class EventBusService implements OnModuleDestroy {
  private readonly logger = new Logger('EventBus');
  private readonly handlers = new Map<string, Set<Handler>>();
  private pub?: Redis;
  private sub?: Redis;
  private redisActive = false;
  private warned = false;

  private static readonly PREFIX = 'axium:bus:';

  constructor() {
    this.connect();
  }

  static channelForUser(userId: string) {
    return `user:${userId}`;
  }

  private connect() {
    const url = process.env.REDIS_URL;
    if (!url) return;
    const options = { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false };
    this.pub = new Redis(url, options);
    this.sub = new Redis(url, options);
    this.pub.on('error', (err) => this.onRedisError(err));
    this.sub.on('error', (err) => this.onRedisError(err));
    this.sub.on('message', (channel: string, message: string) => {
      if (!channel.startsWith(EventBusService.PREFIX)) return;
      try {
        this.dispatch(channel.slice(EventBusService.PREFIX.length), JSON.parse(message));
      } catch {
        this.logger.warn(`Evento inválido recebido do Redis no canal ${channel}`);
      }
    });

    Promise.all([this.pub.connect(), this.sub.connect()])
      .then(() => this.sub!.psubscribe(`${EventBusService.PREFIX}*`))
      .then(() => {
        this.redisActive = true;
        this.logger.log('Barramento de eventos usando Redis pub/sub');
      })
      .catch((err) => this.onRedisError(err));
  }

  private onRedisError(err: unknown) {
    this.redisActive = false;
    if (!this.warned) {
      this.warned = true;
      this.logger.warn(`Redis indisponível no barramento de eventos, usando modo local: ${err}`);
    }
  }

  publish(channel: string, payload: unknown) {
    if (this.redisActive && this.pub) {
      this.pub
        .publish(`${EventBusService.PREFIX}${channel}`, JSON.stringify(payload))
        .catch((err) => {
          this.onRedisError(err);
          this.dispatch(channel, payload);
        });
      return;
    }
    this.dispatch(channel, payload);
  }

  subscribe(channel: string, handler: Handler): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);
    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.handlers.delete(channel);
    };
  }

  private dispatch(channel: string, payload: unknown) {
    const set = this.handlers.get(channel);
    if (!set) return;
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (err) {
        this.logger.warn(`Falha ao entregar evento em ${channel}: ${err}`);
      }
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.pub?.quit(), this.sub?.quit()]);
  }
}
