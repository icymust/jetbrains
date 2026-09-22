import type { ProjectNode } from './api'
import { stableHash } from './stable-hash'

/**
 * Stand-in descriptions for nodes.
 *
 * These are NOT derived from the repository. `ProjectNode` carries only `id`, `name` and
 * `type`, so until the analyzer returns a description there is nothing real to show. The
 * wording is deliberately generic — it describes what a service or feature *is*, and never
 * claims anything specific about this codebase, so it cannot be mistaken for analysis. The
 * inspector labels it as a placeholder for the same reason.
 */
const serviceDescriptions = [
  'A major component of the system. It owns a distinct area of behaviour and talks to the services it depends on.',
  'A long-running service. It takes requests from its callers and coordinates the work behind them.',
  'One of the larger building blocks in this map, grouping the features listed below under a single responsibility.',
  'A standalone part of the architecture, deployed and scaled on its own terms.',
  'A component other parts of the system lean on. Its features describe what it offers them.',
]

const featureDescriptions = [
  'A capability owned by its service, grouped from the code that implements it.',
  'One slice of its service’s responsibility — a piece of behaviour that can be reasoned about on its own.',
  'Functionality that belongs to a single service and is exercised through it.',
  'A distinct area of behaviour inside its service, rather than a separate deployable thing.',
  'Part of what its service offers, named after the job it does.',
]

export function describeNode(node: ProjectNode): string {
  const pool = node.type === 'service' ? serviceDescriptions : featureDescriptions
  return pool[stableHash(node.id) % pool.length]
}
