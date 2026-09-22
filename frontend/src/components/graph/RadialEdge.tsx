import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from '@xyflow/react'

/** Breathing room between the end of a line and the circle it points at. */
const GAP = 5

/**
 * A straight edge trimmed back by each end's radius, so it touches the circles rather than
 * running across them.
 *
 * Z-order cannot solve this: React Flow forces an edge touching a child node up to that
 * child's z-index, so a "contains" line always outranks the service it belongs to. Ending
 * the line at the boundary sidesteps the stacking question entirely.
 */
export function RadialEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  data,
}: EdgeProps) {
  const sourceRadius = Number(data?.sourceRadius ?? 0) + GAP
  const targetRadius = Number(data?.targetRadius ?? 0) + GAP
  const label = data?.label as string | undefined

  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const length = Math.hypot(dx, dy)

  // Overlapping circles leave nothing to draw; a line would only poke out the far sides.
  if (length <= sourceRadius + targetRadius) return null

  const unitX = dx / length
  const unitY = dy / length
  const x1 = sourceX + unitX * sourceRadius
  const y1 = sourceY + unitY * sourceRadius
  const x2 = targetX - unitX * targetRadius
  const y2 = targetY - unitY * targetRadius

  return (
    <>
      <BaseEdge path={`M ${x1},${y1} L ${x2},${y2}`} style={style} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${(x1 + x2) / 2}px, ${(y1 + y2) / 2}px)`,
            }}
            className="pointer-events-none absolute rounded-md border bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
