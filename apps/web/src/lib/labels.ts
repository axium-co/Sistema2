export {
  ACTIVITY_LABELS,
  LEAD_STATUS_LABELS,
  EVENT_TYPES,
  ACTIVITY_TYPES,
  CARD_PRIORITIES,
  LEAD_STATUSES,
  DEAL_STATUSES,
  ROLES,
  can,
  ROUTINE_FREQUENCY_LABELS,
  ROUTINE_FREQUENCIES,
  WEEKDAY_LABELS,
  WEEKDAYS,
  TIME_BLOCK_COLORS,
  DEFAULT_TIME_BLOCK_COLOR,
  FOCUS_DEFAULT_MINUTES,
  FOCUS_BREAK_MINUTES,
  FOCUS_MAX_MINUTES,
  FILE_STATUSES,
  FILE_STATUS_LABELS,
  PLANS,
  planByCode,
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
} from '@axium/shared';

export type {
  EventType,
  ActivityType,
  CardPriority,
  LeadStatus,
  DealStatus,
  Role,
  RoutineFrequency,
  Weekday,
  PlanCode,
  SubscriptionStatus,
} from '@axium/shared';

import {
  EVENT_TYPE_COLORS,
  PRIORITY_LABELS as SHARED_PRIORITY_LABELS,
  EVENT_TYPE_LABELS as SHARED_EVENT_TYPE_LABELS,
} from '@axium/shared';

export const EVENT_COLORS = EVENT_TYPE_COLORS as Record<string, string>;

export const PRIORITY_LABELS = SHARED_PRIORITY_LABELS as Record<string, string>;

export const EVENT_TYPE_LABELS = SHARED_EVENT_TYPE_LABELS as Record<string, string>;

export const DEAL_STATUS_LABELS: Record<string, string> = {
  ABERTO: 'Em aberto',
  GANHO: 'Ganho',
  PERDIDO: 'Perdido',
};

export const CARD_PRIORITY_COLORS: Record<string, string> = {
  LOW: '#71717A',
  MEDIUM: '#7C9CBF',
  HIGH: '#BFA27C',
  URGENT: '#C98B8B',
};

export const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  MANAGER: 'Gerente',
  USER: 'Usuário',
  VIEWER: 'Visualizador',
};

export { brl, formatDate, formatTime, initials, isOverdue, toDateInput } from './utils';
