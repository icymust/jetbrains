import { createHash } from 'node:crypto';
import type { ScanResult } from './scanner.js';
import type { AnalyzedGraph, AnalyzedNode, ProjectRelation } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key)) &&
    keys.every((key) => Object.hasOwn(value, key));
}

function nonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function diagnosticId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,80}$/.test(value)) return '<invalid or redacted ID>';
  return JSON.stringify(value);
}

function stableId(type: 'service' | 'feature', name: string, parentName = ''): string {
  const identity = `${parentName.toLowerCase().trim()}\0${name.toLowerCase().trim()}`;
  const slug = name.normalize('NFKD').toLowerCase()
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 40) || 'node';
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 8);
  return `${type}-${slug}-${digest}`;
}

export function validateGraph(raw: unknown, scan: ScanResult): AnalyzedGraph {
  if (!isRecord(raw) || !hasOnlyKeys(raw, ['nodes', 'relations']) ||
      !Array.isArray(raw.nodes) || !Array.isArray(raw.relations) ||
      raw.nodes.length === 0 || raw.nodes.length > 100 || raw.relations.length > 200) {
    throw new Error('Invalid graph shape');
  }

  const scannedPaths = new Set(scan.files.map((file) => file.path));
  const nodesByTemporaryId = new Map<string, AnalyzedNode>();
  for (const value of raw.nodes) {
    if (!isRecord(value) || !hasOnlyKeys(value, ['id', 'name', 'type', 'evidence_paths']) ||
        !nonemptyString(value.id) || !nonemptyString(value.name) ||
        (value.type !== 'service' && value.type !== 'feature') ||
        !Array.isArray(value.evidence_paths) || value.evidence_paths.length === 0 ||
        value.evidence_paths.length > 20 ||
        !value.evidence_paths.every((path) => typeof path === 'string' && scannedPaths.has(path))) {
      throw new Error('Invalid node or unsupported evidence path');
    }
    if (nodesByTemporaryId.has(value.id)) throw new Error('Duplicate node ID');
    nodesByTemporaryId.set(value.id, {
      id: value.id,
      name: value.name.trim(),
      type: value.type,
      evidence_paths: [...new Set(value.evidence_paths as string[])],
    });
  }

  const services = [...nodesByTemporaryId.values()].filter((node) => node.type === 'service');
  if (services.length === 0) throw new Error('Graph needs a service');

  const parents = new Map<string, string>();
  const uniqueRelations = new Set<string>();
  const relations: ProjectRelation[] = [];
  for (const [index, value] of raw.relations.entries()) {
    const at = `Relation ${index}`;
    if (!isRecord(value)) throw new Error(`${at}: expected an object`);
    if (!hasOnlyKeys(value, ['parent_id', 'child_id', 'label'])) {
      throw new Error(`${at}: expected only parent_id, child_id, and label fields`);
    }
    if (!nonemptyString(value.parent_id)) throw new Error(`${at}: parent_id must be a nonblank string`);
    if (!nonemptyString(value.child_id)) throw new Error(`${at}: child_id must be a nonblank string`);
    const endpoints = `${diagnosticId(value.parent_id)} -> ${diagnosticId(value.child_id)}`;
    if (!nonemptyString(value.label)) throw new Error(`${at} (${endpoints}): label must be a nonblank string`);
    if (value.label.trim().length > 40) {
      throw new Error(`${at} (${endpoints}): label exceeds 40 characters after trimming (${value.label.trim().length})`);
    }
    if (/[\r\n\t]/.test(value.label)) {
      throw new Error(`${at} (${endpoints}): label contains a tab or line break`);
    }
    const parent = nodesByTemporaryId.get(value.parent_id);
    const child = nodesByTemporaryId.get(value.child_id);
    if (!parent) throw new Error(`${at} (${endpoints}): unknown parent_id ${diagnosticId(value.parent_id)}`);
    if (!child) throw new Error(`${at} (${endpoints}): unknown child_id ${diagnosticId(value.child_id)}`);
    if (parent.id === child.id) throw new Error(`${at} (${endpoints}): self-relation is not allowed`);
    if (parent.type === 'service' && child.type === 'feature' && value.label.trim().toLowerCase() === 'contains') {
      const previousParent = parents.get(child.id);
      if (previousParent && previousParent !== parent.id) {
        throw new Error(`${at} (${endpoints}): feature already belongs to service ${diagnosticId(previousParent)}`);
      }
      parents.set(child.id, parent.id);
    }
    const label = value.label.trim();
    const key = `${parent.id}\0${child.id}\0${label.toLowerCase()}`;
    if (!uniqueRelations.has(key)) {
      uniqueRelations.add(key);
      relations.push({ parent_id: parent.id, child_id: child.id, label });
    }
  }

  const stableIds = new Map<string, string>();
  const usedStableIds = new Set<string>();
  for (const node of nodesByTemporaryId.values()) {
    const parent = node.type === 'feature' ? nodesByTemporaryId.get(parents.get(node.id) ?? '') : undefined;
    if (node.type === 'feature' && !parent) {
      throw new Error(`Feature ${diagnosticId(node.id)} has no containing service`);
    }
    const id = stableId(node.type, node.name, parent?.name);
    if (usedStableIds.has(id)) throw new Error('Duplicate service or feature name');
    usedStableIds.add(id);
    stableIds.set(node.id, id);
  }

  return {
    nodes: [...nodesByTemporaryId.values()].map((node) => ({ ...node, id: stableIds.get(node.id)! })),
    relations: relations.map((relation) => ({
      parent_id: stableIds.get(relation.parent_id)!,
      child_id: stableIds.get(relation.child_id)!,
      label: relation.label,
    })),
  };
}
