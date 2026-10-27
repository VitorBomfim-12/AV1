import { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateOrganizationInput,
  OrganizationService,
  UpdateOrganizationInput,
} from '../services/organization.service';

interface IdParams {
  id: string;
}

interface OrgListQuery {
  active?: string;
  type?: string;
  search?: string;
}

export class OrganizationController {
  constructor(
    private readonly orgService: OrganizationService = new OrganizationService()
  ) {}

  create = async (
    request: FastifyRequest<{ Body: CreateOrganizationInput }>,
    reply: FastifyReply
  ) => {
    const created = await this.orgService.create(request.actor, request.body);
    return reply.status(201).send(created);
  };

  list = async (
    request: FastifyRequest<{ Querystring: OrgListQuery }>,
    reply: FastifyReply
  ) => {
    const { active, type, search } = request.query;
    const parsedActive =
      active === 'true' ? true : active === 'false' ? false : undefined;

    const orgs = await this.orgService.list(request.actor, {
      active: parsedActive,
      type,
      search,
    });
    return reply.status(200).send(orgs);
  };

  getById = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const org = await this.orgService.getById(request.actor, request.params.id);
    return reply.status(200).send(org);
  };

  getFinancialSummary = async (
    request: FastifyRequest<{ Params: IdParams }>,
    reply: FastifyReply
  ) => {
    const summary = await this.orgService.getFinancialSummary(
      request.actor,
      request.params.id
    );
    return reply.status(200).send(summary);
  };

  update = async (
    request: FastifyRequest<{ Params: IdParams; Body: UpdateOrganizationInput }>,
    reply: FastifyReply
  ) => {
    const updated = await this.orgService.update(
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
    await this.orgService.delete(request.actor, request.params.id);
    return reply.status(204).send();
  };
}
