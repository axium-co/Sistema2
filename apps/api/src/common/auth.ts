import { Injectable, SetMetadata, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import type { Role } from '@axium/shared';
import { can, type ActionName, type ModuleName } from '@axium/shared';
import { TenantContext } from './tenant-context';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSION_KEY = 'permissions';
export interface PermissionMeta {
  module: ModuleName;
  action: ActionName;
}
export const RequirePermission = (module: ModuleName, action: ActionName) =>
  SetMetadata(PERMISSION_KEY, { module, action } as PermissionMeta);

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  email: string;
  name: string;
}

export const JWT_SECRET = () => process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';

export function signAccessToken(user: AuthUser): string {
  const ttl = process.env.JWT_ACCESS_TTL ?? '15m';
  return jwt.sign({ ...user }, JWT_SECRET(), { expiresIn: ttl } as jwt.SignOptions);
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const header: string | undefined = request.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;

    if (isPublic) {
      if (token) {
        try {
          const payload = jwt.verify(token, JWT_SECRET()) as AuthUser;
          TenantContext.enterWith({
            tenantId: payload.tenantId,
            userId: payload.userId,
            role: payload.role,
          });
          request.user = payload;
        } catch {
          /* token inválido em rota pública é ignorado */
        }
      }
      return true;
    }

    if (!token) {
      throw new ForbiddenException('Token de acesso ausente');
    }

    let payload: AuthUser;
    try {
      payload = jwt.verify(token, JWT_SECRET()) as AuthUser;
    } catch {
      throw new ForbiddenException('Token de acesso inválido ou expirado');
    }

    TenantContext.enterWith({
      tenantId: payload.tenantId,
      userId: payload.userId,
      role: payload.role,
    });
    request.user = payload;
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<PermissionMeta>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!meta) return true;

    const request = context.switchToHttp().getRequest();
    const role: Role | undefined = request.user?.role ?? TenantContext.role;
    if (!role) throw new ForbiddenException('Perfil não identificado');

    if (!can(role, meta.module, meta.action)) {
      throw new ForbiddenException(`Seu perfil (${role}) não pode ${meta.action} em ${meta.module}`);
    }
    return true;
  }
}
