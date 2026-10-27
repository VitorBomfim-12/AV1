import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env';
import { AuthService, BootstrapAdminInput } from '../services/auth.service';

interface LoginBody {
  username: string;
  password: string;
}

export class AuthController {
  constructor(private readonly authService: AuthService = new AuthService()) {}

  bootstrap = async (
    request: FastifyRequest<{ Body: BootstrapAdminInput }>,
    reply: FastifyReply
  ) => {
    const admin = await this.authService.bootstrapAdmin(request.body);
    const token = await reply.jwtSign(
      {
        sub: admin.id,
        username: admin.username,
        role: admin.role,
      },
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return reply.status(201).send({
      token,
      expiresIn: env.JWT_EXPIRES_IN,
      user: admin,
    });
  };

  login = async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
    const { username, password } = request.body;
    const user = await this.authService.login(username, password);

    const token = await reply.jwtSign(
      {
        sub: user.id,
        username: user.username,
        role: user.role,
      },
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    return reply.status(200).send({
      token,
      expiresIn: env.JWT_EXPIRES_IN,
      user,
    });
  };

  me = async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = await this.authService.getCurrentUser(request.actor.id);
    return reply.status(200).send(profile);
  };
}
