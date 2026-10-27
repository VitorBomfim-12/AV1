import '@fastify/jwt';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../../errors/app-error';
import { UserRepository } from '../../repositories/user.repository';
import { ActorContext } from '../../services/audit-event.service';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      username: string;
      role: string;
    };
    user: {
      sub: string;
      username: string;
      role: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    actor: ActorContext;
  }
}

const userRepo = new UserRepository();

export async function authenticateHook(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new UnauthorizedError('Token JWT ausente, inválido ou expirado.');
  }

  const payload = request.user;
  if (!payload?.sub) {
    throw new UnauthorizedError('Payload do token JWT inválido.');
  }

  const dbUser = await userRepo.findById(payload.sub);
  if (!dbUser) {
    throw new UnauthorizedError('Usuário do token não encontrado.');
  }
  if (!dbUser.active) {
    throw new ForbiddenError('Conta de usuário inativa.');
  }

  request.actor = {
    id: dbUser.id,
    username: dbUser.username,
    role: dbUser.role,
  };
}
