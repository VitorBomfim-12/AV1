import { FastifyReply, FastifyRequest } from 'fastify';
import {
  AuditEventService,
  CreateAuditEventInput,
  UpdateAuditEventInput,
} from '../services/audit-event.service';

interface IdParams {
  id: string;
}

interface AuditListQuery {
  entityName?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
}

export class AuditEventController {
  constructor(
    private readonly auditService: AuditEventService = new AuditEventService()
  ) {}

  create = async (
    request: FastifyRequest<{ Body: CreateAuditEventInput }>,
    reply: FastifyReply
  ) => {
    const created = await this.auditService.create(request.actor, request.body);
    return reply.status(201).send(created);
  };

  list = async (
    request: FastifyRequest<{ Querystring: AuditListQuery }>,
    reply: FastifyReply
  ) => {
    const events = await this.auditService.list(request.actor, request.query);
    return reply.status(200).send(events);
  };

  verify = async (request: FastifyRequest, reply: FastifyReply) => {
    const report = await this.auditService.verifyIntegrity(request.actor);
    return reply.status(200).send(report);
  };

  getById = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const event = await this.auditService.getById(request.actor, request.params.id);
    return reply.status(200).send(event);
  };

  update = async (
    request: FastifyRequest<{ Params: IdParams; Body: UpdateAuditEventInput }>,
    reply: FastifyReply
  ) => {
    const updated = await this.auditService.update(
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
    await this.auditService.delete(request.actor, request.params.id);
    return reply.status(204).send();
  };
}
