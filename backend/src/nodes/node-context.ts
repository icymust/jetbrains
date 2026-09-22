import { realpath, readFile, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';
import type { ProjectNode, ProjectRelation } from '../analyzer/types.js';
import { readProjectMap } from '../map/project-map-file.js';

const maxEvidenceFileBytes = 32 * 1024;
const maxEvidenceBytes = 128 * 1024;

export interface ContextProject {
  id: string;
  path: string;
}

export interface EvidenceFile {
  path: string;
  content: string;
  truncated: boolean;
}

export interface NodeContext {
  node_id: string;
  node_name: string;
  node_type: ProjectNode['type'];
  features: ProjectNode[];
  relations: ProjectRelation[];
  evidence_paths: string[];
  missing_evidence_paths: string[];
  context: string;
  evidence_files: EvidenceFile[];
}

export class NodeContextError extends Error {
  constructor(readonly status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'NodeContextError';
  }
}

function within(root: string, path: string): boolean {
  return path === root || path.startsWith(root + sep);
}

async function readEvidence(projectPath: string, paths: string[]): Promise<{
  files: EvidenceFile[];
  missing: string[];
}> {
  const root = await realpath(projectPath);
  const files: EvidenceFile[] = [];
  const missing: string[] = [];
  let remaining = maxEvidenceBytes;

  for (const path of paths) {
    if (isAbsolute(path)) throw new NodeContextError(500, 'Project map contains an unsafe evidence path');
    const candidate = resolve(root, path);
    if (!within(root, candidate)) throw new NodeContextError(500, 'Project map contains an unsafe evidence path');

    let canonical: string;
    try {
      canonical = await realpath(candidate);
      if (!within(root, canonical) || !(await stat(canonical)).isFile()) {
        throw new NodeContextError(500, 'Project map contains an unsafe evidence path');
      }
    } catch (error) {
      if (error instanceof NodeContextError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        missing.push(path);
        continue;
      }
      throw new NodeContextError(500, 'Evidence file could not be read', { cause: error });
    }

    if (remaining === 0) break;
    try {
      const content = await readFile(canonical);
      const size = Math.min(content.length, maxEvidenceFileBytes, remaining);
      files.push({ path, content: content.subarray(0, size).toString('utf8'), truncated: size < content.length });
      remaining -= size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        missing.push(path);
        continue;
      }
      throw new NodeContextError(500, 'Evidence file could not be read', { cause: error });
    }
  }
  return { files, missing };
}

export async function buildNodeContext(
  project: ContextProject,
  nodeId: string,
  options: { readEvidenceFiles?: boolean } = {},
): Promise<NodeContext> {
  let map;
  try {
    map = await readProjectMap(project.path);
  } catch (error) {
    throw new NodeContextError(500, 'Project map could not be read', { cause: error });
  }
  if (!map) throw new NodeContextError(404, 'Project map not loaded');
  if (map.project_id !== project.id) throw new NodeContextError(409, 'Project map belongs to another project');

  const node = map.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new NodeContextError(404, 'Node not found');
  const features = node.type === 'service'
    ? map.relations
      .filter((relation) => relation.parent_id === node.id && relation.label === 'contains')
      .map((relation) => map.nodes.find((candidate) => candidate.id === relation.child_id))
      .filter((candidate): candidate is ProjectNode => candidate?.type === 'feature')
    : [];
  const relevantIds = new Set([node.id, ...features.map((feature) => feature.id)]);
  const relations = map.relations.filter((relation) =>
    relevantIds.has(relation.parent_id) || relevantIds.has(relation.child_id));
  const evidencePaths = [...new Set(
    [node, ...features].flatMap((candidate) => map.evidence_paths_by_node?.[candidate.id] ?? []),
  )];
  const evidence = options.readEvidenceFiles === false
    ? { files: [], missing: [] }
    : await readEvidence(project.path, evidencePaths);
  const context = JSON.stringify({
    node, features, relations,
    evidence_files: evidence.files,
    missing_evidence_paths: evidence.missing,
  }, null, 2);

  return {
    node_id: node.id,
    node_name: node.name,
    node_type: node.type,
    features,
    relations,
    evidence_paths: evidencePaths,
    missing_evidence_paths: evidence.missing,
    context,
    evidence_files: evidence.files,
  };
}
