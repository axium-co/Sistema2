import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RegisterDto, LoginDto } from '../src/modules/auth/auth.dto';
import { AssignCardDto } from '../src/modules/boards/boards.dto';
import { ConvertLeadDto } from '../src/modules/crm/crm.dto';
import { PresignDto } from '../src/modules/files/files.dto';

/**
 * Contrato do ValidationPipe global (`whitelist` + `forbidNonWhitelisted`):
 *  - padrão: `whitelist: true` e `forbidNonWhitelisted: false` — campos não
 *    declarados são removidos do payload (não quebram o front legado);
 *  - `VALIDATION_STRICT=true`: campos extras passam a ser rejeitados (400),
 *    proteção contra mass assignment.
 *
 * Aqui validamos os DTOs diretamente com o class-validator, sem subir o HTTP —
 * os metadados de decorator do esbuild não são emitidos no vitest.
 */
async function validateDto<T extends object>(cls: new () => T, payload: unknown, forbid = false) {
  const instance = plainToInstance(cls, payload);
  return validate(instance as object, {
    whitelist: true,
    forbidNonWhitelisted: forbid,
  });
}

describe('Validação de DTOs (whitelist)', () => {
  it('aceita payload com apenas os campos declarados', async () => {
    const errors = await validateDto(RegisterDto, {
      companyName: 'AXIUM',
      name: 'Ana',
      email: 'ana@axium.dev',
      password: 'senha-forte',
    });
    expect(errors).toHaveLength(0);
  });

  it('ignora campo extra não declarado no modo padrão (whitelist)', async () => {
    const errors = await validateDto(LoginDto, {
      email: 'ana@axium.dev',
      password: 'senha-forte',
      role: 'OWNER',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejeita campo extra não declarado no modo estrito (VALIDATION_STRICT=true)', async () => {
    const errors = await validateDto(LoginDto, {
      email: 'ana@axium.dev',
      password: 'senha-forte',
      role: 'OWNER',
    }, true);
    const hasUnknown = errors.some((e) => Object.keys(e.constraints ?? {}).length > 0);
    expect(hasUnknown).toBe(true);
  });

  it('aceita campo opcional declarado junto de obrigatórios', async () => {
    const errors = await validateDto(ConvertLeadDto, {
      pipelineId: 'p1',
      stageId: 's1',
      ownerId: 'u1',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejeita campo extra em DTO de ação simples no modo estrito', async () => {
    const errors = await validateDto(AssignCardDto, { userId: 'u1', admin: true }, true);
    expect(errors.some((e) => Object.keys(e.constraints ?? {}).length > 0)).toBe(true);
  });

  it('rejeita string vazia em campo obrigatório', async () => {
    const errors = await validateDto(PresignDto, { name: '', mimeType: 'application/pdf' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
