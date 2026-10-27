import { FastifyReply, FastifyRequest } from 'fastify';
import {
  ContractService,
  CreateContractInput,
  UpdateContractInput,
} from '../services/contract.service';

interface IdParams {
  id: string;
}

interface ContractListQuery {
  organizationId?: string;
  status?: string;
  search?: string;
}

export class ContractController {
  constructor(
    private readonly contractService: ContractService = new ContractService()
  ) {}

  create = async (
    request: FastifyRequest<{ Body: CreateContractInput }>,
    reply: FastifyReply
  ) => {
    const created = await this.contractService.create(request.actor, request.body);
    return reply.status(201).send(created);
  };

  list = async (
    request: FastifyRequest<{ Querystring: ContractListQuery }>,
    reply: FastifyReply
  ) => {
    const contracts = await this.contractService.list(request.actor, request.query);
    return reply.status(200).send(contracts);
  };

  getById = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const contract = await this.contractService.getById(
      request.actor,
      request.params.id
    );
    return reply.status(200).send(contract);
  };

  update = async (
    request: FastifyRequest<{ Params: IdParams; Body: UpdateContractInput }>,
    reply: FastifyReply
  ) => {
    const updated = await this.contractService.update(
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
    await this.contractService.delete(request.actor, request.params.id);
    return reply.status(204).send();
  };
}
