import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateMovementInput,
  MovementService,
  UpdateMovementInput,
} from '../services/movement.service';

interface IdParams {
  id: string;
}

interface MovementListQuery {
  equipmentId?: string;
  lotId?: string;
  actorId?: string;
  type?: string;
}

export class MovementController {
  constructor(
    private readonly movementService: MovementService = new MovementService()
  ) {}

  create = async (
    request: FastifyRequest<{ Body: CreateMovementInput }>,
    reply: FastifyReply
  ) => {
    const created = await this.movementService.create(request.actor, request.body);
    return reply.status(201).send(created);
  };

  list = async (
    request: FastifyRequest<{ Querystring: MovementListQuery }>,
    reply: FastifyReply
  ) => {
    const movements = await this.movementService.list(
      request.actor,
      request.query
    );
    return reply.status(200).send(movements);
  };

  getById = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const movement = await this.movementService.getById(
      request.actor,
      request.params.id
    );
    return reply.status(200).send(movement);
  };

  update = async (
    request: FastifyRequest<{ Params: IdParams; Body: UpdateMovementInput }>,
    reply: FastifyReply
  ) => {
    const updated = await this.movementService.update(
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
    await this.movementService.delete(request.actor, request.params.id);
    return reply.status(204).send();
  };
}
