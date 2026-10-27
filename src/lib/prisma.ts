import { Prisma, PrismaClient } from '@prisma/client';
import '../config/env';

export type DbClient = PrismaClient | Prisma.TransactionClient;

const prismaLogLevels: Prisma.LogLevel[] =
  process.env.NODE_ENV === 'test'
    ? []
    : process.env.NODE_ENV === 'development'
      ? ['warn', 'error']
      : ['error'];

export const prisma = new PrismaClient({
  log: prismaLogLevels,
});

export async function initDatabasePragmas(client: PrismaClient = prisma): Promise<void> {
  await client.$executeRawUnsafe('PRAGMA foreign_keys = ON;');
  await client.$queryRawUnsafe('PRAGMA journal_mode = WAL;');
}
