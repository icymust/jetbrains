/**
 * Mock architecture graphs for the graph page, shaped exactly like the backend's
 * `GET /projects/:id/nodes` response so the page is drop-in for real data later.
 *
 * Two rules hold by construction:
 *   - a feature is only ever connected to the one service that declares it ("contains")
 *   - services are the only nodes connected to each other (protocol-labelled relations)
 */

import type { Graph, ProjectNode, ProjectRelation } from './api'

interface ServiceBlueprint {
  name: string
  /** Features belong to this service and cannot be attached anywhere else. */
  features: string[]
}

interface ServiceLink {
  from: string
  to: string
  label: string
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Flattens a blueprint into the backend's flat node/relation shape. */
function buildGraph(services: ServiceBlueprint[], links: ServiceLink[] = []): Graph {
  const nodes: ProjectNode[] = []
  const relations: ProjectRelation[] = []
  const serviceIds = new Map<string, string>()

  for (const service of services) {
    const serviceId = `service-${slug(service.name)}`
    serviceIds.set(service.name, serviceId)
    nodes.push({ id: serviceId, name: service.name, type: 'service' })

    for (const feature of service.features) {
      const featureId = `feature-${slug(service.name)}-${slug(feature)}`
      nodes.push({ id: featureId, name: feature, type: 'feature' })
      relations.push({ parent_id: serviceId, child_id: featureId, label: 'contains' })
    }
  }

  for (const link of links) {
    const parent_id = serviceIds.get(link.from)
    const child_id = serviceIds.get(link.to)
    if (!parent_id || !child_id) {
      throw new Error(`Link references an unknown service: ${link.from} -> ${link.to}`)
    }
    relations.push({ parent_id, child_id, label: link.label })
  }

  return { nodes, relations }
}

const services: ServiceBlueprint[] = [
  { name: 'Web App', features: ['Routing', 'Project List', 'Graph Canvas', 'Theming'] },
  { name: 'API Gateway', features: ['Rate Limiting', 'Request Routing', 'CORS'] },
  { name: 'Auth Service', features: ['Login', 'Sessions', 'Roles', 'Password Reset'] },
  { name: 'Orders Service', features: ['Cart', 'Checkout', 'Order History', 'Refunds'] },
  { name: 'Payments Service', features: ['Card Capture', 'Payouts', 'Invoices'] },
  { name: 'Notifications', features: ['Email', 'Push'] },
  { name: 'Postgres', features: ['Migrations', 'Read Replicas'] },
]

const links: ServiceLink[] = [
  { from: 'Web App', to: 'API Gateway', label: 'HTTP' },
  { from: 'API Gateway', to: 'Auth Service', label: 'gRPC' },
  { from: 'API Gateway', to: 'Orders Service', label: 'gRPC' },
  { from: 'Orders Service', to: 'Payments Service', label: 'HTTP' },
  { from: 'Orders Service', to: 'Notifications', label: 'AMQP' },
  { from: 'Auth Service', to: 'Postgres', label: 'SQL' },
  { from: 'Orders Service', to: 'Postgres', label: 'SQL' },
]

/** The default fixture: uneven feature counts and a mix of protocols. */
export const mockGraph: Graph = buildGraph(services, links)

/** One service, no links — exercises the centred single-service layout. */
export const mockSingleServiceGraph: Graph = buildGraph([
  { name: 'Monolith', features: ['Auth', 'Billing', 'Admin', 'Reporting', 'Search'] },
])

/** A service carrying far more features than its neighbours — exercises arc crowding. */
export const mockDenseGraph: Graph = buildGraph(
  [
    {
      name: 'Platform Core',
      features: [
        'Accounts', 'Billing', 'Webhooks', 'Audit Log', 'Feature Flags',
        'Search Index', 'Scheduler', 'File Storage', 'Metrics', 'Tracing',
      ],
    },
    { name: 'Edge Proxy', features: ['TLS Termination', 'Caching'] },
    { name: 'Worker Pool', features: ['Job Queue'] },
  ],
  [
    { from: 'Edge Proxy', to: 'Platform Core', label: 'HTTP' },
    { from: 'Platform Core', to: 'Worker Pool', label: 'AMQP' },
  ],
)

if (import.meta.env.DEV) {
  assertGraphRules(mockGraph)
  assertGraphRules(mockSingleServiceGraph)
  assertGraphRules(mockDenseGraph)
}

/**
 * Re-checks the two structural rules at load time in development, so a future edit that
 * breaks them fails loudly instead of quietly rendering a wrong picture.
 */
function assertGraphRules({ nodes, relations }: Graph): void {
  const typeById = new Map(nodes.map((node) => [node.id, node.type]))
  const containingServices = new Map<string, number>()

  for (const relation of relations) {
    const parent = typeById.get(relation.parent_id)
    const child = typeById.get(relation.child_id)

    if (!parent || !child) {
      throw new Error(`Relation points at a missing node: ${relation.parent_id} -> ${relation.child_id}`)
    }
    if (parent === 'feature' && child === 'feature') {
      throw new Error(`Features must not connect to each other: ${relation.parent_id} -> ${relation.child_id}`)
    }
    if (child === 'feature') {
      if (parent !== 'service' || relation.label !== 'contains') {
        throw new Error(`A feature may only be contained by a service: ${relation.child_id}`)
      }
      containingServices.set(relation.child_id, (containingServices.get(relation.child_id) ?? 0) + 1)
    }
  }

  for (const node of nodes) {
    if (node.type === 'feature' && containingServices.get(node.id) !== 1) {
      throw new Error(`Feature ${node.id} must have exactly one containing service`)
    }
  }
}
