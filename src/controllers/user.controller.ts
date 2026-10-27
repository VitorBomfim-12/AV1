import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateUserInput,
  UpdateUserInput,
  UserService,
} from '../services/user.service';

interface IdParams {
  id: string;
}

interface UserListQuery {
  role?: string;
  active?: string;
  search?: string;
}

export class UserController {
  constructor(private readonly userService: UserService = new UserService()) {}

  create = async (
    request: FastifyRequest<{ Body: CreateUserInput }>,
    reply: FastifyReply
  ) => {
    const created = await this.userService.create(request.actor, request.body);
    return reply.status(201).send(created);
  };

  list = async (
    request: FastifyRequest<{ Querystring: UserListQuery }>,
    reply: FastifyReply
  ) => {
    const { role, active, search } = request.query;
    const parsedActive =
      active === 'true' ? true : active === 'false' ? false : undefined;

    const users = await this.userService.list(request.actor, {
      role,
      active: parsedActive,
      search,
    });
    return reply.status(200).send(users);
  };

  getById = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const user = await this.userService.getById(request.actor, request.params.id);
    return reply.status(200).send(user);
  };

  update = async (
    request: FastifyRequest<{ Params: IdParams; Body: UpdateUserInput }>,
    reply: FastifyReply
  ) => {
    const updated = await this.userService.update(
      request.actor,
      request.params.id,
      request.body
    );
    return reply.status(200).send(updated);
  };

  delete = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    await this.userService.delete(request.actor, request.params.id);
    return reply.status(204).send();
  };
}
