import type { NodeProps } from '@xyflow/react'

import { cn } from '@/lib/utils'
import { FEATURE_SIZE, type FlowNode } from '@/lib/graph-layout'
import { useNodeMenu } from '@/lib/node-menu-context'
import { CentreHandles, NodeActions } from './NodeActions'

/** A single piece of functionality, always owned by exactly one service. */
export default function FeatureNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { openNodeId, projectId } = useNodeMenu()

  return (
    <>
      <NodeActions visible={openNodeId === id} projectId={projectId} nodeId={id} name={data.label} nodeType="feature" />

      <div
        style={{ width: FEATURE_SIZE, height: FEATURE_SIZE }}
        className={cn(
          'flex items-center justify-center rounded-full border bg-muted px-2 text-center',
          'transition-[box-shadow,border-color] duration-150 hover:border-primary/60',
          selected && 'border-primary ring-2 ring-primary',
        )}
      >
        <CentreHandles />
        <span className="pointer-events-none text-[11px] leading-tight font-medium text-muted-foreground">
          {data.label}
        </span>
      </div>
    </>
  )
}
