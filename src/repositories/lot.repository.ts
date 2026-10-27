import { Lote, Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../errors/app-error';
import { DbClient, prisma } from '../lib/prisma';

export interface LotFilters {
  organizationId?: string;
  status?: string;
  search?: string;
}

export const LOT_DETAIL_INCLUDE = {
  organization: {
    select: {
      id: true,
      name: true,
      cnpj: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
    },
  },
  equipments: {
    orderBy: { createdAt: 'desc' as const },
  },
  _count: {
    select: {
      equipments: true,
      movements: true,
    },
  },
} satisfies Prisma.LoteInclude;

export type LotWithDetails = Prisma.LoteGetPayload<{
  include: typeof LOT_DETAIL_INCLUDE;
}>;

export class LotRepository {
  async create(data: Prisma.LoteUncheckedCreateInput, tx: DbClient = prisma): Promise<LotWithDetails> {
    return tx.lote.create({
      data,
      include: LOT_DETAIL_INCLUDE,
    });
  }

  async findById(id: string, tx: DbClient = prisma): Promise<LotWithDetails | null> {
    return tx.lote.findUnique({
      where: { id },
      include: LOT_DETAIL_INCLUDE,
    });
  }

  async findByCode(code: string, tx: DbClient = prisma): Promise<Lote | null> {
    return tx.lote.findUnique({ where: { code } });
  }

  async findAll(filters: LotFilters = {}, tx: DbClient = prisma): Promise<LotWithDetails[]> {
    const where: Prisma.LoteWhereInput = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.status) where.status = filters.status.toUpperCase();
    if (filters.search) {
      where.OR = [
        { code: { contains: filters.search } },
        { invoiceNumber: { contains: filters.search } },
        { carrier: { contains: filters.search } },
        { origin: { contains: filters.search } },
        { destination: { contains: filters.search } },
      ];
    }

    return tx.lote.findMany({
      where,
      include: LOT_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Prisma.LoteUncheckedUpdateManyInput,
    expectedVersion?: number,
    tx: DbClient = prisma
  ): Promise<LotWithDetails> {
    const existing = await tx.lote.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Lote não encontrado.');
    }

    if (expectedVersion !== undefined) {
      if (existing.version !== expectedVersion) {
        throw new ConflictError(
          `Conflito de versão otimista no lote: esperado v${expectedVersion}, atual v${existing.version}.`
        );
      }
      const res = await tx.lote.updateMany({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (res.count === 0) {
        throw new ConflictError('Conflito de concorrência detectado ao atualizar lote.');
      }
      const updated = await this.findById(id, tx);
      return updated!;
    }

    return tx.lote.update({
      where: { id },
      data: { ...(data as Prisma.LoteUncheckedUpdateInput), version: { increment: 1 } },
      include: LOT_DETAIL_INCLUDE,
    });
  }

  async delete(id: string, tx: DbClient = prisma): Promise<void> {
    await tx.lote.delete({ where: { id } });
  }
}
