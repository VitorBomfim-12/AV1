import { Organizacao, Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../errors/app-error';
import { DbClient, prisma } from '../lib/prisma';

export interface OrganizationFilters {
  active?: boolean;
  type?: string;
  search?: string;
}

export const ORGANIZATION_DETAIL_INCLUDE = {
  contract: true,
  lots: {
    orderBy: { createdAt: 'desc' as const },
  },
  _count: {
    select: {
      lots: true,
      equipments: true,
    },
  },
} satisfies Prisma.OrganizacaoInclude;

export type OrganizationWithDetails = Prisma.OrganizacaoGetPayload<{
  include: typeof ORGANIZATION_DETAIL_INCLUDE;
}>;

export class OrganizationRepository {
  async create(
    data: Prisma.OrganizacaoUncheckedCreateInput,
    tx: DbClient = prisma
  ): Promise<OrganizationWithDetails> {
    return tx.organizacao.create({
      data,
      include: ORGANIZATION_DETAIL_INCLUDE,
    });
  }

  async findById(id: string, tx: DbClient = prisma): Promise<OrganizationWithDetails | null> {
    return tx.organizacao.findUnique({
      where: { id },
      include: ORGANIZATION_DETAIL_INCLUDE,
    });
  }

  async findByCnpj(cnpj: string, tx: DbClient = prisma): Promise<Organizacao | null> {
    return tx.organizacao.findUnique({ where: { cnpj } });
  }

  async findAll(
    filters: OrganizationFilters = {},
    tx: DbClient = prisma
  ): Promise<OrganizationWithDetails[]> {
    const where: Prisma.OrganizacaoWhereInput = {};
    if (filters.active !== undefined) where.active = filters.active;
    if (filters.type) where.type = filters.type;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { cnpj: { contains: filters.search } },
        { email: { contains: filters.search } },
      ];
    }

    return tx.organizacao.findMany({
      where,
      include: ORGANIZATION_DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    data: Prisma.OrganizacaoUncheckedUpdateManyInput,
    expectedVersion?: number,
    tx: DbClient = prisma
  ): Promise<OrganizationWithDetails> {
    const existing = await tx.organizacao.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError('Organização não encontrada.');
    }

    if (expectedVersion !== undefined) {
      if (existing.version !== expectedVersion) {
        throw new ConflictError(
          `Conflito de versão otimista na organização: esperado v${expectedVersion}, atual v${existing.version}.`
        );
      }
      const res = await tx.organizacao.updateMany({
        where: { id, version: expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (res.count === 0) {
        throw new ConflictError('Conflito de concorrência detectado ao atualizar organização.');
      }
      const updated = await this.findById(id, tx);
      return updated!;
    }

    return tx.organizacao.update({
      where: { id },
      data: { ...(data as Prisma.OrganizacaoUncheckedUpdateInput), version: { increment: 1 } },
      include: ORGANIZATION_DETAIL_INCLUDE,
    });
  }

  async delete(id: string, tx: DbClient = prisma): Promise<void> {
    await tx.organizacao.delete({ where: { id } });
  }
}
