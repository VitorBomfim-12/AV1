import { Prisma } from '@prisma/client';
import { CNPJValidator } from '../domain/validators';
import { ConflictError, NotFoundError, ValidationError } from '../errors/app-error';
import { prisma } from '../lib/prisma';
import {
  OrganizationFilters,
  OrganizationRepository,
  OrganizationWithDetails,
} from '../repositories/organization.repository';
import { assertPermission } from '../security/rbac';
import { ActorContext, AuditEventService } from './audit-event.service';

export interface CreateOrganizationInput {
  name: string;
  cnpj: string;
  type: string;
  phone: string;
  email: string;
  address: string;
  active?: boolean;
}

export interface UpdateOrganizationInput {
  name?: string;
  cnpj?: string;
  type?: string;
  phone?: string;
  email?: string;
  address?: string;
  active?: boolean;
  version?: number;
}

export class OrganizationService {
  private readonly cnpjValidator = new CNPJValidator();

  constructor(
    private readonly orgRepo: OrganizationRepository = new OrganizationRepository(),
    private readonly auditService: AuditEventService = new AuditEventService()
  ) {}

  async create(
    actor: ActorContext,
    input: CreateOrganizationInput
  ): Promise<OrganizationWithDetails> {
    assertPermission(actor.role, 'organization', 'write');

    if (
      !input.name?.trim() ||
      !input.type?.trim() ||
      !input.phone?.trim() ||
      !input.email?.trim() ||
      !input.address?.trim()
    ) {
      throw new ValidationError(
        'Campos obrigatórios da organização: name, cnpj, type, phone, email, address.'
      );
    }

    this.cnpjValidator.validate(input.cnpj);
    const cleanedCnpj = CNPJValidator.normalize(input.cnpj);

    return prisma.$transaction(async (tx) => {
      const existing = await this.orgRepo.findByCnpj(cleanedCnpj, tx);
      if (existing) {
        throw new ConflictError('Organização com este CNPJ já existe.');
      }

      const org = await this.orgRepo.create(
        {
          name: input.name.trim(),
          cnpj: cleanedCnpj,
          type: input.type.trim(),
          phone: input.phone.trim(),
          email: input.email.trim(),
          address: input.address.trim(),
          active: input.active ?? true,
        },
        tx
      );

      await this.auditService.record(
        actor.id,
        'CREATE_ORGANIZATION',
        'Organizacao',
        org.id,
        { name: org.name, cnpj: org.cnpj },
        tx
      );

      return org;
    });
  }

  async list(
    actor: ActorContext,
    filters: OrganizationFilters = {}
  ): Promise<OrganizationWithDetails[]> {
    assertPermission(actor.role, 'organization', 'read');
    return this.orgRepo.findAll(filters);
  }

  async getById(actor: ActorContext, id: string): Promise<OrganizationWithDetails> {
    assertPermission(actor.role, 'organization', 'read');
    const org = await this.orgRepo.findById(id);
    if (!org) {
      throw new NotFoundError('Organização não encontrada.');
    }
    return org;
  }

  async update(
    actor: ActorContext,
    id: string,
    input: UpdateOrganizationInput
  ): Promise<OrganizationWithDetails> {
    assertPermission(actor.role, 'organization', 'write');

    return prisma.$transaction(async (tx) => {
      const existing = await this.orgRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Organização não encontrada.');
      }

      const updateData: Prisma.OrganizacaoUncheckedUpdateManyInput = {};

      if (input.name !== undefined) {
        if (!input.name.trim()) throw new ValidationError('O nome da organização não pode ser vazio.');
        updateData.name = input.name.trim();
      }

      if (input.cnpj !== undefined) {
        this.cnpjValidator.validate(input.cnpj);
        const cleaned = CNPJValidator.normalize(input.cnpj);
        if (cleaned !== existing.cnpj) {
          const dup = await this.orgRepo.findByCnpj(cleaned, tx);
          if (dup && dup.id !== id) {
            throw new ConflictError('Organização com este CNPJ já existe.');
          }
          updateData.cnpj = cleaned;
        }
      }

      if (input.type !== undefined) updateData.type = input.type.trim();
      if (input.phone !== undefined) updateData.phone = input.phone.trim();
      if (input.email !== undefined) updateData.email = input.email.trim();
      if (input.address !== undefined) updateData.address = input.address.trim();
      if (input.active !== undefined) updateData.active = input.active;

      const updated = await this.orgRepo.update(id, updateData, input.version, tx);

      await this.auditService.record(
        actor.id,
        'UPDATE_ORGANIZATION',
        'Organizacao',
        id,
        { updatedFields: Object.keys(updateData), version: updated.version },
        tx
      );

      return updated;
    });
  }

  async delete(actor: ActorContext, id: string): Promise<void> {
    assertPermission(actor.role, 'organization', 'delete');

    await prisma.$transaction(async (tx) => {
      const existing = await this.orgRepo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError('Organização não encontrada.');
      }

      if (
        existing.contract ||
        existing._count.lots > 0 ||
        existing._count.equipments > 0
      ) {
        throw new ConflictError(
          'Não é possível excluir organização que possui contrato, lotes ou equipamentos vinculados.'
        );
      }

      await this.orgRepo.delete(id, tx);
      await this.auditService.record(
        actor.id,
        'DELETE_ORGANIZATION',
        'Organizacao',
        id,
        { cnpj: existing.cnpj, name: existing.name },
        tx
      );
    });
  }

  async getFinancialSummary(actor: ActorContext, id: string) {
    assertPermission(actor.role, 'organization', 'read');
    const org = await this.orgRepo.findById(id);
    if (!org) {
      throw new NotFoundError('Organização não encontrada.');
    }

    const equipments = await prisma.equipamento.findMany({
      where: { organizationId: id },
    });

    const totalEstimatedValue = Number(
      equipments.reduce((acc, eq) => acc + eq.estimatedValue, 0).toFixed(2)
    );
    const totalCurrentValue = Number(
      equipments.reduce((acc, eq) => acc + eq.currentValue, 0).toFixed(2)
    );

    const byStatus: Record<string, number> = {};
    const byCondition: Record<string, number> = {};

    for (const eq of equipments) {
      byStatus[eq.status] = (byStatus[eq.status] || 0) + 1;
      byCondition[eq.condition] = (byCondition[eq.condition] || 0) + 1;
    }

    return {
      organizationId: org.id,
      organizationName: org.name,
      cnpj: org.cnpj,
      contract: org.contract
        ? {
            id: org.contract.id,
            contractNumber: org.contract.contractNumber,
            status: org.contract.status,
            taxRate: org.contract.taxRate,
            depreciationRate: org.contract.depreciationRate,
            estimatedMonthlyValue: org.contract.estimatedMonthlyValue,
          }
        : null,
      totalLots: org._count.lots,
      totalEquipments: equipments.length,
      totalEstimatedValue,
      totalCurrentValue,
      byStatus,
      byCondition,
    };
  }
}
