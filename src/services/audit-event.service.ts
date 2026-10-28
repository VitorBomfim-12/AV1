import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../errors/app-error';
import { DbClient, prisma } from '../lib/prisma';
import {
  AuditEventFilters,
  AuditEventRepository,
  AuditEventWithActor,
} from '../repositories/audit-event.repository';
import { assertPermission } from '../security/rbac';

export interface ActorContext {
  id: string;
  username: string;
  role: string;
}

export interface CreateAuditEventInput {
  action: string;
  entityName: string;
  entityId: string;
  details?: Record<string, unknown>;
}

export interface UpdateAuditEventInput {
  action?: string;
  entityName?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  version?: number;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) {
        sorted[key] = sortKeysDeep(v);
      }
    }
    return sorted;
  }
  return value;
}

export class AuditEventService {
  constructor(private readonly auditRepo: AuditEventRepository = new AuditEventRepository()) {}

  static computeHash(params: {
    previousHash: string;
    actorId: string | null;
    action: string;
    entityName: string;
    entityId: string;
    details: unknown;
    createdAtIso: string;
  }): string {
    const canonical = JSON.stringify({
      previousHash: params.previousHash,
      actorId: params.actorId ?? null,
      action: params.action,
      entityName: params.entityName,
      entityId: params.entityId,
      details: sortKeysDeep(params.details ?? {}),
      createdAt: params.createdAtIso,
    });
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  async record(
    actorId: string | null,
    action: string,
    entityName: string,
    entityId: string,
    details: Record<string, unknown> = {},
    tx: DbClient = prisma
  ): Promise<AuditEventWithActor> {
    const latest = await this.auditRepo.findLatest(tx);
    const previousHash = latest ? latest.hash : 'GENESIS';
    const nextTimestampMs = latest
      ? Math.max(Date.now(), latest.createdAt.getTime() + 1)
      : Date.now();
    const createdAt = new Date(nextTimestampMs);
    const normalizedDetails = sortKeysDeep(details) as Prisma.InputJsonValue;

    const hash = AuditEventService.computeHash({
      previousHash,
      actorId,
      action,
      entityName,
      entityId,
      details: normalizedDetails,
      createdAtIso: createdAt.toISOString(),
    });

    return this.auditRepo.create(
      {
        actorId,
        action,
        entityName,
        entityId,
        details: normalizedDetails,
        previousHash,
        hash,
        createdAt,
      },
      tx
    );
  }

  async rebuildHashChain(tx: DbClient = prisma): Promise<void> {
    const allEvents = await tx.eventoAuditoria.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let previousHash = 'GENESIS';
    for (const ev of allEvents) {
      const expectedHash = AuditEventService.computeHash({
        previousHash,
        actorId: ev.actorId,
        action: ev.action,
        entityName: ev.entityName,
        entityId: ev.entityId,
        details: ev.details,
        createdAtIso: ev.createdAt.toISOString(),
      });

      if (ev.previousHash !== previousHash || ev.hash !== expectedHash) {
        await tx.eventoAuditoria.update({
          where: { id: ev.id },
          data: {
            previousHash,
            hash: expectedHash,
          },
        });
      }
      previousHash = expectedHash;
    }
  }

  async create(actor: ActorContext, input: CreateAuditEventInput): Promise<AuditEventWithActor> {
    assertPermission(actor.role, 'audit', 'write');
    if (!input.action?.trim() || !input.entityName?.trim() || !input.entityId?.trim()) {
      throw new ValidationError('Os campos action, entityName e entityId são obrigatórios.');
    }

    return prisma.$transaction(async (tx) => {
      return this.record(
        actor.id,
        input.action.trim(),
        input.entityName.trim(),
        input.entityId.trim(),
        input.details ?? {},
        tx
      );
    });
  }

  async list(
    actor: ActorContext,
    filters: AuditEventFilters = {}
  ): Promise<AuditEventWithActor[]> {
    assertPermission(actor.role, 'audit', 'read');
    return this.auditRepo.findAll(filters);
  }

  async getById(actor: ActorContext, id: string): Promise<AuditEventWithActor> {
    assertPermission(actor.role, 'audit', 'read');
    const event = await this.auditRepo.findById(id);
    if (!event) {
      throw new NotFoundError('Evento de auditoria não encontrado.');
    }
    return event;
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateAuditEventInput
  ): Promise<AuditEventWithActor> {
    assertPermission(actor.role, 'audit', 'write');

    return prisma.$transaction(async (tx) => {
      const existing = await this.auditRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Evento de auditoria não encontrado.');
      }

      if (input.action !== undefined && !input.action.trim()) {
        throw new ValidationError('O campo action não pode ser vazio.');
      }
      if (input.entityName !== undefined && !input.entityName.trim()) {
        throw new ValidationError('O campo entityName não pode ser vazio.');
      }
      if (input.entityId !== undefined && !input.entityId.trim()) {
        throw new ValidationError('O campo entityId não pode ser vazio.');
      }

      const nextAction = input.action !== undefined ? input.action.trim() : existing.action;
      const nextEntityName =
        input.entityName !== undefined ? input.entityName.trim() : existing.entityName;
      const nextEntityId =
        input.entityId !== undefined ? input.entityId.trim() : existing.entityId;
      const nextDetails = (
        input.details !== undefined ? sortKeysDeep(input.details) : existing.details
      ) as Prisma.InputJsonValue;

      const tempHash = crypto.randomUUID();
      await this.auditRepo.update(
        id,
        {
          action: nextAction,
          entityName: nextEntityName,
          entityId: nextEntityId,
          details: nextDetails,
          hash: tempHash,
        },
        input.version,
        tx
      );

      await this.rebuildHashChain(tx);
      const updated = await this.auditRepo.findById(id, tx);
      return updated!;
    });
  }

  async delete(actor: ActorContext, id: string): Promise<void> {
    assertPermission(actor.role, 'audit', 'delete');

    await prisma.$transaction(async (tx) => {
      const existing = await this.auditRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Evento de auditoria não encontrado.');
      }
      await this.auditRepo.delete(id, tx);
      await this.rebuildHashChain(tx);
    });
  }

  async verifyIntegrity(actor: ActorContext): Promise<{
    valid: boolean;
    totalEvents: number;
    brokenAtEventId?: string;
  }> {
    assertPermission(actor.role, 'audit', 'read');
    const events = await prisma.eventoAuditoria.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    let previousHash = 'GENESIS';
    for (const ev of events) {
      const expectedHash = AuditEventService.computeHash({
        previousHash,
        actorId: ev.actorId,
        action: ev.action,
        entityName: ev.entityName,
        entityId: ev.entityId,
        details: ev.details,
        createdAtIso: ev.createdAt.toISOString(),
      });

      if (ev.previousHash !== previousHash || ev.hash !== expectedHash) {
        return {
          valid: false,
          totalEvents: events.length,
          brokenAtEventId: ev.id,
        };
      }
      previousHash = ev.hash;
    }

    return {
      valid: true,
      totalEvents: events.length,
    };
  }
}
