export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RecurrenceEnd = 'never' | 'count' | 'until';

export interface RecurrenceForm {
  freq: '' | RecurrenceFreq;
  interval: number;
  byDay: string[];
  end: RecurrenceEnd;
  count: number;
  until: string;
}

export const RECURRENCE_FREQ_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Não repetir' },
  { value: 'DAILY', label: 'Diariamente' },
  { value: 'WEEKLY', label: 'Semanalmente' },
  { value: 'MONTHLY', label: 'Mensalmente' },
  { value: 'YEARLY', label: 'Anualmente' },
];

export const WEEKDAY_OPTIONS: { value: string; label: string }[] = [
  { value: 'MO', label: 'seg' },
  { value: 'TU', label: 'ter' },
  { value: 'WE', label: 'qua' },
  { value: 'TH', label: 'qui' },
  { value: 'FR', label: 'sex' },
  { value: 'SA', label: 'sáb' },
  { value: 'SU', label: 'dom' },
];

export const RECURRENCE_END_OPTIONS: { value: RecurrenceEnd; label: string }[] = [
  { value: 'never', label: 'Sempre' },
  { value: 'count', label: 'Após N vezes' },
  { value: 'until', label: 'Até uma data' },
];

const FREQ_UNITS: Record<RecurrenceFreq, [string, string]> = {
  DAILY: ['dia', 'dias'],
  WEEKLY: ['semana', 'semanas'],
  MONTHLY: ['mês', 'meses'],
  YEARLY: ['ano', 'anos'],
};

const FREQ_BASE_LABELS: Record<RecurrenceFreq, string> = {
  DAILY: 'Diariamente',
  WEEKLY: 'Semanalmente',
  MONTHLY: 'Mensalmente',
  YEARLY: 'Anualmente',
};

/**
 * Dia da semana (RRule: MO..SU) no fuso UTC — o backend monta o DTSTART em UTC,
 * então o BYDAY precisa seguir o mesmo calendário para a série bater com o início.
 */
export function weekdayCode(date: Date) {
  return ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][date.getUTCDay()];
}

export function defaultRecurrenceFields() {
  return {
    interval: 1,
    byDay: [] as string[],
    end: 'never' as RecurrenceEnd,
    count: 10,
    until: '',
  };
}

function sortWeekdays(codes: string[]) {
  const order = WEEKDAY_OPTIONS.map((w) => w.value);
  return [...codes].sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Monta a string RRULE a partir dos campos do formulário (ou `null` se não repete). */
export function buildRecurrenceRule(
  form: Pick<RecurrenceForm, 'freq' | 'interval' | 'byDay' | 'end' | 'count' | 'until'>,
): string | null {
  if (!form.freq) return null;
  const parts = [`FREQ=${form.freq}`];
  const interval = Math.max(1, Number(form.interval) || 1);
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (form.freq === 'WEEKLY' && form.byDay?.length) {
    parts.push(`BYDAY=${sortWeekdays(form.byDay).join(',')}`);
  }
  if (form.end === 'count') {
    parts.push(`COUNT=${Math.max(1, Number(form.count) || 1)}`);
  } else if (form.end === 'until' && form.until) {
    parts.push(`UNTIL=${form.until.replace(/-/g, '')}T235959Z`);
  }
  return parts.join(';');
}

/** Faz o parsing de uma RRULE armazenada de volta para os campos do formulário. */
export function parseRecurrenceRule(rule?: string | null): RecurrenceForm {
  const form: RecurrenceForm = { freq: '', ...defaultRecurrenceFields() };
  if (!rule) return form;
  const body = String(rule).replace(/^RRULE:/i, '');
  for (const part of body.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim().toUpperCase();
    const value = part.slice(eq + 1).trim();
    if (key === 'FREQ') {
      const freq = value.toUpperCase();
      if (freq === 'DAILY' || freq === 'WEEKLY' || freq === 'MONTHLY' || freq === 'YEARLY') form.freq = freq;
    } else if (key === 'INTERVAL') {
      form.interval = Math.max(1, parseInt(value, 10) || 1);
    } else if (key === 'BYDAY') {
      form.byDay = value
        .split(',')
        .map((d) => d.trim().toUpperCase())
        .filter((d) => WEEKDAY_OPTIONS.some((w) => w.value === d));
    } else if (key === 'COUNT') {
      form.end = 'count';
      form.count = Math.max(1, parseInt(value, 10) || 1);
    } else if (key === 'UNTIL') {
      form.end = 'until';
      form.until = value.length >= 8 ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}` : '';
    }
  }
  return form;
}

/** Unidade do intervalo no singular/plural ("dia"/"dias"...) para exibição. */
export function intervalUnit(freq: '' | RecurrenceFreq, interval: number): string {
  if (!freq) return '';
  const [one, many] = FREQ_UNITS[freq];
  return Math.max(1, interval) === 1 ? one : many;
}

/** Descreve uma RRULE em pt-BR para exibição (badge, resumo do formulário). */
export function describeRecurrence(rule?: string | null): string | null {
  const form = parseRecurrenceRule(rule);
  if (!form.freq) return null;
  const [unitOne, unitMany] = FREQ_UNITS[form.freq];
  const interval = Math.max(1, form.interval);
  let text =
    interval > 1
      ? `A cada ${interval} ${interval === 1 ? unitOne : unitMany}`
      : FREQ_BASE_LABELS[form.freq];
  if (form.freq === 'WEEKLY' && form.byDay.length) {
    text += ` (${form.byDay.map((c) => WEEKDAY_OPTIONS.find((w) => w.value === c)?.label ?? c).join(', ')})`;
  }
  if (form.end === 'count') text += ` · ${form.count} ${form.count === 1 ? 'vez' : 'vezes'}`;
  if (form.end === 'until' && form.until) {
    const [y, m, d] = form.until.split('-');
    text += ` · até ${d}/${m}/${y}`;
  }
  return text;
}
