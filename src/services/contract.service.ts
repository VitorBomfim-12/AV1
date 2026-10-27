import { Prisma } from '@prisma/client';
import { CollectionFrequency, ContractStatus } from '../domain/enums';
import { FinancialCalculator } from '../domain/financial';
import { ensureValidContractStatus } from '../domain/validators';
import { ConflictError, NotFoundError, ValidationError } from '../errors/app-error';
import { DbClient, prisma } from '../lib/prisma';
import {
  ContractFilters,
  ContractRepository,
  ContractWithOrganization,
} from '../repositories/contract.repository';
import { EquipmentRepository } from '../repositories/equipment.repository';
import { OrganizationRepository } from '../repositories/organization.repository';
import { assertPermission } from '../security/rbac';
import { ActorContext, AuditEventService } from './audit-event.service';

export interface CreateContractInput {
  organizationId: string;
  contractNumber: string;
  startDate: string;
  endDate?: string | null;
  status?: string;
  collectionFrequency?: string;
  taxRate?: number;
  depreciationRate?: number;
  estimatedMonthlyValue?: number;
  clauses?: Record<string, unknown> | null;
  notes?: string;
}

export interface UpdateContractInput {
  contractNumber?: string;
  startDate?: string;
  endDate?: string | null;
  status?: string;
  collectionFrequency?: string;
  taxRate?: number;
  depreciationRate?: number;
  estimatedMonthlyValue?: number;
  clauses?: Record<string, unknown> | null;
  notes?: string;
  version?: number;
}

export class ContractService {
  constructor(
    private readonly contractRepo: ContractRepository = new ContractRepository(),
    private readonly orgRepo: OrganizationRepository = new OrganizationRepository(),
    private readonly equipRepo: EquipmentRepository = new EquipmentRepository(),
    private readonly auditService: AuditEventService = new AuditEventService()
  ) {}

  private validateRatesAndDates(params: {
    startDate: Date;
    endDate: Date | null;
    taxRate: number;
    depreciationRate: number;
    estimatedMonthlyValue: number;
  }): void {
    if (Number.isNaN(params.startDate.getTime())) {
      throw new ValidationError('startDate inválido.');
    }
    if (params.endDate && Number.isNaN(params.endDate.getTime())) {
      throw new ValidationError('endDate inválido.');
    }
    if (params.endDate && params.endDate < params.startDate) {
      throw new ValidationError('A data de encerramento (endDate) não pode ser anterior a startDate.');
    }
    if (params.taxRate < 0 || params.taxRate > 100) {
      throw new ValidationError('A alíquota de imposto (taxRate) deve estar entre 0 e 100.');
    }
    if (params.depreciationRate < 0 || params.depreciationRate > 100) {
      throw new ValidationError('O coeficiente de depreciação (depreciationRate) deve estar entre 0 e 100.');
    }
    if (params.estimatedMonthlyValue < 0) {
      throw new ValidationError('O valor mensal estimado não pode ser negativo.');
    }
  }

  private ensureValidFrequency(freq?: string): CollectionFrequency {
    const normalized = (freq || CollectionFrequency.MENSAL).toUpperCase() as CollectionFrequency;
    if (!Object.values(CollectionFrequency).includes(normalized)) {
      throw new ValidationError(
        `Frequência de coleta inválida: '${freq}'. Valores aceitos: ${Object.values(CollectionFrequency).join(', ')}.`
      );
    }
    return normalized;
  }

  private async recalculateOrganizationEquipments(
    organizationId: string,
    depreciationRate: number,
    taxRate: number,
    tx: DbClient
  ): Promise<void> {
    const equipments = await this.equipRepo.findByOrganizationId(organizationId, tx);
    for (const eq of equipments) {
      const valuation = FinancialCalculator.calculateValuation({
        estimatedValue: eq.estimatedValue,
        condition: eq.condition,
        depreciationRate,
        taxRate,
      });
      await tx.equipamento.update({
        where: { id: eq.id },
        data: {
          currentValue: valuation.currentValue,
          version: { increment: 1 },
        },
      });
    }
  }

  async create(
    actor: ActorContext,
    input: CreateContractInput
  ): Promise<ContractWithOrganization> {
    assertPermission(actor.role, 'contract', 'write');

    if (!input.organizationId?.trim() || !input.contractNumber?.trim() || !input.startDate) {
      throw new ValidationError(
        'Campos obrigatórios do contrato: organizationId, contractNumber, startDate.'
      );
    }

    const startDate = new Date(input.startDate);
    const endDate = input.endDate ? new Date(input.endDate) : null;
    const status = input.status ? ensureValidContractStatus(input.status) : ContractStatus.ATIVO;
    const collectionFrequency = this.ensureValidFrequency(input.collectionFrequency);
    const taxRate = Number(input.taxRate ?? 0);
    const depreciationRate = Number(input.depreciationRate ?? 10);
    const estimatedMonthlyValue = Number(input.estimatedMonthlyValue ?? 0);

    this.validateRatesAndDates({
      startDate,
      endDate,
      taxRate,
      depreciationRate,
      estimatedMonthlyValue,
    });

    return prisma.$transaction(async (tx) => {
      const org = await this.orgRepo.findById(input.organizationId, tx);
      if (!org) {
        throw new NotFoundError('Organização não encontrada para vincular contrato.');
      }

      const existingOrgContract = await this.contractRepo.findByOrganizationId(
        input.organizationId,
        tx
      );
      if (existingOrgContract) {
        throw new ConflictError(
          'Esta organização já possui um contrato cadastrado (relação 1:1 opcional).'
        );
      }

      const existingNumber = await this.contractRepo.findByContractNumber(
        input.contractNumber.trim(),
        tx
      );
      if (existingNumber) {
        throw new ConflictError('Já existe um contrato com este número.');
      }

      const created = await this.contractRepo.create(
        {
          organizationId: input.organizationId,
          contractNumber: input.contractNumber.trim(),
          startDate,
          endDate,
          status,
          collectionFrequency,
          taxRate,
          depreciationRate,
          estimatedMonthlyValue,
          clauses:
            input.clauses === null
              ? Prisma.JsonNull
              : ((input.clauses ?? {}) as Prisma.InputJsonValue),
          notes: input.notes ?? '',
        },
        tx
      );

      if (status === ContractStatus.ATIVO) {
        await this.recalculateOrganizationEquipments(
          input.organizationId,
          depreciationRate,
          taxRate,
          tx
        );
      }

      await this.auditService.record(
        actor.id,
        'CREATE_CONTRACT',
        'Contrato',
        created.id,
        {
          organizationId: created.organizationId,
          contractNumber: created.contractNumber,
          taxRate,
          depreciationRate,
        },
        tx
      );

      return created;
    });
  }

  async list(
    actor: ActorContext,
    filters: ContractFilters = {}
  ): Promise<ContractWithOrganization[]> {
    assertPermission(actor.role, 'contract', 'read');
    return this.contractRepo.findAll(filters);
  }

  async getById(actor: ActorContext, id: string): Promise<ContractWithOrganization> {
    assertPermission(actor.role, 'contract', 'read');
    const contract = await this.contractRepo.findById(id);
    if (!contract) {
      throw new NotFoundError('Contrato não encontrado.');
    }
    return contract;
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateContractInput
  ): Promise<ContractWithOrganization> {
    assertPermission(actor.role, 'contract', 'write');

    return prisma.$transaction(async (tx) => {
      const existing = await this.contractRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Contrato não encontrado.');
      }

      const startDate = input.startDate ? new Date(input.startDate) : existing.startDate;
      const endDate =
        input.endDate !== undefined
          ? input.endDate
            ? new Date(input.endDate)
            : null
          : existing.endDate;
      const taxRate = input.taxRate !== undefined ? Number(input.taxRate) : existing.taxRate;
      const depreciationRate =
        input.depreciationRate !== undefined
          ? Number(input.depreciationRate)
          : existing.depreciationRate;
      const estimatedMonthlyValue =
        input.estimatedMonthlyValue !== undefined
          ? Number(input.estimatedMonthlyValue)
          : existing.estimatedMonthlyValue;

      this.validateRatesAndDates({
        startDate,
        endDate,
        taxRate,
        depreciationRate,
        estimatedMonthlyValue,
      });

      const updateData: Prisma.ContratoUncheckedUpdateManyInput = {
        startDate,
        endDate,
        taxRate,
        depreciationRate,
        estimatedMonthlyValue,
      };

      if (input.contractNumber !== undefined) {
        const cleanNum = input.contractNumber.trim();
        if (!cleanNum) throw new ValidationError('contractNumber não pode ser vazio.');
        if (cleanNum !== existing.contractNumber) {
          const dup = await this.contractRepo.findByContractNumber(cleanNum, tx);
          if (dup && dup.id !== id) {
            throw new ConflictError('Já existe um contrato com este número.');
          }
          updateData.contractNumber = cleanNum;
        }
      }

      if (input.status !== undefined) {
        updateData.status = ensureValidContractStatus(input.status);
      }

      if (input.collectionFrequency !== undefined) {
        updateData.collectionFrequency = this.ensureValidFrequency(input.collectionFrequency);
      }

      if (input.clauses !== undefined) {
        updateData.clauses =
          input.clauses === null
            ? Prisma.JsonNull
            : (input.clauses as Prisma.InputJsonValue);
      }

      if (input.notes !== undefined) {
        updateData.notes = input.notes;
      }

      const updated = await this.contractRepo.update(id, updateData, input.version, tx);

      const effectiveActive = updated.status === ContractStatus.ATIVO;
      await this.recalculateOrganizationEquipments(
        updated.organizationId,
        effectiveActive ? updated.depreciationRate : 10,
        effectiveActive ? updated.taxRate : 0,
        tx
      );

      await this.auditService.record(
        actor.id,
        'UPDATE_CONTRACT',
        'Contrato',
        id,
        { updatedFields: Object.keys(updateData), version: updated.version },
        tx
      );

      return updated;
    });
  }

  async delete(actor: ActorContext, id: string): Promise<void> {
    assertPermission(actor.role, 'contract', 'delete');

    await prisma.$transaction(async (tx) => {
      const existing = await this.contractRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Contrato não encontrado.');
      }

      await this.contractRepo.delete(id, tx);
      await this.recalculateOrganizationEquipments(existing.organizationId, 10, 0, tx);

      await this.auditService.record(
        actor.id,
        'DELETE_CONTRACT',
        'Contrato',
        id,
        { contractNumber: existing.contractNumber, organizationId: existing.organizationId },
        tx
      );
    });
  }
}
