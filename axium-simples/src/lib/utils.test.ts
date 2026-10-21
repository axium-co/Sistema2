import { describe, expect, it } from 'vitest';
import { brl, initials, isOverdue, toDateInput } from './utils';

describe('utils', () => {
  it('formata valores em BRL', () => {
    expect(brl(1234.5)).toContain('1.234');
    expect(brl(null)).toContain('0,00');
  });

  it('gera iniciais a partir do nome', () => {
    expect(initials('Ana Paula Souza')).toBe('AP');
    expect(initials('  ')).toBe('');
  });

  it('detecta prazo vencido', () => {
    expect(isOverdue('2020-01-01T00:00:00Z')).toBe(true);
    expect(isOverdue('2999-01-01T00:00:00Z')).toBe(false);
    expect(isOverdue(null)).toBe(false);
  });

  it('converte data para o input datetime-local', () => {
    expect(toDateInput('2026-03-05T10:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(toDateInput(undefined)).toBe('');
  });
});
