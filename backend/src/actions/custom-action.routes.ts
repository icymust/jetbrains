import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  createOpenAICustomActionRequester,
  executeCustomAction,
  type CustomActionRequester,
} from '../ai/openai-custom-action.js';
import { buildNodeContext, NodeContextError, type ContextProject } from '../nodes/node-context.js';

const maxNameLength = 80;
const maxIconLength = 40;
const maxPromptLength = 4000;
const maxAdditionalInstructionsLength = 2000;

interface Project extends ContextProject {
  name: string;
}

interface CustomActionRow {
  id: string;
  project_id: string;
  node_id: string;
  name: string;
  icon: string;
  prompt: string;
  created_at: string;
}

interface PublicCustomAction {
  id: string;
  name: string;
  icon: string;
  prompt: string;
}

function publicAction(action: CustomActionRow): PublicCustomAction {
  return { id: action.id, name: action.name, icon: action.icon, prompt: action.prompt };
}

function sendContextError(
  reply: FastifyReply,
  error: unknown,
  log: (error: unknown) => void,
) {
  if (error instanceof NodeContextError) {
    return reply.code(error.status).send({ error: error.message });
  }
  log(error);
  return reply.code(500).send({ error: 'Service context could not be built' });
}

function requireText(
  value: string,
  field: 'name' | 'icon' | 'prompt',
): string {
  const trimmed = value.trim();
  if (!trimmed) throw new NodeContextError(400, `Action ${field} must not be blank`);
  return trimmed;
}

function parseAdditionalInstructions(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new NodeContextError(400, 'Invalid custom action execution request');
  }
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'additional_instructions')) {
    throw new NodeContextError(400, 'Invalid custom action execution request');
  }
  const value = record.additional_instructions;
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > maxAdditionalInstructionsLength) {
    throw new NodeContextError(400, 'Additional instructions must be at most 2000 characters');
  }
  return value.trim() || undefined;
}

export function registerCustomActionRoutes(
  app: FastifyInstance,
  database: DatabaseSync,
  requester: CustomActionRequester = createOpenAICustomActionRequester(),
): void {
  const findProject = (id: string): Project | undefined =>
    database.prepare('SELECT id, name, path FROM projects WHERE id = ?').get(id) as Project | undefined;
  const findAction = (projectId: string, nodeId: string, actionId: string): CustomActionRow | undefined =>
    database.prepare(`
      SELECT id, project_id, node_id, name, icon, prompt, created_at
      FROM custom_actions WHERE id = ? AND project_id = ? AND node_id = ?
    `).get(actionId, projectId, nodeId) as CustomActionRow | undefined;
  const serviceContext = async (project: Project, nodeId: string, readEvidenceFiles: boolean) => {
    const context = await buildNodeContext(project, nodeId, { readEvidenceFiles });
    if (context.node_type !== 'service') {
      throw new NodeContextError(400, 'Custom actions are only supported for service nodes');
    }
    return context;
  };

  app.post<{
    Params: { projectId: string; nodeId: string };
    Body: { name: string; icon: string; prompt: string };
  }>(
    '/projects/:projectId/nodes/:nodeId/actions',
    {
      schema: {
        body: {
          type: 'object', required: ['name', 'icon', 'prompt'], additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: maxNameLength },
            icon: { type: 'string', minLength: 1, maxLength: maxIconLength },
            prompt: { type: 'string', minLength: 1, maxLength: maxPromptLength },
          },
        },
      },
    },
    async (request, reply) => {
      const project = findProject(request.params.projectId);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      try {
        await serviceContext(project, request.params.nodeId, false);
        const action: CustomActionRow = {
          id: randomUUID(), project_id: project.id, node_id: request.params.nodeId,
          name: requireText(request.body.name, 'name'),
          icon: requireText(request.body.icon, 'icon'),
          prompt: requireText(request.body.prompt, 'prompt'),
          created_at: new Date().toISOString(),
        };
        database.prepare(`
          INSERT INTO custom_actions (id, project_id, node_id, name, icon, prompt, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(action.id, action.project_id, action.node_id, action.name, action.icon,
          action.prompt, action.created_at);
        return reply.code(201).send(publicAction(action));
      } catch (error) {
        return sendContextError(reply, error, (err) =>
          app.log.error({ projectId: project.id, nodeId: request.params.nodeId, err },
            'Custom action creation failed'));
      }
    },
  );

  app.get<{ Params: { projectId: string; nodeId: string } }>(
    '/projects/:projectId/nodes/:nodeId/actions',
    async (request, reply) => {
      const project = findProject(request.params.projectId);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      try {
        await serviceContext(project, request.params.nodeId, false);
        const actions = database.prepare(`
          SELECT id, project_id, node_id, name, icon, prompt, created_at
          FROM custom_actions WHERE project_id = ? AND node_id = ?
          ORDER BY created_at, id
        `).all(project.id, request.params.nodeId) as unknown as CustomActionRow[];
        return { actions: actions.map(publicAction) };
      } catch (error) {
        return sendContextError(reply, error, (err) =>
          app.log.error({ projectId: project.id, nodeId: request.params.nodeId, err },
            'Custom action listing failed'));
      }
    },
  );

  app.post<{
    Params: { projectId: string; nodeId: string; actionId: string };
    Body: unknown;
  }>(
    '/projects/:projectId/nodes/:nodeId/actions/:actionId/execute',
    async (request, reply) => {
      const project = findProject(request.params.projectId);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      let additionalInstructions: string | undefined;
      try {
        additionalInstructions = parseAdditionalInstructions(request.body);
      } catch (error) {
        return sendContextError(reply, error, (err) =>
          app.log.error({ projectId: project.id, nodeId: request.params.nodeId, err },
            'Custom action execution request validation failed'));
      }
      let context;
      try {
        context = await serviceContext(project, request.params.nodeId, true);
      } catch (error) {
        return sendContextError(reply, error, (err) =>
          app.log.error({ projectId: project.id, nodeId: request.params.nodeId, err },
            'Custom action context build failed'));
      }
      const action = findAction(project.id, request.params.nodeId, request.params.actionId);
      if (!action) return reply.code(404).send({ error: 'Custom action not found' });
      if (context.evidence_files.length === 0) {
        return reply.code(409).send({ error: 'Service has no readable evidence' });
      }
      try {
        const output = await executeCustomAction(action, context, additionalInstructions, requester);
        return {
          action_id: action.id,
          action_name: action.name,
          node_id: context.node_id,
          node_name: context.node_name,
          status: 'done',
          output,
        };
      } catch (error) {
        app.log.error({ projectId: project.id, nodeId: context.node_id, actionId: action.id, err: error },
          'Custom action execution failed');
        return reply.code(500).send({ error: 'Custom action execution failed' });
      }
    },
  );

  app.delete<{ Params: { projectId: string; nodeId: string; actionId: string } }>(
    '/projects/:projectId/nodes/:nodeId/actions/:actionId',
    async (request, reply) => {
      const project = findProject(request.params.projectId);
      if (!project) return reply.code(404).send({ error: 'Project not found' });
      try {
        await serviceContext(project, request.params.nodeId, false);
      } catch (error) {
        return sendContextError(reply, error, (err) =>
          app.log.error({ projectId: project.id, nodeId: request.params.nodeId, err },
            'Custom action deletion failed'));
      }
      const result = database.prepare(`
        DELETE FROM custom_actions WHERE id = ? AND project_id = ? AND node_id = ?
      `).run(request.params.actionId, project.id, request.params.nodeId);
      if (result.changes === 0) return reply.code(404).send({ error: 'Custom action not found' });
      return { deleted: true };
    },
  );
}
