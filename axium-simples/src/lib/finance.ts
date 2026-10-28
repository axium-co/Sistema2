import { dateKey } from './utils';

export function formatDateOnly(value: string | null | undefined) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}

export function todayDateKey() {
  return dateKey(new Date());
}

export function isPendingOverdue(entry: { status: string; due_date: string }) {
  return entry.status === 'PENDENTE' && entry.due_date.slice(0, 10) < todayDateKey();
}

export function monthKey(value: string) {
  return value.slice(0, 7);
}

export function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Date(year, month - 1, 1).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
  });
}

export function lastMonthKeys(count: number) {
  const now = new Date();
  const keys: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}
