/**
 * Constantes compartilhadas do AXIUM Interno.
 * Cópia enxuta de `packages/shared` do monorepo antigo (que não é usado aqui).
 */

export const ROLES = ['ADMIN', 'MEMBER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  MEMBER: 'Membro',
};

export const ACTIVITY_TYPES = ['CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'VISIT', 'NOTE'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  CALL: 'Ligação',
  MEETING: 'Reunião',
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
  VISIT: 'Visita',
  NOTE: 'Nota',
};

export const DEAL_STATUSES = ['ABERTO', 'GANHO', 'PERDIDO'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  ABERTO: 'Em aberto',
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
};

export const EVENT_TYPES = ['MEETING', 'CALL', 'VISIT', 'FOLLOWUP', 'REMINDER', 'BLOCK'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  MEETING: 'Reunião',
  CALL: 'Ligação',
  VISIT: 'Visita',
  FOLLOWUP: 'Follow-up',
  REMINDER: 'Lembrete',
  BLOCK: 'Bloqueio pessoal',
};

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  MEETING: '#7C9CBF',
  CALL: '#8FBF9F',
  VISIT: '#BFA27C',
  FOLLOWUP: '#A89BC9',
  REMINDER: '#C9A69B',
  BLOCK: '#71717A',
};

export const CARD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type CardPriority = (typeof CARD_PRIORITIES)[number];

export const PRIORITY_LABELS: Record<CardPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const CARD_PRIORITY_COLORS: Record<CardPriority, string> = {
  LOW: '#71717A',
  MEDIUM: '#7C9CBF',
  HIGH: '#BFA27C',
  URGENT: '#C98B8B',
};

export const ROUTINE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
export type RoutineFrequency = (typeof ROUTINE_FREQUENCIES)[number];

export const ROUTINE_FREQUENCY_LABELS: Record<RoutineFrequency, string> = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  CUSTOM: 'Personalizada',
};

/** Limite de upload (MB). */
export const MAX_FILE_SIZE_MB = 25;
