import type { NodeProps } from '@xyflow/react'

import { cn } from '@/lib/utils'
import { SERVICE_SIZE, type FlowNode } from '@/lib/graph-layout'
import { useNodeMenu } from '@/lib/node-menu-context'
import { CentreHandles, NodeActions } from './NodeActions'

/** A major architecture component: the large anchor other nodes orbit. */
export default function ServiceNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { openNodeId, projectId } = useNodeMenu()

  return (
    <>
      <NodeActions visible={openNodeId === id} projectId={projectId} nodeId={id} name={data.label} nodeType="service" />

      <div
        style={{ width: SERVICE_SIZE, height: SERVICE_SIZE }}
        className={cn(
          'flex items-center justify-center rounded-full border bg-card px-4 text-center',
          'ring-2 ring-primary/40 transition-[box-shadow,border-color] duration-150',
          'hover:ring-primary/70',
          selected && 'border-primary ring-4 ring-primary',
        )}
      >
        <CentreHandles />
        <span className="pointer-events-none text-sm leading-tight font-semibold text-card-foreground">
          {data.label}
        </span>
      </div>
    </>
  )
}
