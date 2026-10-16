import * as bcrypt from 'bcryptjs';

/**
 * Hashing de senha do AXIUM.
 *
 * Prefere Argon2id (nativo, via @node-rs/argon2) e cai para bcryptjs quando o
 * binário nativo não estiver disponível na plataforma (ex.: builds sem
 * toolchain). Os hashes antigos (bcrypt, `$2a$`/`$2b$`) continuam sendo
 * verificados pelo bcrypt, então a troca é transparente para contas existentes.
 */
let argon2Promise: Promise<typeof import('@node-rs/argon2') | null> | null = null;

function argon2(): Promise<typeof import('@node-rs/argon2') | null> {
  if (!argon2Promise) {
    argon2Promise = import('@node-rs/argon2')
      .then((m) => m as typeof import('@node-rs/argon2'))
      .catch(() => null);
  }
  return argon2Promise;
}

export const BCRYPT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  const mod = await argon2();
  if (mod) {
    try {
      return await mod.hash(plain);
    } catch {
      /* algo errado com o binário: usa bcrypt como plano B */
    }
  }
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith('$argon2')) {
    const mod = await argon2();
    if (!mod) return false;
    try {
      return await mod.verify(stored, plain);
    } catch {
      return false;
    }
  }
  return bcrypt.compare(plain, stored);
}

export async function passwordHasher(): Promise<'argon2' | 'bcrypt'> {
  return (await argon2()) ? 'argon2' : 'bcrypt';
}
