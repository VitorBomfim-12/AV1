import { Prisma } from '@prisma/client';
import {
  ContractStatus,
  EquipmentStatus,
  LotStatus,
  Role,
  TransactionType,
} from '../domain/enums';
import { FinancialCalculator } from '../domain/financial';
import {
  DateValidator,
  ensureValidLotStatus,
  EquipmentDomainValidator,
} from '../domain/validators';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../errors/app-error';
import { prisma } from '../lib/prisma';
import { ContractRepository } from '../repositories/contract.repository';
import { EquipmentRepository } from '../repositories/equipment.repository';
import { LotFilters, LotRepository, LotWithDetails } from '../repositories/lot.repository';
import { MovementRepository } from '../repositories/movement.repository';
import { OrganizationRepository } from '../repositories/organization.repository';
import { assertPermission } from '../security/rbac';
import { ActorContext, AuditEventService } from './audit-event.service';

export interface InlineLotEquipmentInput {
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

export interface CreateLotInput {
  code: string;
  organizationId: string;
  invoiceNumber?: string | null;
  carrier?: string | null;
  origin: string;
  destination: string;
  status?: string;
  entryDate?: string;
  notes?: string;
  equipmentIds?: string[];
  newEquipments?: InlineLotEquipmentInput[];
}

export interface UpdateLotInput {
  code?: string;
  invoiceNumber?: string | null;
  carrier?: string | null;
  origin?: string;
  destination?: string;
  status?: string;
  entryDate?: string;
  notes?: string;
  equipmentIds?: string[];
  version?: number;
}

export class LotService {
  private readonly dateValidator = new DateValidator();

  constructor(
    private readonly lotRepo: LotRepository = new LotRepository(),
    private readonly orgRepo: OrganizationRepository = new OrganizationRepository(),
    private readonly contractRepo: ContractRepository = new ContractRepository(),
    private readonly equipRepo: EquipmentRepository = new EquipmentRepository(),
    private readonly movementRepo: MovementRepository = new MovementRepository(),
    private readonly auditService: AuditEventService = new AuditEventService()
  ) {}

  async create(actor: ActorContext, input: CreateLotInput): Promise<LotWithDetails> {
    assertPermission(actor.role, 'lot', 'write');

    if (
      !input.code?.trim() ||
      !input.organizationId?.trim() ||
      !input.origin?.trim() ||
      !input.destination?.trim()
    ) {
      throw new ValidationError(
        'Campos obrigatórios do lote: code, organizationId, origin, destination.'
      );
    }

    const entryDate = input.entryDate ? new Date(input.entryDate) : new Date();
    this.dateValidator.validate(entryDate);

    const status = input.status ? ensureValidLotStatus(input.status) : LotStatus.ABERTO;
    const code = input.code.trim();

    return prisma.$transaction(async (tx) => {
      const org = await this.orgRepo.findById(input.organizationId, tx);
      if (!org) {
        throw new NotFoundError('Organização não encontrada para criação do lote.');
      }

      const existingCode = await this.lotRepo.findByCode(code, tx);
      if (existingCode) {
        throw new ConflictError(`Já existe um lote com o código '${code}'.`);
      }

      const lot = await this.lotRepo.create(
        {
          code,
          organizationId: input.organizationId,
          createdById: actor.id,
          invoiceNumber: input.invoiceNumber?.trim() || null,
          carrier: input.carrier?.trim() || null,
          origin: input.origin.trim(),
          destination: input.destination.trim(),
          status,
          entryDate,
          notes: input.notes ?? '',
        },
        tx
      );

      // Vinculação atômica de equipamentos existentes
      if (input.equipmentIds && input.equipmentIds.length > 0) {
        for (const eqId of input.equipmentIds) {
          const eq = await this.equipRepo.findById(eqId, tx);
          if (!eq) {
            throw new NotFoundError(`Equipamento '${eqId}' não encontrado para inclusão no lote.`);
          }
          if (eq.organizationId !== input.organizationId) {
            throw new ValidationError(
              `Equipamento '${eq.serial}' pertence a outra organização e não pode ser incluído neste lote.`
            );
          }

          await this.equipRepo.update(
            eq.id,
            { lotId: lot.id, location: input.destination.trim() },
            undefined,
            tx
          );
          await this.movementRepo.create(
            {
              equipmentId: eq.id,
              lotId: lot.id,
              actorId: actor.id,
              type: TransactionType.TRANSFERENCIA,
              quantity: 1,
              note: `Inclusão no lote ${lot.code}`,
              fromStatus: eq.status,
              toStatus: eq.status,
              fromCondition: eq.condition,
              toCondition: eq.condition,
              fromLocation: eq.location,
              toLocation: input.destination.trim(),
            },
            tx
          );
        }
      }

      // Criação atômica de novos equipamentos junto com o lote ($transaction)
      if (input.newEquipments && input.newEquipments.length > 0) {
        const contract = await this.contractRepo.findByOrganizationId(input.organizationId, tx);
        const activeContract = contract && contract.status === ContractStatus.ATIVO ? contract : null;

        for (const item of input.newEquipments) {
          if (
            !item.serial?.trim() ||
            !item.category?.trim() ||
            !item.brand?.trim() ||
            !item.model?.trim() ||
            !item.location?.trim()
          ) {
            throw new ValidationError(
              'Campos obrigatórios para cada equipamento do lote: serial, category, brand, model, condition, location.'
            );
          }
          const condition = EquipmentDomainValidator.ensureValidCondition(item.condition);
          const barcode = item.codigoBarrasInterno?.trim() || FinancialCalculator.generateInternalBarcode();

          const dupBarcode = await this.equipRepo.findByBarcode(barcode, tx);
          if (dupBarcode) {
            throw new ConflictError(`Código de barras interno '${barcode}' já está cadastrado.`);
          }

          const valuation = FinancialCalculator.calculateValuation({
            estimatedValue: item.estimatedValue ?? 0,
            condition,
            depreciationRate: activeContract?.depreciationRate ?? 10,
            taxRate: activeContract?.taxRate ?? 0,
          });

          const createdEq = await this.equipRepo.create(
            {
              organizationId: input.organizationId,
              lotId: lot.id,
              codigoBarrasInterno: barcode,
              serial: item.serial.trim(),
              category: item.category.trim(),
              brand: item.brand.trim(),
              model: item.model.trim(),
              condition,
              status: EquipmentStatus.RECEBIDO,
              location: item.location.trim(),
              estimatedValue: valuation.estimatedValue,
              currentValue: valuation.currentValue,
              receivedAt: entryDate,
              notes: item.notes ?? '',
            },
            tx
          );

          await this.movementRepo.create(
            {
              equipmentId: createdEq.id,
              lotId: lot.id,
              actorId: actor.id,
              type: TransactionType.RECEBIMENTO,
              quantity: 1,
              note: item.notes?.trim() || `Recebimento via lote ${lot.code}`,
              toStatus: EquipmentStatus.RECEBIDO,
              toCondition: condition,
              toLocation: createdEq.location,
              financialValue: valuation.currentValue,
            },
            tx
          );
        }
      }

      await this.auditService.record(
        actor.id,
        'CREATE_LOT',
        'Lote',
        lot.id,
        {
          code: lot.code,
          organizationId: lot.organizationId,
          linkedEquipments: input.equipmentIds?.length ?? 0,
          createdEquipments: input.newEquipments?.length ?? 0,
        },
        tx
      );

      const refreshed = await this.lotRepo.findById(lot.id, tx);
      return refreshed!;
    });
  }

  async list(actor: ActorContext, filters: LotFilters = {}): Promise<LotWithDetails[]> {
    assertPermission(actor.role, 'lot', 'read');
    return this.lotRepo.findAll(filters);
  }

  async getById(actor: ActorContext, id: string): Promise<LotWithDetails> {
    assertPermission(actor.role, 'lot', 'read');
    const lot = await this.lotRepo.findById(id);
    if (!lot) {
      throw new NotFoundError('Lote não encontrado.');
    }
    return lot;
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateLotInput
  ): Promise<LotWithDetails> {
    assertPermission(actor.role, 'lot', 'write');

    return prisma.$transaction(async (tx) => {
      const existing = await this.lotRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Lote não encontrado.');
      }

      const updateData: Prisma.LoteUncheckedUpdateManyInput = {};

      if (input.code !== undefined) {
        const cleanCode = input.code.trim();
        if (!cleanCode) throw new ValidationError('O código do lote não pode ser vazio.');
        if (cleanCode !== existing.code) {
          const dup = await this.lotRepo.findByCode(cleanCode, tx);
          if (dup && dup.id !== id) {
            throw new ConflictError(`Já existe um lote com o código '${cleanCode}'.`);
          }
          updateData.code = cleanCode;
        }
      }

      if (input.entryDate !== undefined) {
        const newEntryDate = new Date(input.entryDate);
        this.dateValidator.validate(newEntryDate);
        updateData.entryDate = newEntryDate;
      }

      if (input.status !== undefined) {
        updateData.status = ensureValidLotStatus(input.status);
      }

      if (input.invoiceNumber !== undefined) {
        updateData.invoiceNumber = input.invoiceNumber ? input.invoiceNumber.trim() : null;
      }
      if (input.carrier !== undefined) {
        updateData.carrier = input.carrier ? input.carrier.trim() : null;
      }
      if (input.origin !== undefined) {
        if (!input.origin.trim()) throw new ValidationError('A origem (origin) do lote não pode ser vazia.');
        updateData.origin = input.origin.trim();
      }
      if (input.destination !== undefined) {
        if (!input.destination.trim()) throw new ValidationError('O destino (destination) do lote não pode ser vazio.');
        updateData.destination = input.destination.trim();
      }
      if (input.notes !== undefined) updateData.notes = input.notes;

      const updated = await this.lotRepo.update(id, updateData, input.version, tx);

      if (input.equipmentIds !== undefined) {
        // Desassocia atuais e associa os novos informados
        const currentIds = existing.equipments.map((e) => e.id);
        await this.equipRepo.assignManyToLot(currentIds, null, tx);

        for (const eqId of input.equipmentIds) {
          const eq = await this.equipRepo.findById(eqId, tx);
          if (!eq) {
            throw new NotFoundError(`Equipamento '${eqId}' não encontrado.`);
          }
          if (eq.organizationId !== existing.organizationId) {
            throw new ValidationError(
              `Equipamento '${eq.serial}' pertence a outra organização.`
            );
          }
        }
        await this.equipRepo.assignManyToLot(input.equipmentIds, id, tx);
      }

      await this.auditService.record(
        actor.id,
        'UPDATE_LOT',
        'Lote',
        id,
        { updatedFields: Object.keys(updateData), version: updated.version },
        tx
      );

      const refreshed = await this.lotRepo.findById(id, tx);
      return refreshed!;
    });
  }

  async delete(actor: ActorContext, id: string): Promise<void> {
    assertPermission(actor.role, 'lot', 'delete');

    await prisma.$transaction(async (tx) => {
      const existing = await this.lotRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Lote não encontrado.');
      }

      if (existing.status === LotStatus.FECHADO && actor.role !== Role.ADMINISTRADOR) {
        throw new ForbiddenError('Apenas ADMINISTRADOR pode remover um lote já FECHADO.');
      }

      const currentEqIds = existing.equipments.map((e) => e.id);
      await this.equipRepo.assignManyToLot(currentEqIds, null, tx);
      await this.lotRepo.delete(id, tx);

      await this.auditService.record(
        actor.id,
        'DELETE_LOT',
        'Lote',
        id,
        { code: existing.code, detachedEquipments: currentEqIds.length },
        tx
      );
    });
  }
}
