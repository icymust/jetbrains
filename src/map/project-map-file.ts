import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectNode, ProjectRelation } from '../analyzer/types.js';

export interface ProjectMap {
  project_id: string;
  commit?: string;
  generated_at: string;
  nodes: ProjectNode[];
  relations: ProjectRelation[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validMap(value: unknown): value is ProjectMap {
  if (!isObject(value) || typeof value.project_id !== 'string' ||
      typeof value.generated_at !== 'string' ||
      (value.commit !== undefined && typeof value.commit !== 'string') ||
      !Array.isArray(value.nodes) || !Array.isArray(value.relations)) return false;

  const ids = new Set<string>();
  for (const node of value.nodes) {
    if (!isObject(node) || Object.keys(node).sort().join(',') !== 'id,name,type' ||
        typeof node.id !== 'string' || !node.id || typeof node.name !== 'string' || !node.name ||
        (node.type !== 'service' && node.type !== 'feature') || ids.has(node.id)) return false;
    ids.add(node.id);
  }
  if (ids.size === 0) return false;

  return value.relations.every((relation) => isObject(relation) &&
    Object.keys(relation).sort().join(',') === 'child_id,label,parent_id' &&
    typeof relation.parent_id === 'string' && ids.has(relation.parent_id) &&
    typeof relation.child_id === 'string' && ids.has(relation.child_id) &&
    typeof relation.label === 'string' && relation.label.trim().length > 0 &&
    relation.label.length <= 40);
}

export async function saveProjectMap(projectPath: string, map: ProjectMap): Promise<void> {
  if (!validMap(map)) throw new Error('Invalid project map');
  const destination = join(projectPath, 'ProjectMap.json');
  const temporary = join(projectPath, `.ProjectMap.json.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(map, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function readProjectMap(projectPath: string): Promise<ProjectMap | null> {
  let contents: string;
  try {
    contents = await readFile(join(projectPath, 'ProjectMap.json'), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const parsed: unknown = JSON.parse(contents);
  if (!validMap(parsed)) throw new Error('Invalid project map');
  return parsed;
}
