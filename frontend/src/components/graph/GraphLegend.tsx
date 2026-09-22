import { Card, CardContent } from '@/components/ui/card'

/** Explains the two node sizes and what the edge labels mean. */
export function GraphLegend() {
  return (
    <Card size="sm" className="max-w-64">
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-3 shrink-0 rounded-full border bg-card ring-2 ring-primary/40" />
          <span className="text-xs">Service — a major component</span>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-2 shrink-0 rounded-full border bg-muted" />
          <span className="text-xs">Feature — owned by one service</span>
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Thin lines tie a feature to its service. Labelled lines are calls between services,
          named after the protocol.
        </p>
      </CardContent>
    </Card>
  )
}
