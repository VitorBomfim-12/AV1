import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateLotInput,
  LotService,
  UpdateLotInput,
} from '../services/lot.service';

interface IdParams {
  id: string;
}

interface LotListQuery {
  organizationId?: string;
  status?: string;
  search?: string;
}

export class LotController {
  constructor(private readonly lotService: LotService = new LotService()) {}

  create = async (
    request: FastifyRequest<{ Body: CreateLotInput }>,
    reply: FastifyReply
  ) => {
    const created = await this.lotService.create(request.actor, request.body);
    return reply.status(201).send(created);
  };

  list = async (
    request: FastifyRequest<{ Querystring: LotListQuery }>,
    reply: FastifyReply
  ) => {
    const lots = await this.lotService.list(request.actor, request.query);
    return reply.status(200).send(lots);
  };

  getById = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const lot = await this.lotService.getById(request.actor, request.params.id);
    return reply.status(200).send(lot);
  };

  update = async (
    request: FastifyRequest<{ Params: IdParams; Body: UpdateLotInput }>,
    reply: FastifyReply
  ) => {
    const updated = await this.lotService.update(
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
    await this.lotService.delete(request.actor, request.params.id);
    return reply.status(204).send();
  };
}
