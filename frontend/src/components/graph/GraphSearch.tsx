import { useMemo, useState } from 'react'
import { Panel, useReactFlow } from '@xyflow/react'
import { Search, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Graph, ProjectNode } from '@/lib/api'

/**
 * Search across the map's nodes, with hits grouped by kind.
 *
 * It must live inside <ReactFlow> rather than beside it: useReactFlow only resolves within
 * that subtree, and moving the viewport to a hit is the point of choosing one.
 */
export function GraphSearch({
  graph,
  onSelect,
}: {
  graph: Graph
  onSelect: (nodeId: string) => void
}) {
  const { fitView } = useReactFlow()
  const [query, setQuery] = useState('')

  const trimmed = query.trim()

  const { services, features } = useMemo(() => {
    if (!trimmed) return { services: [], features: [] }
    const needle = trimmed.toLowerCase()
    const hits = graph.nodes.filter((node) => node.name.toLowerCase().includes(needle))
    return {
      services: hits.filter((node) => node.type === 'service'),
      features: hits.filter((node) => node.type === 'feature'),
    }
  }, [graph.nodes, trimmed])

  const choose = (nodeId: string) => {
    onSelect(nodeId)
    // Framing one node by id, so React Flow resolves its absolute position itself —
    // a feature's own position is relative to the service it orbits.
    void fitView({ nodes: [{ id: nodeId }], duration: 600, maxZoom: 1.5, padding: 0.6 })
    setQuery('')
  }

  const total = services.length + features.length

  return (
    <Panel position="top-center">
      <div className="w-52 max-w-[calc(100vw-2rem)] sm:w-64 lg:w-80">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('')
            }}
            placeholder="Search services and features…"
            aria-label="Search the map"
            className="bg-popover pr-8 pl-8 shadow-lg dark:bg-popover"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear search"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={() => setQuery('')}
            >
              <X />
            </Button>
          )}
        </div>

        {trimmed && (
          <Card className="mt-2 py-0 shadow-lg">
            {total === 0 ? (
              <p className="px-3 py-2.5 text-xs text-muted-foreground">
                Nothing matches “{trimmed}”.
              </p>
            ) : (
              <ScrollArea viewportClassName="max-h-72">
                <div className="space-y-3 p-2">
                  <Group title="Services" nodes={services} onChoose={choose} />
                  <Group title="Features" nodes={features} onChoose={choose} />
                </div>
              </ScrollArea>
            )}
          </Card>
        )}
      </div>
    </Panel>
  )
}

/** One kind's hits. An empty kind is dropped rather than shown as a bare heading. */
function Group({
  title,
  nodes,
  onChoose,
}: {
  title: string
  nodes: ProjectNode[]
  onChoose: (nodeId: string) => void
}) {
  if (nodes.length === 0) return null

  return (
    <div className="space-y-1">
      <p className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title} ({nodes.length})
      </p>
      <ul>
        {nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-muted"
              onClick={() => onChoose(node.id)}
            >
              {/* Same markers the inspector uses, so a hit reads as the node it is. */}
              <span
                aria-hidden
                className={
                  node.type === 'service'
                    ? 'size-2 shrink-0 rounded-full bg-primary'
                    : 'size-2 shrink-0 rounded-full border border-border bg-muted'
                }
              />
              <span className="truncate text-sm">{node.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
