import { Equipamento, Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../errors/app-error';
import { DbClient, prisma } from '../lib/prisma';

export interface EquipmentFilters {
  organizationId?: string;
  lotId?: string;
  status?: string;
  condition?: string;
  category?: string;
  search?: string;
}

export const EQUIPMENT_DETAIL_INCLUDE = {
  organization: {
    select: {
      id: true,
      name: true,
      cnpj: true,
    },
  },
  lot: {
    select: {
      id: true,
      code: true,
      status: true,
    },
  },
  movements: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      actor: {
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
        },
      },
    },
  },
} satisfies Prisma.EquipamentoInclude;

export type EquipmentWithDetails = Prisma.EquipamentoGetPayload<{
  include: typeof EQUIPMENT_DETAIL_INCLUDE;
}>;

export class EquipmentRepository {
  async create(
    data: Prisma.EquipamentoUncheckedCreateInput,
    tx: DbClient = prisma
  ): Promise<EquipmentWithDetails> {
    return tx.equipamento.create({
      data,
      include: EQUIPMENT_DETAIL_INCLUDE,
    });
  }

  async findById(id: string, tx: DbClient = prisma): Promise<EquipmentWithDetails | null> {
    return tx.equipamento.findUnique({
      where: { id },
      include: EQUIPMENT_DETAIL_INCLUDE,
    });
  }

  async findByBarcode(
    codigoBarrasInterno: string,
    tx: DbClient = prisma
  ): Promise<Equipamento | null> {
    return tx.equipamento.findUnique({
      where: { codigoBarrasInterno },
    });
  }

  async findByOrganizationId(
    organizationId: string,
    tx: DbClient = prisma
  ): Promise<Equipamento[]> {
    return tx.equipamento.findMany({
      where: { organizationId },
    });
  }

  async findAll(
    filters: EquipmentFilters = {},
    tx: DbClient = prisma
  ): Promise<EquipmentWithDetails[]> {
    const where: Prisma.EquipamentoWhereInput = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.lotId) where.lotId = filters.lotId;
    if (filters.status) where.status = filters.status.toUpperCase();
    if (filters.condition) where.condition = filters.condition.toUpperCase();
    if (filters.category) where.category = { contains: filters.category };
    if (filters.search) {
      where.OR = [
        { serial: { contains: filters.search } },
        { codigoBarrasInterno: { contains: filters.search } },
        { brand: { contains: filters.search } },
        { model: { contains: filters.search } },
        { location: { contains: filters.search } },
      ];
    }

    return tx.equipamento.findMany({
      where,
      include: EQUIPMENT_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Prisma.EquipamentoUncheckedUpdateManyInput,
    expectedVersion?: number,
    tx: DbClient = prisma
  ): Promise<EquipmentWithDetails> {
    const existing = await tx.equipamento.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Equipamento não encontrado.');
    }

    if (expectedVersion !== undefined) {
      if (existing.version !== expectedVersion) {
        throw new ConflictError(
          `Conflito de versão otimista no equipamento: esperado v${expectedVersion}, atual v${existing.version}.`
        );
      }
      const res = await tx.equipamento.updateMany({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (res.count === 0) {
        throw new ConflictError('Conflito de concorrência detectado ao atualizar equipamento.');
      }
      const updated = await this.findById(id, tx);
      return updated!;
    }

    return tx.equipamento.update({
      where: { id },
      data: { ...(data as Prisma.EquipamentoUncheckedUpdateInput), version: { increment: 1 } },
      include: EQUIPMENT_DETAIL_INCLUDE,
    });
  }

  async assignManyToLot(
    equipmentIds: string[],
    lotId: string | null,
    tx: DbClient = prisma
  ): Promise<void> {
    if (equipmentIds.length === 0) return;
    await tx.equipamento.updateMany({
      where: { id: { in: equipmentIds } },
      data: { lotId, version: { increment: 1 } },
    });
  }

  async delete(id: string, tx: DbClient = prisma): Promise<void> {
    await tx.equipamento.delete({ where: { id } });
  }
}
