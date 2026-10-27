import * as crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ForbiddenError } from '../errors/app-error';
import { Role } from '../domain/enums';

export class PasswordService {
  private static readonly SALT_ROUNDS = 10;

  static hash(password: string): string {
    return bcrypt.hashSync(password, this.SALT_ROUNDS);
  }

  static verify(password: string, storedHash: string): boolean {
    if (!storedHash) return false;

    // Suporte nativo a bcrypt (padrão AV2)
    if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
      return bcrypt.compareSync(password, storedHash);
    }

    // Compatibilidade retroativa com hashes SHA-256 gerados no CLI da AV1
    const sha256 = crypto.createHash('sha256').update(password).digest('hex');
    if (sha256.length !== storedHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sha256, 'utf8'), Buffer.from(storedHash, 'utf8'));
  }
}

export type ResourceName =
  | 'user'
  | 'organization'
  | 'contract'
  | 'lot'
  | 'equipment'
  | 'movement'
  | 'audit';

export type PermissionOperation = 'read' | 'write' | 'delete';

const PERMISSION_MATRIX: Record<Role, Record<ResourceName, PermissionOperation[]>> = {
  [Role.ADMINISTRADOR]: {
    user: ['read', 'write', 'delete'],
    organization: ['read', 'write', 'delete'],
    contract: ['read', 'write', 'delete'],
    lot: ['read', 'write', 'delete'],
    equipment: ['read', 'write', 'delete'],
    movement: ['read', 'write', 'delete'],
    audit: ['read', 'write', 'delete'],
  },
  [Role.OPERADOR_CADASTRO]: {
    user: [],
    organization: ['read', 'write', 'delete'],
    contract: ['read', 'write', 'delete'],
    lot: ['read'],
    equipment: ['read'],
    movement: ['read'],
    audit: [],
  },
  [Role.ALMOXARIFE]: {
    user: [],
    organization: ['read'],
    contract: ['read'],
    lot: ['read', 'write', 'delete'],
    equipment: ['read', 'write', 'delete'],
    movement: ['read', 'write'],
    audit: [],
  },
  [Role.AUDITOR]: {
    user: ['read'],
    organization: ['read'],
    contract: ['read'],
    lot: ['read'],
    equipment: ['read'],
    movement: ['read'],
    audit: ['read'],
  },
};

export function hasPermission(
  role: string,
  resource: ResourceName,
  operation: PermissionOperation
): boolean {
  const roleEntry = PERMISSION_MATRIX[role as Role];
  if (!roleEntry) return false;
  return roleEntry[resource]?.includes(operation) ?? false;
}

export function assertPermission(
  role: string,
  resource: ResourceName,
  operation: PermissionOperation
): void {
  if (!hasPermission(role, resource, operation)) {
    throw new ForbiddenError(
      `Perfil '${role}' não possui permissão de '${operation}' sobre o recurso '${resource}'.`
    );
  }
}
