import { Prisma } from '@prisma/client';
import { ensureValidRole } from '../domain/validators';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors/app-error';
import { prisma } from '../lib/prisma';
import { SafeUser, UserFilters, UserRepository } from '../repositories/user.repository';
import { assertPermission, PasswordService } from '../security/rbac';
import { ActorContext, AuditEventService } from './audit-event.service';

export interface CreateUserInput {
  name: string;
  username: string;
  email?: string | null;
  password: string;
  role: string;
  active?: boolean;
}

export interface UpdateUserInput {
  name?: string;
  username?: string;
  email?: string | null;
  password?: string;
  role?: string;
  active?: boolean;
  version?: number;
}

export class UserService {
  constructor(
    private readonly userRepo: UserRepository = new UserRepository(),
    private readonly auditService: AuditEventService = new AuditEventService()
  ) {}

  async create(actor: ActorContext, input: CreateUserInput): Promise<SafeUser> {
    assertPermission(actor.role, 'user', 'write');

    if (!input.name?.trim() || !input.username?.trim() || !input.password || input.password.length < 4) {
      throw new ValidationError(
        'Campos obrigatórios inválidos: name, username e password (mínimo 4 caracteres).'
      );
    }

    const role = ensureValidRole(input.role);
    const username = input.username.trim();
    const email = input.email?.trim() || null;

    return prisma.$transaction(async (tx) => {
      const existingUsername = await this.userRepo.findByUsername(username, tx);
      if (existingUsername) {
        throw new ConflictError('Nome de usuário já existe.');
      }

      if (email) {
        const existingEmail = await this.userRepo.findByEmail(email, tx);
        if (existingEmail) {
          throw new ConflictError('E-mail já está em uso por outro usuário.');
        }
      }

      const passwordHash = PasswordService.hash(input.password);
      const created = await this.userRepo.create(
        {
          name: input.name.trim(),
          username,
          email,
          passwordHash,
          role,
          active: input.active ?? true,
        },
        tx
      );

      await this.auditService.record(
        actor.id,
        'CREATE_USER',
        'Usuario',
        created.id,
        { username: created.username, role: created.role },
        tx
      );

      return created;
    });
  }

  async list(actor: ActorContext, filters: UserFilters = {}): Promise<SafeUser[]> {
    assertPermission(actor.role, 'user', 'read');
    return this.userRepo.findAll(filters);
  }

  async getById(actor: ActorContext, id: string): Promise<SafeUser> {
    if (actor.id !== id) {
      assertPermission(actor.role, 'user', 'read');
    }
    const user = await this.userRepo.findById(id);
    if (!user) {
      throw new NotFoundError('Usuário não encontrado.');
    }
    return user;
  }

  async update(actor: ActorContext, id: string, input: UpdateUserInput): Promise<SafeUser> {
    assertPermission(actor.role, 'user', 'write');

    return prisma.$transaction(async (tx) => {
      const existing = await this.userRepo.findFullById(id, tx);
      if (!existing) {
        throw new NotFoundError('Usuário não encontrado.');
      }

      const updateData: Prisma.UsuarioUncheckedUpdateManyInput = {};

      if (input.name !== undefined) {
        if (!input.name.trim()) throw new ValidationError('O nome não pode ser vazio.');
        updateData.name = input.name.trim();
      }

      if (input.username !== undefined) {
        const newUsername = input.username.trim();
        if (!newUsername) throw new ValidationError('O username não pode ser vazio.');
        if (newUsername !== existing.username) {
          const dup = await this.userRepo.findByUsername(newUsername, tx);
          if (dup && dup.id !== id) {
            throw new ConflictError('Nome de usuário já existe.');
          }
          updateData.username = newUsername;
        }
      }

      if (input.email !== undefined) {
        const newEmail = input.email ? input.email.trim() : null;
        if (newEmail && newEmail !== existing.email) {
          const dupEmail = await this.userRepo.findByEmail(newEmail, tx);
          if (dupEmail && dupEmail.id !== id) {
            throw new ConflictError('E-mail já está em uso por outro usuário.');
          }
        }
        updateData.email = newEmail;
      }

      if (input.password !== undefined) {
        if (input.password.length < 4) {
          throw new ValidationError('A senha deve ter no mínimo 4 caracteres.');
        }
        updateData.passwordHash = PasswordService.hash(input.password);
      }

      if (input.role !== undefined) {
        updateData.role = ensureValidRole(input.role);
      }

      if (input.active !== undefined) {
        if (actor.id === id && input.active === false) {
          throw new ForbiddenError('Você não pode desativar sua própria conta.');
        }
        updateData.active = input.active;
      }

      const updated = await this.userRepo.update(id, updateData, input.version, tx);

      await this.auditService.record(
        actor.id,
        'UPDATE_USER',
        'Usuario',
        id,
        { updatedFields: Object.keys(updateData), version: updated.version },
        tx
      );

      return updated;
    });
  }

  async delete(actor: ActorContext, id: string): Promise<void> {
    assertPermission(actor.role, 'user', 'delete');
    if (actor.id === id) {
      throw new ForbiddenError('Você não pode excluir sua própria conta.');
    }

    await prisma.$transaction(async (tx) => {
      const existing = await this.userRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Usuário não encontrado.');
      }

      const [lotsCount, movementsCount] = await Promise.all([
        tx.lote.count({ where: { createdById: id } }),
        tx.movimentacao.count({ where: { actorId: id } }),
      ]);

      if (lotsCount > 0 || movementsCount > 0) {
        throw new ConflictError(
          'Não é possível excluir usuário com lotes ou movimentações históricas vinculadas. Desative o usuário (active = false) para preservar a rastreabilidade.'
        );
      }

      await this.userRepo.delete(id, tx);
      await this.auditService.record(
        actor.id,
        'DELETE_USER',
        'Usuario',
        id,
        { username: existing.username },
        tx
      );
    });
  }
}
