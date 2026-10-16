import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

type Handler = (payload: unknown) => void;

/**
 * Barramento de eventos em processo usado para notificações em tempo real (SSE).
 * Simples e sem dependências externas; se o projeto crescer para múltiplas
 * instâncias, pode ser trocado por Redis pub/sub mantendo a mesma interface.
 */
@Injectable()
export class EventBusService {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  static channelForUser(userId: string) {
    return `user:${userId}`;
  }

  publish(channel: string, payload: unknown) {
    this.emitter.emit(channel, payload);
  }

  subscribe(channel: string, handler: Handler): () => void {
    this.emitter.on(channel, handler);
    return () => this.emitter.off(channel, handler);
  }
}
