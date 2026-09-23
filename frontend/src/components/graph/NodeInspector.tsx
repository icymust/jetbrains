import { X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { Graph, ProjectNode } from '@/lib/api'
import { describeNode } from '@/lib/node-description'

interface Connection {
  id: string
  name: string
  type: ProjectNode['type']
  label: string
}

/** Details of the selected node and everything it is connected to. */
export function NodeInspector({
  node,
  graph,
  onClose,
}: {
  node: ProjectNode
  graph: Graph
  onClose: () => void
}) {
  const byId = new Map(graph.nodes.map((entry) => [entry.id, entry]))

  const resolve = (id: string, label: string): Connection | null => {
    const found = byId.get(id)
    return found ? { id: found.id, name: found.name, type: found.type, label } : null
  }

  const contains: Connection[] = []
  const outgoing: Connection[] = []
  const incoming: Connection[] = []

  for (const relation of graph.relations) {
    if (relation.parent_id === node.id) {
      const target = resolve(relation.child_id, relation.label)
      if (!target) continue
      if (relation.label === 'contains') contains.push(target)
      else outgoing.push(target)
    } else if (relation.child_id === node.id) {
      const source = resolve(relation.parent_id, relation.label)
      if (source) incoming.push(source)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="pr-8 text-base leading-tight">{node.name}</CardTitle>
        <Badge variant="secondary" className="w-fit capitalize">
          {node.type}
        </Badge>
        <CardDescription className="text-sm">{describeNode(node)}</CardDescription>
        {/* Said plainly: this text is generic, not something the analysis produced. */}
        <p className="text-[11px] text-muted-foreground/70">
          Placeholder — the analysis does not return descriptions yet.
        </p>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close details"
          className="absolute top-3 right-3"
          onClick={onClose}
        >
          <X />
        </Button>
      </CardHeader>

      <Separator />

      <CardContent className="p-0">
        <ScrollArea className="max-h-72">
          <div className="space-y-4 px-4 py-3">
            <Section title={`Features (${contains.length})`} connections={contains} hideLabel />
            <Section title="Calls" connections={outgoing} />
            <Section title="Called by" connections={incoming} />
            {contains.length === 0 && outgoing.length === 0 && incoming.length === 0 && (
              <p className="text-sm text-muted-foreground">No connections.</p>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

function Section({
  title,
  connections,
  hideLabel = false,
}: {
  title: string
  connections: Connection[]
  hideLabel?: boolean
}) {
  if (connections.length === 0) return null

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="space-y-1">
        {connections.map((connection) => (
          <li key={`${connection.id}-${connection.label}`} className="flex items-center gap-2">
            <span
              aria-hidden
              className={
                connection.type === 'service'
                  ? 'size-2 shrink-0 rounded-full bg-primary'
                  : 'size-2 shrink-0 rounded-full border border-border bg-muted'
              }
            />
            <span className="truncate text-sm">{connection.name}</span>
            {!hideLabel && (
              <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                {connection.label}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
