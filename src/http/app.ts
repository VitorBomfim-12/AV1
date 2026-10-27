import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { Prisma } from '@prisma/client';
import Fastify, { FastifyError, FastifyInstance } from 'fastify';
import { env } from '../config/env';
import { AppError } from '../errors/app-error';
import { initDatabasePragmas, prisma } from '../lib/prisma';
import { appRoutes } from './routes';

export interface BuildAppOptions {
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? env.NODE_ENV !== 'test',
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: true,
        allErrors: true,
      },
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'GreenCode — API Monolítica de Logística Reversa (AV2)',
        description:
          'API RESTful em arquitetura Controller-Service-Repository com Fastify, Prisma ORM, JWT e controle de concorrência otimista.',
        version: '2.0.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: error.code,
        message: error.message,
        details: error.details,
      });
    }

    if ('validation' in error && error.validation) {
      return reply.status(400).send({
        error: 'SCHEMA_VALIDATION_ERROR',
        message: error.message,
        details: error.validation,
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply.status(409).send({
          error: 'UNIQUE_CONSTRAINT_VIOLATION',
          message: 'Violação de restrição de unicidade no banco de dados.',
          details: error.meta,
        });
      }
      if (error.code === 'P2025') {
        return reply.status(404).send({
          error: 'NOT_FOUND',
          message: 'Registro não encontrado no banco de dados.',
        });
      }
      if (error.code === 'P2003') {
        return reply.status(409).send({
          error: 'FOREIGN_KEY_CONFLICT',
          message: 'Operação bloqueada por integridade referencial no banco de dados.',
        });
      }
    }

    if (error.message && error.message.includes('DB_TRIGGER:')) {
      return reply.status(400).send({
        error: 'DATABASE_TRIGGER_VIOLATION',
        message: error.message,
      });
    }

    if (error.message && error.message.includes('CHECK constraint failed')) {
      return reply.status(400).send({
        error: 'DATABASE_CHECK_CONSTRAINT_VIOLATION',
        message: error.message,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno inesperado no servidor.',
    });
  });

  app.addHook('onReady', async () => {
    await initDatabasePragmas();
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  await app.register(appRoutes);

  return app;
}
