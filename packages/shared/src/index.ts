export const ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'USER', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  OWNER: 5,
  ADMIN: 4,
  MANAGER: 3,
  USER: 2,
  VIEWER: 1,
};

export const MODULES = ['crm', 'agenda', 'rotina', 'tarefas', 'arquivos', 'config', 'relatorios'] as const;
export type ModuleName = (typeof MODULES)[number];

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'] as const;
export type ActionName = (typeof ACTIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, Record<ModuleName, ActionName[]>> = {
  OWNER: {
    crm: ['view', 'create', 'edit', 'delete', 'export'],
    agenda: ['view', 'create', 'edit', 'delete', 'export'],
    rotina: ['view', 'create', 'edit', 'delete', 'export'],
    tarefas: ['view', 'create', 'edit', 'delete', 'export'],
    arquivos: ['view', 'create', 'edit', 'delete', 'export'],
    config: ['view', 'create', 'edit', 'delete', 'export'],
    relatorios: ['view', 'create', 'edit', 'delete', 'export'],
  },
  ADMIN: {
    crm: ['view', 'create', 'edit', 'delete', 'export'],
    agenda: ['view', 'create', 'edit', 'delete', 'export'],
    rotina: ['view', 'create', 'edit', 'delete', 'export'],
    tarefas: ['view', 'create', 'edit', 'delete', 'export'],
    arquivos: ['view', 'create', 'edit', 'delete', 'export'],
    config: ['view', 'create', 'edit', 'delete', 'export'],
    relatorios: ['view', 'create', 'edit', 'delete', 'export'],
  },
  MANAGER: {
    crm: ['view', 'create', 'edit', 'delete', 'export'],
    agenda: ['view', 'create', 'edit', 'delete'],
    rotina: ['view', 'create', 'edit', 'delete'],
    tarefas: ['view', 'create', 'edit', 'delete'],
    arquivos: ['view', 'create', 'edit', 'delete'],
    config: ['view'],
    relatorios: ['view', 'export'],
  },
  USER: {
    crm: ['view', 'create', 'edit'],
    agenda: ['view', 'create', 'edit'],
    rotina: ['view', 'create', 'edit', 'delete'],
    tarefas: ['view', 'create', 'edit'],
    arquivos: ['view', 'create', 'edit'],
    config: ['view'],
    relatorios: ['view'],
  },
  VIEWER: {
    crm: ['view'],
    agenda: ['view'],
    rotina: ['view'],
    tarefas: ['view'],
    arquivos: ['view'],
    config: [],
    relatorios: ['view'],
  },
};

export function can(role: Role, module: ModuleName, action: ActionName): boolean {
  return ROLE_PERMISSIONS[role]?.[module]?.includes(action) ?? false;
}

export const ACTIVITY_TYPES = ['CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'VISIT', 'NOTE'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const DEAL_STATUSES = ['ABERTO', 'GANHO', 'PERDIDO'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const LEAD_STATUSES = ['NOVO', 'CONTATADO', 'QUALIFICADO', 'CONVERTIDO', 'PERDIDO'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const EVENT_TYPES = ['MEETING', 'CALL', 'VISIT', 'FOLLOWUP', 'REMINDER', 'BLOCK'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

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

export const ROUTINE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'] as const;
export type RoutineFrequency = (typeof ROUTINE_FREQUENCIES)[number];

export const ROUTINE_FREQUENCY_LABELS: Record<RoutineFrequency, string> = {
  DAILY: 'Diária',
  WEEKLY: 'Semanal',
  MONTHLY: 'Mensal',
  CUSTOM: 'Personalizada',
};

/** Dias da semana no padrão RRULE/JS (0 = domingo). */
export const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  SUN: 'Dom',
  MON: 'Seg',
  TUE: 'Ter',
  WED: 'Qua',
  THU: 'Qui',
  FRI: 'Sex',
  SAT: 'Sáb',
};

export const ROUTINE_RUN_STATUSES = ['PENDING', 'DONE', 'SKIPPED'] as const;
export type RoutineRunStatus = (typeof ROUTINE_RUN_STATUSES)[number];
export const ROUTINE_RUN_STATUS_LABELS: Record<RoutineRunStatus, string> = {
  PENDING: 'Pendente',
  DONE: 'Concluída',
  SKIPPED: 'Pulada',
};

export const FOCUS_DEFAULT_MINUTES = 25;
export const FOCUS_BREAK_MINUTES = 5;
export const FOCUS_MAX_MINUTES = 180;

export const TIME_BLOCK_COLORS = ['#7C9CBF', '#8FBF9F', '#BFA27C', '#A89BC9', '#C9A69B', '#71717A'] as const;
export const DEFAULT_TIME_BLOCK_COLOR = '#7C9CBF';

export const NOTIFICATION_TYPES = [
  'MENTION',
  'ASSIGNMENT',
  'DUE',
  'REMINDER',
  'LEAD_NEW',
  'DEAL_MOVED',
  'SYSTEM',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const FILE_STATUSES = ['UPLOADING', 'SCANNING', 'AVAILABLE', 'QUARANTINED', 'DELETED'] as const;
export type FileStatus = (typeof FILE_STATUSES)[number];

export const FILE_STATUS_LABELS: Record<FileStatus, string> = {
  UPLOADING: 'Enviando',
  SCANNING: 'Verificando segurança',
  AVAILABLE: 'Disponível',
  QUARANTINED: 'Em quarentena',
  DELETED: 'Excluído',
};

export const MAX_FILE_SIZE_MB = 100;

export const PRIORITY_LABELS: Record<CardPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  CALL: 'Ligação',
  MEETING: 'Reunião',
  EMAIL: 'E-mail',
  WHATSAPP: 'WhatsApp',
  VISIT: 'Visita',
  NOTE: 'Nota',
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  MEETING: 'Reunião',
  CALL: 'Ligação',
  VISIT: 'Visita',
  FOLLOWUP: 'Follow-up',
  REMINDER: 'Lembrete',
  BLOCK: 'Bloqueio pessoal',
};

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NOVO: 'Novo',
  CONTATADO: 'Contatado',
  QUALIFICADO: 'Qualificado',
  CONVERTIDO: 'Convertido',
  PERDIDO: 'Perdido',
};
