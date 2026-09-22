import { useMemo, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { NodeInspector } from '@/components/graph/NodeInspector'
import FeatureNode from '@/components/graph/FeatureNode'
import ServiceNode from '@/components/graph/ServiceNode'
import type { Graph } from '@/lib/api'
import { toFlowGraph, type FlowNode } from '@/lib/graph-layout'
import { useTheme } from '@/lib/theme-context'

const nodeTypes = {
  service: ServiceNode,
  feature: FeatureNode,
}

/**
 * Renders one architecture graph. Mount it with a `key` tied to the data so a fresh
 * analysis rebuilds the layout instead of leaving the previous positions in place.
 */
export function GraphCanvas({ graph, header }: { graph: Graph; header?: React.ReactNode }) {
  const { theme } = useTheme()
  const initial = useMemo(() => toFlowGraph(graph), [graph])

  const [nodes, , onNodesChange] = useNodesState<FlowNode>(initial.nodes)
  const [edges, , onEdgesChange] = useEdgesState(initial.edges)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedNode = selectedId
    ? (graph.nodes.find((node) => node.id === selectedId) ?? null)
    : null

  return (
    <ReactFlow<FlowNode>
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      colorMode={theme}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      onNodeClick={(_, node: Node) => setSelectedId(node.id)}
      onPaneClick={() => setSelectedId(null)}
    >
      {header && <Panel position="top-left">{header}</Panel>}

      {selectedNode && (
        <Panel position="top-right">
          <NodeInspector
            node={selectedNode}
            graph={graph}
            onClose={() => setSelectedId(null)}
          />
        </Panel>
      )}

      <MiniMap
        pannable
        zoomable
        nodeStrokeWidth={2}
        nodeColor={(node) =>
          node.type === 'service' ? 'var(--primary)' : 'var(--muted-foreground)'
        }
        className="rounded-lg border"
      />
      <Controls showInteractive={false} />
      <Background gap={26} size={1.5} />
    </ReactFlow>
  )
}
