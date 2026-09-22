/**
 * Turns the backend's flat graph into positioned React Flow nodes and edges.
 *
 * Services are spread evenly around a ring; each service's features fan out on an arc
 * pointing away from the centre of the graph. Everything is derived from the data, so the
 * layout holds for any number of services and features, and it is deterministic — the same
 * graph always produces the same picture.
 */

import type { Edge, Node } from '@xyflow/react'
import type { Graph, ProjectRelation } from './api'

export const SERVICE_SIZE = 132
export const FEATURE_SIZE = 72
/** Distance from a service's centre to its features' centres. */
export const ORBIT_RADIUS = 150

/** Smallest ring the services sit on, so small graphs are not cramped together. */
const MIN_RING_RADIUS = 260
/** Widest arc a service's features may span, in radians (~200°). */
const MAX_FEATURE_ARC = (200 * Math.PI) / 180
/** Angle allotted per feature before the arc stops widening. */
const ARC_PER_FEATURE = (42 * Math.PI) / 180
/** Clear space to leave between two neighbouring features. */
const FEATURE_GAP = 16

export interface GraphNodeData extends Record<string, unknown> {
  label: string
  type: 'service' | 'feature'
}

export type FlowNode = Node<GraphNodeData>

export interface FlowGraph {
  nodes: FlowNode[]
  edges: Edge[]
}

/** How wide an arc a service's features fan across. */
function featureArc(count: number, onlyService: boolean): number {
  // A lone service has no neighbours to avoid, so its features ring it completely.
  if (onlyService) return 2 * Math.PI * ((count - 1) / count)
  return Math.min(MAX_FEATURE_ARC, ARC_PER_FEATURE * Math.max(count - 1, 1))
}

/**
 * Pushes the orbit out far enough that neighbouring features never touch. Features sit
 * `step` radians apart, so their centres are `2 * orbit * sin(step / 2)` apart; solving that
 * for the width one feature needs gives the minimum radius.
 */
function orbitRadius(count: number, span: number): number {
  if (count < 2 || span <= 0) return ORBIT_RADIUS
  const step = span / (count - 1)
  const needed = (FEATURE_SIZE + FEATURE_GAP) / (2 * Math.sin(step / 2))
  return Math.max(ORBIT_RADIUS, needed)
}

/**
 * Radius that keeps neighbouring feature orbits from overlapping: each service claims a disc
 * of `orbit` radius, and fitting N such discs around a ring needs R >= orbit / sin(pi / N).
 */
function ringRadius(serviceCount: number, widestOrbit: number): number {
  if (serviceCount < 2) return 0
  const claimed = widestOrbit + FEATURE_SIZE / 2
  return Math.max(MIN_RING_RADIUS, claimed / Math.sin(Math.PI / serviceCount))
}

/** React Flow positions nodes by their top-left corner, so shift from the centre. */
function topLeft(centreX: number, centreY: number, size: number) {
  return { x: centreX - size / 2, y: centreY - size / 2 }
}

export function toFlowGraph(graph: Graph): FlowGraph {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const featuresByService = new Map<string, typeof graph.nodes>()
  const owned = new Set<string>()

  for (const relation of graph.relations) {
    if (relation.label !== 'contains') continue
    const feature = byId.get(relation.child_id)
    const service = byId.get(relation.parent_id)
    if (!feature || feature.type !== 'feature') continue
    if (!service || service.type !== 'service') continue
    // The backend allows only one containing service, but never trust that twice.
    if (owned.has(feature.id)) continue
    owned.add(feature.id)
    const siblings = featuresByService.get(relation.parent_id)
    if (siblings) siblings.push(feature)
    else featuresByService.set(relation.parent_id, [feature])
  }

  // A feature with no containing service should not exist, but if one arrives it goes on
  // the ring rather than vanishing from the picture.
  const services = graph.nodes.filter(
    (node) => node.type === 'service' || (node.type === 'feature' && !owned.has(node.id)),
  )

  const alone = services.length < 2

  // Each service's orbit is sized to its own feature count; the ring has to clear the widest.
  const orbits = new Map<string, { radius: number; span: number }>()
  for (const service of services) {
    const count = featuresByService.get(service.id)?.length ?? 0
    const span = count > 0 ? featureArc(count, alone) : 0
    orbits.set(service.id, { radius: orbitRadius(count, span), span })
  }
  const widestOrbit = Math.max(ORBIT_RADIUS, ...[...orbits.values()].map((o) => o.radius))

  const radius = ringRadius(services.length, widestOrbit)
  const nodes: FlowNode[] = []

  services.forEach((service, index) => {
    // Start at the top and go clockwise; a lone service sits in the middle.
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / services.length
    const centreX = alone ? 0 : Math.cos(angle) * radius
    const centreY = alone ? 0 : Math.sin(angle) * radius

    // A parent must be added before its children for React Flow to resolve `parentId`.
    const size = service.type === 'service' ? SERVICE_SIZE : FEATURE_SIZE
    nodes.push({
      id: service.id,
      type: service.type,
      position: topLeft(centreX, centreY, size),
      data: { label: service.name, type: service.type },
    })

    const features = featuresByService.get(service.id) ?? []
    if (features.length === 0) return

    // Features fan around the direction pointing away from the graph's centre, so they
    // splay outwards instead of crowding the middle. A lone service fans a full circle.
    const outward = alone ? -Math.PI / 2 : angle
    const { radius: orbit, span } = orbits.get(service.id)!

    features.forEach((feature, featureIndex) => {
      const offset =
        features.length === 1 ? 0 : -span / 2 + (featureIndex / (features.length - 1)) * span
      const featureAngle = outward + offset

      // Children are positioned relative to the parent's top-left corner.
      const relativeX = SERVICE_SIZE / 2 + Math.cos(featureAngle) * orbit
      const relativeY = SERVICE_SIZE / 2 + Math.sin(featureAngle) * orbit

      nodes.push({
        id: feature.id,
        type: 'feature',
        // `extent: 'parent'` is deliberately not set — it would clip features inside the
        // service's own box. `parentId` alone makes a service drag its orbit with it.
        parentId: service.id,
        position: topLeft(relativeX, relativeY, FEATURE_SIZE),
        data: { label: feature.name, type: 'feature' },
      })
    })
  })

  const knownIds = new Set(nodes.map((node) => node.id))
  const edges: Edge[] = graph.relations
    .filter((relation) => knownIds.has(relation.parent_id) && knownIds.has(relation.child_id))
    .map(toEdge)

  return { nodes, edges }
}

function toEdge(relation: ProjectRelation): Edge {
  const contains = relation.label === 'contains'
  return {
    id: `${relation.parent_id}--${relation.child_id}--${relation.label}`,
    source: relation.parent_id,
    target: relation.child_id,
    type: 'straight',
    // A "contains" line is structural, so it stays quiet; a protocol link is the
    // interesting relationship and carries a readable label.
    ...(contains
      ? { style: { strokeWidth: 1 }, selectable: false }
      : {
          label: relation.label,
          labelShowBg: true,
          labelBgPadding: [8, 4] as [number, number],
          labelBgBorderRadius: 6,
          style: { strokeWidth: 1.5 },
        }),
  }
}
