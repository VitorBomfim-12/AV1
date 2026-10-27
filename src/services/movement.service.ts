import { Prisma } from '@prisma/client';
import { ContractStatus } from '../domain/enums';
import { FinancialCalculator } from '../domain/financial';
import {
  ensureValidTransactionType,
  EquipmentDomainValidator,
} from '../domain/validators';
import { NotFoundError, ValidationError } from '../errors/app-error';
import { prisma } from '../lib/prisma';
import { ContractRepository } from '../repositories/contract.repository';
import { EquipmentRepository } from '../repositories/equipment.repository';
import { LotRepository } from '../repositories/lot.repository';
import {
  MovementFilters,
  MovementRepository,
  MovementWithDetails,
} from '../repositories/movement.repository';
import { assertPermission } from '../security/rbac';
import { ActorContext, AuditEventService } from './audit-event.service';

export interface CreateMovementInput {
  equipmentId: string;
  lotId?: string | null;
  type: string;
  quantity?: number;
  note: string;
  toStatus?: string;
  toCondition?: string;
  toLocation?: string;
  financialValue?: number | null;
}

export interface UpdateMovementInput {
  type?: string;
  quantity?: number;
  note?: string;
  fromLocation?: string | null;
  toLocation?: string | null;
  financialValue?: number | null;
  version?: number;
}

export class MovementService {
  constructor(
    private readonly movementRepo: MovementRepository = new MovementRepository(),
    private readonly equipRepo: EquipmentRepository = new EquipmentRepository(),
    private readonly lotRepo: LotRepository = new LotRepository(),
    private readonly contractRepo: ContractRepository = new ContractRepository(),
    private readonly auditService: AuditEventService = new AuditEventService()
  ) {}

  async create(
    actor: ActorContext,
    input: CreateMovementInput
  ): Promise<MovementWithDetails> {
    assertPermission(actor.role, 'movement', 'write');

    if (!input.equipmentId?.trim() || !input.type?.trim() || !input.note?.trim()) {
      throw new ValidationError('Campos obrigatórios da movimentação: equipmentId, type, note.');
    }

    const type = ensureValidTransactionType(input.type);
    const quantity = Number(input.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError('A quantidade (quantity) deve ser um número inteiro maior que zero.');
    }

    return prisma.$transaction(async (tx) => {
      const eq = await this.equipRepo.findById(input.equipmentId, tx);
      if (!eq) {
        throw new NotFoundError('Equipamento não encontrado para registrar movimentação.');
      }

      if (input.lotId) {
        const lot = await this.lotRepo.findById(input.lotId, tx);
        if (!lot) throw new NotFoundError('Lote informado não encontrado.');
        if (lot.organizationId !== eq.organizationId) {
          throw new ValidationError('O lote informado pertence a outra organização.');
        }
      }

      const eqUpdates: Prisma.EquipamentoUncheckedUpdateManyInput = {};
      let targetStatus = eq.status;
      let targetCondition = eq.condition;
      let targetLocation = eq.location;
      let targetCurrentValue = eq.currentValue;

      if (input.toStatus) {
        targetStatus = EquipmentDomainValidator.validateStatusTransition(
          eq.status,
          input.toStatus
        );
        eqUpdates.status = targetStatus;
      }

      if (input.toCondition) {
        targetCondition = EquipmentDomainValidator.validateConditionTransition(
          eq.condition,
          input.toCondition,
          input.note
        );
        eqUpdates.condition = targetCondition;

        const contract = await this.contractRepo.findByOrganizationId(eq.organizationId, tx);
        const active = contract && contract.status === ContractStatus.ATIVO ? contract : null;
        const valuation = FinancialCalculator.calculateValuation({
          estimatedValue: eq.estimatedValue,
          condition: targetCondition,
          depreciationRate: active?.depreciationRate ?? 10,
          taxRate: active?.taxRate ?? 0,
        });
        targetCurrentValue = valuation.currentValue;
        eqUpdates.currentValue = targetCurrentValue;
      }

      if (input.toLocation?.trim()) {
        targetLocation = input.toLocation.trim();
        eqUpdates.location = targetLocation;
      }

      if (input.lotId !== undefined) {
        eqUpdates.lotId = input.lotId || null;
      }

      if (Object.keys(eqUpdates).length > 0) {
        await this.equipRepo.update(eq.id, eqUpdates, undefined, tx);
      }

      const movement = await this.movementRepo.create(
        {
          equipmentId: eq.id,
          lotId: input.lotId !== undefined ? input.lotId || null : eq.lotId,
          actorId: actor.id,
          type,
          quantity,
          note: input.note.trim(),
          fromStatus: eq.status,
          toStatus: targetStatus,
          fromCondition: eq.condition,
          toCondition: targetCondition,
          fromLocation: eq.location,
          toLocation: targetLocation,
          financialValue:
            input.financialValue !== undefined ? input.financialValue : targetCurrentValue,
        },
        tx
      );

      await this.auditService.record(
        actor.id,
        'CREATE_MOVEMENT',
        'Movimentacao',
        movement.id,
        {
          equipmentId: eq.id,
          type,
          fromStatus: eq.status,
          toStatus: targetStatus,
        },
        tx
      );

      return movement;
    });
  }

  async list(
    actor: ActorContext,
    filters: MovementFilters = {}
  ): Promise<MovementWithDetails[]> {
    assertPermission(actor.role, 'movement', 'read');
    return this.movementRepo.findAll(filters);
  }

  async getById(actor: ActorContext, id: string): Promise<MovementWithDetails> {
    assertPermission(actor.role, 'movement', 'read');
    const movement = await this.movementRepo.findById(id);
    if (!movement) {
      throw new NotFoundError('Movimentação não encontrada.');
    }
    return movement;
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateMovementInput
  ): Promise<MovementWithDetails> {
    assertPermission(actor.role, 'movement', 'write');

    return prisma.$transaction(async (tx) => {
      const existing = await this.movementRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Movimentação não encontrada.');
      }

      const updateData: Prisma.MovimentacaoUncheckedUpdateManyInput = {};

      if (input.type !== undefined) {
        updateData.type = ensureValidTransactionType(input.type);
      }
      if (input.quantity !== undefined) {
        const qty = Number(input.quantity);
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new ValidationError('A quantidade deve ser um inteiro positivo.');
        }
        updateData.quantity = qty;
      }
      if (input.note !== undefined) {
        if (!input.note.trim()) throw new ValidationError('A nota não pode ser vazia.');
        updateData.note = input.note.trim();
      }
      if (input.fromLocation !== undefined) {
        updateData.fromLocation = input.fromLocation ? input.fromLocation.trim() : null;
      }
      if (input.toLocation !== undefined) {
        updateData.toLocation = input.toLocation ? input.toLocation.trim() : null;
      }
      if (input.financialValue !== undefined) {
        updateData.financialValue = input.financialValue;
      }

      const updated = await this.movementRepo.update(id, updateData, input.version, tx);

      await this.auditService.record(
        actor.id,
        'UPDATE_MOVEMENT',
        'Movimentacao',
        id,
        { updatedFields: Object.keys(updateData), version: updated.version },
        tx
      );

      return updated;
    });
  }

  async delete(actor: ActorContext, id: string): Promise<void> {
    assertPermission(actor.role, 'movement', 'delete');

    await prisma.$transaction(async (tx) => {
      const existing = await this.movementRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Movimentação não encontrada.');
      }

      await this.movementRepo.delete(id, tx);
      await this.auditService.record(
        actor.id,
        'DELETE_MOVEMENT',
        'Movimentacao',
        id,
        { equipmentId: existing.equipmentId, type: existing.type },
        tx
      );
    });
  }
}
