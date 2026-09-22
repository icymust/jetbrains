import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
import { ArrowLeft } from 'lucide-react'
import '@xyflow/react/dist/style.css'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { NodeInspector } from '@/components/graph/NodeInspector'
import FeatureNode from '@/components/graph/FeatureNode'
import ServiceNode from '@/components/graph/ServiceNode'
import { toFlowGraph, type FlowNode } from '@/lib/graph-layout'
import { mockGraph } from '@/lib/mock-graph'
import { useTheme } from '@/lib/theme-context'
import { ThemeToggle } from '@/components/theme-toggle'

const nodeTypes = {
  service: ServiceNode,
  feature: FeatureNode,
}

/** Swap for mockSingleServiceGraph or mockDenseGraph to exercise the layout's extremes. */
const graph = mockGraph

export default function GraphLab() {
  const { theme } = useTheme()
  const initial = useMemo(() => toFlowGraph(graph), [])

  const [nodes, , onNodesChange] = useNodesState<FlowNode>(initial.nodes)
  const [edges, , onEdgesChange] = useEdgesState(initial.edges)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedNode = selectedId
    ? (graph.nodes.find((node) => node.id === selectedId) ?? null)
    : null

  const counts = useMemo(
    () => ({
      services: graph.nodes.filter((node) => node.type === 'service').length,
      features: graph.nodes.filter((node) => node.type === 'feature').length,
    }),
    [],
  )

  return (
    <div className="graph-canvas h-dvh w-full">
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
        <Panel position="top-left">
          <div className="flex max-w-64 flex-col gap-3">
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" nativeButton={false} render={<Link to="/" />}>
                <ArrowLeft />
                Back to projects
              </Button>
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary">{counts.services} services</Badge>
                <Badge variant="outline">{counts.features} features</Badge>
              </div>
              <ThemeToggle className="ml-auto" />
            </div>
            <GraphLegend />
          </div>
        </Panel>

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
    </div>
  )
}
