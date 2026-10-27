import { Role } from '../domain/enums';
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from '../errors/app-error';
import { prisma } from '../lib/prisma';
import { SafeUser, UserRepository } from '../repositories/user.repository';
import { PasswordService } from '../security/rbac';
import { AuditEventService } from './audit-event.service';

export interface BootstrapAdminInput {
  name: string;
  username: string;
  email?: string;
  password: string;
}

export class AuthService {
  constructor(
    private readonly userRepo: UserRepository = new UserRepository(),
    private readonly auditService: AuditEventService = new AuditEventService()
  ) {}

  async bootstrapAdmin(input: BootstrapAdminInput): Promise<SafeUser> {
    if (!input.name?.trim() || !input.username?.trim() || !input.password || input.password.length < 4) {
      throw new ValidationError(
        'Nome, username e senha (mínimo de 4 caracteres) são obrigatórios para o provisionamento inicial.'
      );
    }

    return prisma.$transaction(async (tx) => {
      const totalUsers = await this.userRepo.count(tx);
      if (totalUsers > 0) {
        throw new ConflictError(
          'O provisionamento inicial já foi realizado. Utilize uma conta ADMINISTRADOR autenticada.'
        );
      }

      const passwordHash = PasswordService.hash(input.password);
      const admin = await this.userRepo.create(
        {
          name: input.name.trim(),
          username: input.username.trim(),
          email: input.email?.trim() || null,
          passwordHash,
          role: Role.ADMINISTRADOR,
          active: true,
        },
        tx
      );

      await this.auditService.record(
        admin.id,
        'BOOTSTRAP_ADMIN',
        'Usuario',
        admin.id,
        { username: admin.username, role: admin.role },
        tx
      );

      return admin;
    });
  }

  async login(username: string, password: string): Promise<SafeUser> {
    if (!username?.trim() || !password) {
      throw new ValidationError('Usuário e senha são obrigatórios.');
    }

    const user = await this.userRepo.findByUsername(username.trim());
    if (!user || !PasswordService.verify(password, user.passwordHash)) {
      throw new UnauthorizedError('Credenciais inválidas.');
    }

    if (!user.active) {
      throw new ForbiddenError('Usuário inativo. Contate o administrador do sistema.');
    }

    await this.auditService.record(user.id, 'LOGIN', 'Usuario', user.id, {
      username: user.username,
      role: user.role,
    });

    return UserRepository.toSafeUser(user);
  }

  async getCurrentUser(userId: string): Promise<SafeUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError('Usuário autenticado não encontrado.');
    }
    if (!user.active) {
      throw new ForbiddenError('Conta de usuário desativada.');
    }
    return user;
  }
}
