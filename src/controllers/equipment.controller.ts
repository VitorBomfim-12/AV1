import { FastifyReply, FastifyRequest } from 'fastify';
import {
  ChangeEquipmentStatusInput,
  CreateEquipmentInput,
  EquipmentService,
  UpdateEquipmentConditionInput,
  UpdateEquipmentInput,
} from '../services/equipment.service';

interface IdParams {
  id: string;
}

interface EquipmentListQuery {
  organizationId?: string;
  lotId?: string;
  status?: string;
  condition?: string;
  category?: string;
  search?: string;
}

export class EquipmentController {
  constructor(
    private readonly equipmentService: EquipmentService = new EquipmentService()
  ) {}

  create = async (
    request: FastifyRequest<{ Body: CreateEquipmentInput }>,
    reply: FastifyReply
  ) => {
    const created = await this.equipmentService.create(request.actor, request.body);
    return reply.status(201).send(created);
  };

  list = async (
    request: FastifyRequest<{ Querystring: EquipmentListQuery }>,
    reply: FastifyReply
  ) => {
    const equipments = await this.equipmentService.list(
      request.actor,
      request.query
    );
    return reply.status(200).send(equipments);
  };

  getById = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const eq = await this.equipmentService.getById(request.actor, request.params.id);
    return reply.status(200).send(eq);
  };

  getValuation = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const valuation = await this.equipmentService.getValuation(
      request.actor,
      request.params.id
    );
    return reply.status(200).send(valuation);
  };

  getHistory = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const history = await this.equipmentService.getHistory(
      request.actor,
      request.params.id
    );
    return reply.status(200).send(history);
  };

  update = async (
    request: FastifyRequest<{ Params: IdParams; Body: UpdateEquipmentInput }>,
    reply: FastifyReply
  ) => {
    const updated = await this.equipmentService.update(
      request.actor,
      request.params.id,
      request.body
    );
    return reply.status(200).send(updated);
  };

  changeStatus = async (
    request: FastifyRequest<{ Params: IdParams; Body: ChangeEquipmentStatusInput }>,
    reply: FastifyReply
  ) => {
    const updated = await this.equipmentService.changeStatus(
      request.actor,
      request.params.id,
      request.body
    );
    return reply.status(200).send(updated);
  };

  updateCondition = async (
    request: FastifyRequest<{ Params: IdParams; Body: UpdateEquipmentConditionInput }>,
    reply: FastifyReply
  ) => {
    const updated = await this.equipmentService.updateCondition(
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
    await this.equipmentService.delete(request.actor, request.params.id);
    return reply.status(204).send();
  };
}
