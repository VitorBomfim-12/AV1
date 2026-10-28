import { Prisma } from '@prisma/client';
import {
  ContractStatus,
  EquipmentStatus,
  TransactionType,
} from '../domain/enums';
import { FinancialCalculator, ValuationResult } from '../domain/financial';
import { EquipmentDomainValidator } from '../domain/validators';
import { ConflictError, NotFoundError, ValidationError } from '../errors/app-error';
import { DbClient, prisma } from '../lib/prisma';
import { ContractRepository } from '../repositories/contract.repository';
import {
  EquipmentFilters,
  EquipmentRepository,
  EquipmentWithDetails,
} from '../repositories/equipment.repository';
import { LotRepository } from '../repositories/lot.repository';
import {
  MovementRepository,
  MovementWithDetails,
} from '../repositories/movement.repository';
import { OrganizationRepository } from '../repositories/organization.repository';
import { assertPermission } from '../security/rbac';
import { ActorContext, AuditEventService } from './audit-event.service';

export interface CreateEquipmentInput {
  organizationId: string;
  lotId?: string | null;
  codigoBarrasInterno?: string;
  serial: string;
  category: string;
  brand: string;
  model: string;
  condition: string;
  location: string;
  estimatedValue?: number;
  notes?: string;
}

export interface UpdateEquipmentInput {
  lotId?: string | null;
  codigoBarrasInterno?: string;
  serial?: string;
  category?: string;
  brand?: string;
  model?: string;
  condition?: string;
  status?: string;
  location?: string;
  estimatedValue?: number;
  notes?: string;
  justification?: string;
  version?: number;
}

export interface ChangeEquipmentStatusInput {
  status: string;
  note?: string;
  toLocation?: string;
  version?: number;
}

export interface UpdateEquipmentConditionInput {
  condition: string;
  note?: string;
  version?: number;
}

export class EquipmentService {
  constructor(
    private readonly equipRepo: EquipmentRepository = new EquipmentRepository(),
    private readonly orgRepo: OrganizationRepository = new OrganizationRepository(),
    private readonly contractRepo: ContractRepository = new ContractRepository(),
    private readonly lotRepo: LotRepository = new LotRepository(),
    private readonly movementRepo: MovementRepository = new MovementRepository(),
    private readonly auditService: AuditEventService = new AuditEventService()
  ) {}

  private async computeValuationForOrg(
    organizationId: string,
    estimatedValue: number,
    condition: string,
    tx: DbClient = prisma
  ): Promise<ValuationResult> {
    const contract = await this.contractRepo.findByOrganizationId(organizationId, tx);
    const active = contract && contract.status === ContractStatus.ATIVO ? contract : null;

    return FinancialCalculator.calculateValuation({
      estimatedValue,
      condition,
      depreciationRate: active?.depreciationRate ?? 10,
      taxRate: active?.taxRate ?? 0,
    });
  }

  private inferTransactionTypeForStatus(newStatus: EquipmentStatus): TransactionType {
    switch (newStatus) {
      case EquipmentStatus.EM_TRIAGEM:
        return TransactionType.TRIAGEM;
      case EquipmentStatus.EM_REPARO:
        return TransactionType.REPARO;
      case EquipmentStatus.RECONDICIONADO:
        return TransactionType.RECONDICIONAMENTO;
      case EquipmentStatus.DESCARTADO:
        return TransactionType.DESCARTE;
      case EquipmentStatus.DOADO:
        return TransactionType.DOACAO;
      case EquipmentStatus.VENDIDO:
        return TransactionType.VENDA;
      default:
        return TransactionType.TRANSFERENCIA;
    }
  }

  async create(
    actor: ActorContext,
    input: CreateEquipmentInput
  ): Promise<EquipmentWithDetails> {
    assertPermission(actor.role, 'equipment', 'write');

    if (
      !input.organizationId?.trim() ||
      !input.serial?.trim() ||
      !input.category?.trim() ||
      !input.brand?.trim() ||
      !input.model?.trim() ||
      !input.condition?.trim() ||
      !input.location?.trim()
    ) {
      throw new ValidationError(
        'Campos obrigatórios: organizationId, serial, category, brand, model, condition, location.'
      );
    }

    const condition = EquipmentDomainValidator.ensureValidCondition(input.condition);
    const barcode =
      input.codigoBarrasInterno?.trim() || FinancialCalculator.generateInternalBarcode();

    return prisma.$transaction(async (tx) => {
      const org = await this.orgRepo.findById(input.organizationId, tx);
      if (!org) {
        throw new NotFoundError('Organização não encontrada.');
      }

      if (input.lotId) {
        const lot = await this.lotRepo.findById(input.lotId, tx);
        if (!lot) {
          throw new NotFoundError('Lote informado não encontrado.');
        }
        if (lot.organizationId !== input.organizationId) {
          throw new ValidationError('O lote informado pertence a outra organização.');
        }
      }

      const existingBarcode = await this.equipRepo.findByBarcode(barcode, tx);
      if (existingBarcode) {
        throw new ConflictError(
          `Equipamento com código de barras interno '${barcode}' já está cadastrado.`
        );
      }

      const valuation = await this.computeValuationForOrg(
        input.organizationId,
        input.estimatedValue ?? 0,
        condition,
        tx
      );

      const created = await this.equipRepo.create(
        {
          organizationId: input.organizationId,
          lotId: input.lotId || null,
          codigoBarrasInterno: barcode,
          serial: input.serial.trim(),
          category: input.category.trim(),
          brand: input.brand.trim(),
          model: input.model.trim(),
          condition,
          status: EquipmentStatus.RECEBIDO,
          location: input.location.trim(),
          estimatedValue: valuation.estimatedValue,
          currentValue: valuation.currentValue,
          notes: input.notes ?? '',
        },
        tx
      );

      await this.movementRepo.create(
        {
          equipmentId: created.id,
          lotId: created.lotId,
          actorId: actor.id,
          type: TransactionType.RECEBIMENTO,
          quantity: 1,
          note: input.notes?.trim() || 'Recebimento inicial do equipamento',
          toStatus: EquipmentStatus.RECEBIDO,
          toCondition: condition,
          toLocation: created.location,
          financialValue: valuation.currentValue,
        },
        tx
      );

      await this.auditService.record(
        actor.id,
        'CREATE_EQUIPMENT',
        'Equipamento',
        created.id,
        {
          codigoBarrasInterno: created.codigoBarrasInterno,
          serial: created.serial,
          currentValue: created.currentValue,
        },
        tx
      );

      const refreshed = await this.equipRepo.findById(created.id, tx);
      return refreshed!;
    });
  }

  async list(
    actor: ActorContext,
    filters: EquipmentFilters = {}
  ): Promise<EquipmentWithDetails[]> {
    assertPermission(actor.role, 'equipment', 'read');
    return this.equipRepo.findAll(filters);
  }

  async getById(actor: ActorContext, id: string): Promise<EquipmentWithDetails> {
    assertPermission(actor.role, 'equipment', 'read');
    const eq = await this.equipRepo.findById(id);
    if (!eq) {
      throw new NotFoundError('Equipamento não encontrado.');
    }
    return eq;
  }

  async getValuation(actor: ActorContext, id: string) {
    assertPermission(actor.role, 'equipment', 'read');
    const eq = await this.equipRepo.findById(id);
    if (!eq) {
      throw new NotFoundError('Equipamento não encontrado.');
    }
    const valuation = await this.computeValuationForOrg(
      eq.organizationId,
      eq.estimatedValue,
      eq.condition
    );
    return {
      equipmentId: eq.id,
      codigoBarrasInterno: eq.codigoBarrasInterno,
      serial: eq.serial,
      condition: eq.condition,
      status: eq.status,
      ...valuation,
    };
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateEquipmentInput
  ): Promise<EquipmentWithDetails> {
    assertPermission(actor.role, 'equipment', 'write');

    return prisma.$transaction(async (tx) => {
      const existing = await this.equipRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Equipamento não encontrado.');
      }

      const updateData: Prisma.EquipamentoUncheckedUpdateManyInput = {};
      const justificationText = input.justification ?? input.notes ?? '';

      let targetCondition = existing.condition;
      if (input.condition !== undefined && input.condition.toUpperCase() !== existing.condition) {
        targetCondition = EquipmentDomainValidator.validateConditionTransition(
          existing.condition,
          input.condition,
          justificationText
        );
        updateData.condition = targetCondition;
      }

      let targetStatus = existing.status as EquipmentStatus;
      if (input.status !== undefined && input.status.toUpperCase() !== existing.status) {
        targetStatus = EquipmentDomainValidator.validateStatusTransition(
          existing.status,
          input.status
        );
        updateData.status = targetStatus;
      }

      if (input.codigoBarrasInterno !== undefined) {
        const cleanBarcode = input.codigoBarrasInterno.trim();
        if (!cleanBarcode) {
          throw new ValidationError('codigoBarrasInterno não pode ser vazio.');
        }
        if (cleanBarcode !== existing.codigoBarrasInterno) {
          const dup = await this.equipRepo.findByBarcode(cleanBarcode, tx);
          if (dup && dup.id !== id) {
            throw new ConflictError(
              `Código de barras interno '${cleanBarcode}' já está cadastrado.`
            );
          }
          updateData.codigoBarrasInterno = cleanBarcode;
        }
      }

      if (input.lotId !== undefined) {
        if (input.lotId) {
          const lot = await this.lotRepo.findById(input.lotId, tx);
          if (!lot) throw new NotFoundError('Lote informado não encontrado.');
          if (lot.organizationId !== existing.organizationId) {
            throw new ValidationError('O lote informado pertence a outra organização.');
          }
          updateData.lotId = input.lotId;
        } else {
          updateData.lotId = null;
        }
      }

      if (input.serial !== undefined) {
        if (!input.serial.trim()) throw new ValidationError('O número de série (serial) não pode ser vazio.');
        updateData.serial = input.serial.trim();
      }
      if (input.category !== undefined) {
        if (!input.category.trim()) throw new ValidationError('A categoria (category) não pode ser vazia.');
        updateData.category = input.category.trim();
      }
      if (input.brand !== undefined) {
        if (!input.brand.trim()) throw new ValidationError('A marca (brand) não pode ser vazia.');
        updateData.brand = input.brand.trim();
      }
      if (input.model !== undefined) {
        if (!input.model.trim()) throw new ValidationError('O modelo (model) não pode ser vazio.');
        updateData.model = input.model.trim();
      }
      if (input.location !== undefined) {
        if (!input.location.trim()) throw new ValidationError('A localização (location) não pode ser vazia.');
        updateData.location = input.location.trim();
      }
      if (input.notes !== undefined) updateData.notes = input.notes;

      const targetEstimated =
        input.estimatedValue !== undefined ? Number(input.estimatedValue) : existing.estimatedValue;

      if (
        input.estimatedValue !== undefined ||
        updateData.condition !== undefined
      ) {
        const valuation = await this.computeValuationForOrg(
          existing.organizationId,
          targetEstimated,
          targetCondition,
          tx
        );
        updateData.estimatedValue = valuation.estimatedValue;
        updateData.currentValue = valuation.currentValue;
      }

      const updated = await this.equipRepo.update(id, updateData, input.version, tx);

      const statusChanged = updateData.status !== undefined;
      const conditionChanged = updateData.condition !== undefined;
      const locationChanged =
        input.location !== undefined && input.location.trim() !== existing.location;

      if (statusChanged || conditionChanged || locationChanged) {
        const txType = statusChanged
          ? this.inferTransactionTypeForStatus(targetStatus)
          : conditionChanged
          ? TransactionType.TRIAGEM
          : TransactionType.TRANSFERENCIA;

        await this.movementRepo.create(
          {
            equipmentId: id,
            lotId: updated.lotId,
            actorId: actor.id,
            type: txType,
            quantity: 1,
            note: justificationText.trim() || 'Atualização cadastral/operacional do equipamento',
            fromStatus: existing.status,
            toStatus: updated.status,
            fromCondition: existing.condition,
            toCondition: updated.condition,
            fromLocation: existing.location,
            toLocation: updated.location,
            financialValue: updated.currentValue,
          },
          tx
        );
      }

      await this.auditService.record(
        actor.id,
        'UPDATE_EQUIPMENT',
        'Equipamento',
        id,
        { updatedFields: Object.keys(updateData), version: updated.version },
        tx
      );

      const refreshed = await this.equipRepo.findById(id, tx);
      return refreshed!;
    });
  }

  async changeStatus(
    actor: ActorContext,
    id: string,
    input: ChangeEquipmentStatusInput
  ): Promise<EquipmentWithDetails> {
    assertPermission(actor.role, 'equipment', 'write');

    return prisma.$transaction(async (tx) => {
      const existing = await this.equipRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Equipamento não encontrado.');
      }

      const newStatus = EquipmentDomainValidator.validateStatusTransition(
        existing.status,
        input.status
      );

      const updateData: Prisma.EquipamentoUncheckedUpdateManyInput = {
        status: newStatus,
      };
      if (input.toLocation?.trim()) {
        updateData.location = input.toLocation.trim();
      }

      const updated = await this.equipRepo.update(id, updateData, input.version, tx);

      await this.movementRepo.create(
        {
          equipmentId: id,
          lotId: updated.lotId,
          actorId: actor.id,
          type: this.inferTransactionTypeForStatus(newStatus),
          quantity: 1,
          note: input.note?.trim() || `Mudança de status: ${existing.status} -> ${newStatus}`,
          fromStatus: existing.status,
          toStatus: newStatus,
          fromCondition: existing.condition,
          toCondition: existing.condition,
          fromLocation: existing.location,
          toLocation: updated.location,
          financialValue: updated.currentValue,
        },
        tx
      );

      await this.auditService.record(
        actor.id,
        'CHANGE_EQUIPMENT_STATUS',
        'Equipamento',
        id,
        { fromStatus: existing.status, toStatus: newStatus, version: updated.version },
        tx
      );

      const refreshed = await this.equipRepo.findById(id, tx);
      return refreshed!;
    });
  }

  async updateCondition(
    actor: ActorContext,
    id: string,
    input: UpdateEquipmentConditionInput
  ): Promise<EquipmentWithDetails> {
    assertPermission(actor.role, 'equipment', 'write');

    return prisma.$transaction(async (tx) => {
      const existing = await this.equipRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Equipamento não encontrado.');
      }

      const newCondition = EquipmentDomainValidator.validateConditionTransition(
        existing.condition,
        input.condition,
        input.note
      );

      const valuation = await this.computeValuationForOrg(
        existing.organizationId,
        existing.estimatedValue,
        newCondition,
        tx
      );

      const updated = await this.equipRepo.update(
        id,
        {
          condition: newCondition,
          currentValue: valuation.currentValue,
        },
        input.version,
        tx
      );

      await this.movementRepo.create(
        {
          equipmentId: id,
          lotId: updated.lotId,
          actorId: actor.id,
          type: TransactionType.TRIAGEM,
          quantity: 1,
          note:
            input.note?.trim() ||
            `Alteração de condição física: ${existing.condition} -> ${newCondition}`,
          fromStatus: existing.status,
          toStatus: existing.status,
          fromCondition: existing.condition,
          toCondition: newCondition,
          fromLocation: existing.location,
          toLocation: existing.location,
          financialValue: valuation.currentValue,
        },
        tx
      );

      await this.auditService.record(
        actor.id,
        'UPDATE_EQUIPMENT_CONDITION',
        'Equipamento',
        id,
        {
          fromCondition: existing.condition,
          toCondition: newCondition,
          currentValue: valuation.currentValue,
          version: updated.version,
        },
        tx
      );

      const refreshed = await this.equipRepo.findById(id, tx);
      return refreshed!;
    });
  }

  async getHistory(actor: ActorContext, id: string): Promise<MovementWithDetails[]> {
    assertPermission(actor.role, 'movement', 'read');
    const eq = await this.equipRepo.findById(id);
    if (!eq) {
      throw new NotFoundError('Equipamento não encontrado.');
    }
    return this.movementRepo.findByEquipmentId(id);
  }

  async delete(actor: ActorContext, id: string): Promise<void> {
    assertPermission(actor.role, 'equipment', 'delete');

    await prisma.$transaction(async (tx) => {
      const existing = await this.equipRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Equipamento não encontrado.');
      }

      await this.equipRepo.delete(id, tx);
      await this.auditService.record(
        actor.id,
        'DELETE_EQUIPMENT',
        'Equipamento',
        id,
        {
          codigoBarrasInterno: existing.codigoBarrasInterno,
          serial: existing.serial,
        },
        tx
      );
    });
  }
}
