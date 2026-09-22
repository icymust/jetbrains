import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance } from 'fastify';
import { analyzeProject, createOpenAIRequester, type GraphRequester } from '../ai/openai-analyzer.js';
import { scanProject } from '../analyzer/scanner.js';
import { toPublicGraph } from '../analyzer/types.js';
import { AnalysisBusyError, CommitMonitor, type MonitoredProject } from '../git/commit-monitor.js';
import { readProjectMap, saveProjectMap } from '../map/project-map-file.js';

interface Project {
  id: string;
  name: string;
  path: string;
}

function validateProjectPath(input: string): string {
  let path: string;

  try {
    path = realpathSync(resolve(input));
    if (!statSync(path).isDirectory()) {
      throw new Error('not a directory');
    }
  } catch {
    throw new Error('Project path must exist and be a directory');
  }

  try {
    const result = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: path,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    });
    if (result.trim() !== 'true') {
      throw new Error('not a working tree');
    }
  } catch {
    throw new Error('Project path must be a Git working tree');
  }

  return path;
}

export function registerProjectRoutes(
  app: FastifyInstance,
  database: DatabaseSync,
  requester: GraphRequester = createOpenAIRequester(),
): void {
  const findProject = (id: string): Project | undefined =>
    database.prepare('SELECT id, name, path FROM projects WHERE id = ?').get(id) as Project | undefined;
  const monitor = new CommitMonitor(async (project: MonitoredProject, commit) => {
    app.log.info({ projectId: project.id, commit }, 'Project analysis started');
    const scan = await scanProject(project.path);
    const analyzed = await analyzeProject(scan, requester);
    const graph = toPublicGraph(analyzed);
    await saveProjectMap(project.path, {
      project_id: project.id,
      ...(commit ? { commit } : {}),
      generated_at: new Date().toISOString(),
      ...graph,
    });
    app.log.info({ projectId: project.id, commit }, 'Project analysis completed');
    return graph;
  }, app.log);
  app.addHook('onClose', async () => monitor.stopAll());

  app.post<{ Body: { name: string; path: string } }>(
    '/projects',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'path'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1 },
            path: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const name = request.body.name.trim();
      if (!name) {
        return reply.code(400).send({ error: 'Project name must not be blank' });
      }

      let path: string;
      try {
        path = validateProjectPath(request.body.path);
      } catch (error) {
        return reply.code(400).send({ error: (error as Error).message });
      }

      const project: Project = { id: randomUUID(), name, path };
      database.prepare('INSERT INTO projects (id, name, path) VALUES (?, ?, ?)')
        .run(project.id, project.name, project.path);
      return reply.code(201).send(project);
    },
  );

  app.get('/projects', async () => ({
    projects: database.prepare('SELECT id, name, path FROM projects').all() as unknown as Project[],
  }));

  app.get<{ Params: { id: string } }>('/projects/:id', async (request, reply) => {
    const project = findProject(request.params.id);
    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }
    return project;
  });

  app.post<{ Params: { id: string } }>('/projects/:id/load', async (request, reply) => {
    const project = findProject(request.params.id);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    try {
      return await monitor.load(project);
    } catch (error) {
      if (error instanceof AnalysisBusyError) {
        return reply.code(409).send({ error: error.message });
      }
      app.log.error({ projectId: project.id, err: error }, 'Project analysis failed');
      return reply.code(500).send({ error: 'Project analysis failed' });
    }
  });

  app.get<{ Params: { id: string } }>('/projects/:id/nodes', async (request, reply) => {
    const project = findProject(request.params.id);
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    try {
      const map = await readProjectMap(project.path);
      if (!map) return reply.code(404).send({ error: 'Project map not loaded' });
      if (map.project_id !== project.id) {
        return reply.code(409).send({ error: 'Project map belongs to another project' });
      }
      return { nodes: map.nodes, relations: map.relations };
    } catch (error) {
      app.log.error({ projectId: project.id, err: error }, 'Project map read failed');
      return reply.code(500).send({ error: 'Project map could not be read' });
    }
  });
}
