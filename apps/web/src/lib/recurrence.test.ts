import { describe, expect, it } from 'vitest';
import {
  buildRecurrenceRule,
  defaultRecurrenceFields,
  describeRecurrence,
  intervalUnit,
  parseRecurrenceRule,
  weekdayCode,
} from './recurrence';

describe('buildRecurrenceRule', () => {
  it('retorna null quando não há repetição', () => {
    expect(buildRecurrenceRule({ freq: '', interval: 1, byDay: [], end: 'never', count: 10, until: '' })).toBeNull();
  });

  it('monta regras simples omitindo INTERVAL=1', () => {
    expect(buildRecurrenceRule({ freq: 'DAILY', interval: 1, byDay: [], end: 'never', count: 10, until: '' })).toBe('FREQ=DAILY');
    expect(buildRecurrenceRule({ freq: 'WEEKLY', interval: 2, byDay: [], end: 'never', count: 10, until: '' })).toBe('FREQ=WEEKLY;INTERVAL=2');
  });

  it('ordena BYDAY e só aplica em semanais', () => {
    const weekly = buildRecurrenceRule({ freq: 'WEEKLY', interval: 1, byDay: ['WE', 'MO'], end: 'never', count: 10, until: '' });
    expect(weekly).toBe('FREQ=WEEKLY;BYDAY=MO,WE');

    const daily = buildRecurrenceRule({ freq: 'DAILY', interval: 1, byDay: ['MO'], end: 'never', count: 10, until: '' });
    expect(daily).toBe('FREQ=DAILY');
  });

  it('gera COUNT e UNTIL conforme o fim escolhido', () => {
    expect(buildRecurrenceRule({ freq: 'DAILY', interval: 1, byDay: [], end: 'count', count: 5, until: '' })).toBe('FREQ=DAILY;COUNT=5');
    expect(buildRecurrenceRule({ freq: 'DAILY', interval: 1, byDay: [], end: 'until', count: 5, until: '2027-03-15' })).toBe(
      'FREQ=DAILY;UNTIL=20270315T235959Z',
    );
  });
});

describe('parseRecurrenceRule', () => {
  it('faz o round-trip de regras completas', () => {
    const rule = 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4';
    const form = parseRecurrenceRule(rule);
    expect(form).toMatchObject({ freq: 'WEEKLY', interval: 2, byDay: ['MO', 'WE'], end: 'count', count: 4 });
    expect(buildRecurrenceRule(form)).toBe(rule);
  });

  it('ignora FREQ inválido e chaves desconhecidas', () => {
    const form = parseRecurrenceRule('FREQ=BIWEEKLY;FOO=BAR');
    expect(form.freq).toBe('');

    const unknown = parseRecurrenceRule('FREQ=DAILY;BYSETPOS=1;BYDAY=XX,MO');
    expect(unknown.byDay).toEqual(['MO']);
  });

  it('aceita prefixo RRULE: e UNTIL em formato compacto', () => {
    const form = parseRecurrenceRule('RRULE:FREQ=MONTHLY;UNTIL=20271231T235959Z');
    expect(form.freq).toBe('MONTHLY');
    expect(form).toMatchObject({ end: 'until', until: '2027-12-31' });
  });

  it('form vazio quando a regra é nula', () => {
    expect(parseRecurrenceRule(null)).toEqual({ freq: '', ...defaultRecurrenceFields() });
  });
});

describe('describeRecurrence', () => {
  it('descreve frequência simples e intervalo', () => {
    expect(describeRecurrence('FREQ=DAILY')).toBe('Diariamente');
    expect(describeRecurrence('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR')).toBe('A cada 2 semanas (seg, sex)');
  });

  it('inclui fim por contagem ou data', () => {
    expect(describeRecurrence('FREQ=DAILY;COUNT=1')).toBe('Diariamente · 1 vez');
    expect(describeRecurrence('FREQ=DAILY;COUNT=10')).toBe('Diariamente · 10 vezes');
    expect(describeRecurrence('FREQ=DAILY;UNTIL=20270315T235959Z')).toBe('Diariamente · até 15/03/2027');
  });

  it('retorna null sem frequência', () => {
    expect(describeRecurrence(null)).toBeNull();
    expect(describeRecurrence('COUNT=3')).toBeNull();
  });
});

describe('helpers', () => {
  it('intervalUnit alterna singular/plural', () => {
    expect(intervalUnit('DAILY', 1)).toBe('dia');
    expect(intervalUnit('DAILY', 3)).toBe('dias');
    expect(intervalUnit('YEARLY', 1)).toBe('ano');
    expect(intervalUnit('', 2)).toBe('');
  });

  it('weekdayCode usa o calendário UTC (mesmo do DTSTART)', () => {
    expect(weekdayCode(new Date('2026-10-19T12:00:00Z'))).toBe('MO');
    expect(weekdayCode(new Date('2026-10-25T12:00:00Z'))).toBe('SU');
  });
});
