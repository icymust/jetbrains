import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { Map as MapIcon, X } from 'lucide-react'
import '@xyflow/react/dist/style.css'

import { Button } from '@/components/ui/button'
import { AuditPanel } from '@/components/graph/AuditPanel'
import { ChatDialog } from '@/components/graph/ChatDialog'
import { CreateActionDialog } from '@/components/graph/CreateActionDialog'
import { GraphSearch } from '@/components/graph/GraphSearch'
import { NodeInspector } from '@/components/graph/NodeInspector'
import { TestsPanel } from '@/components/graph/TestsPanel'
import FeatureNode from '@/components/graph/FeatureNode'
import { RadialEdge } from '@/components/graph/RadialEdge'
import ServiceNode from '@/components/graph/ServiceNode'
import type { Graph } from '@/lib/api'
import type { ChatAction } from '@/lib/chat-prompt'
import { toFlowGraph, type FlowNode } from '@/lib/graph-layout'
import { NodeMenuContext } from '@/lib/node-menu-context'
import { useTheme } from '@/lib/theme-context'

const nodeTypes = {
  service: ServiceNode,
  feature: FeatureNode,
}

const edgeTypes = {
  radial: RadialEdge,
}

/**
 * Renders one architecture graph. Mount it with a `key` tied to the data so a fresh
 * analysis rebuilds the layout instead of leaving the previous positions in place.
 */
export function GraphCanvas({
  projectId,
  graph,
  header,
}: {
  projectId: string
  graph: Graph
  header?: React.ReactNode
}) {
  const { theme } = useTheme()
  const initial = useMemo(() => toFlowGraph(graph), [graph])

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes)
  const [edges, , onEdgesChange] = useEdgesState(initial.edges)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** Left click selects and drags; the action menu belongs to right click alone. */
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null)
  /** The node the Tests window was opened for; it outlives the selection. */
  const [testsNodeId, setTestsNodeId] = useState<string | null>(null)
  /** The node and action the chat modal was opened from, or null while it is closed. */
  const [chat, setChat] = useState<{ nodeId: string; action: ChatAction } | null>(null)
  const [createActionOpen, setCreateActionOpen] = useState(false)
  /** The minimap starts hidden; its toggle sits where the minimap's own corner is. */
  const [minimapOpen, setMinimapOpen] = useState(false)
  /** The node the Audit window was opened for. */
  const [auditNodeId, setAuditNodeId] = useState<string | null>(null)

  const selectedNode = selectedId
    ? (graph.nodes.find((node) => node.id === selectedId) ?? null)
    : null

  const closeMenu = useCallback(() => setMenuNodeId(null), [])
  const openTests = useCallback((nodeId: string) => setTestsNodeId(nodeId), [])
  const closeTests = useCallback(() => setTestsNodeId(null), [])
  const openChat = useCallback(
    (nodeId: string, action: ChatAction) => setChat({ nodeId, action }),
    [],
  )
  const openCreateAction = useCallback(() => setCreateActionOpen(true), [])
  const openAudit = useCallback((nodeId: string) => setAuditNodeId(nodeId), [])
  const closeAudit = useCallback(() => setAuditNodeId(null), [])
  // Memoised so opening a menu does not re-render every node through the context.
  const menu = useMemo(
    () => ({
      openNodeId: menuNodeId,
      close: closeMenu,
      openTests,
      openChat,
      openCreateAction,
      openAudit,
    }),
    [menuNodeId, closeMenu, openTests, openChat, openCreateAction, openAudit],
  )

  const testsNode = testsNodeId
    ? (graph.nodes.find((node) => node.id === testsNodeId) ?? null)
    : null

  const auditNode = auditNodeId
    ? (graph.nodes.find((node) => node.id === auditNodeId) ?? null)
    : null

  const chatNode = chat ? (graph.nodes.find((node) => node.id === chat.nodeId) ?? null) : null

  useEffect(() => {
    if (!menuNodeId) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuNodeId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuNodeId])

  return (
    <NodeMenuContext value={menu}>
      <ReactFlow<FlowNode>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={theme}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        onNodeClick={(_, node: Node) => {
          setSelectedId(node.id)
          closeMenu()
        }}
        onPaneClick={() => {
          setSelectedId(null)
          closeMenu()
        }}
        // Right click opens the node's actions instead of the browser's own menu.
        onNodeContextMenu={(event, node: Node) => {
          event.preventDefault()
          setMenuNodeId(node.id)
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault()
          closeMenu()
        }}
        // Dismiss on real movement. onMoveStart fires on mousedown, which would also close
        // the menu the instant you pressed one of its buttons; onMove only fires once the
        // viewport actually changes.
        onNodeDragStart={closeMenu}
        onMove={closeMenu}
      >
        {header && <Panel position="top-left">{header}</Panel>}

        <GraphSearch
          graph={graph}
          onSelect={(nodeId) => {
            setSelectedId(nodeId)
            closeMenu()
            // The ring around a node is driven by React Flow's own `selected` flag, not by
            // selectedId, so a search hit has to set it the way a click would. Nodes whose
            // flag already matches are returned untouched, to keep them from re-rendering.
            setNodes((current) =>
              current.map((node) =>
                node.selected === (node.id === nodeId)
                  ? node
                  : { ...node, selected: node.id === nodeId },
              ),
            )
          }}
        />

        {(selectedNode || testsNode || auditNode) && (
          <Panel position="top-right">
            {/* One right-hand column, so the Tests window docks under the info card. The
                marker lets the Tests card tell outside clicks from ones on this sidebar.
                It is capped and scrolls: both cards open would otherwise run past the
                bottom of the window, putting the lower one out of reach. */}
            <div
              data-graph-sidebar
              className="flex max-h-[calc(100dvh-4rem)] w-72 flex-col gap-3 overflow-y-auto"
            >
              {selectedNode && (
                <NodeInspector
                  node={selectedNode}
                  graph={graph}
                  onClose={() => setSelectedId(null)}
                />
              )}
              {testsNode && (
                // Keyed by node: choosing Test on another node restarts the panel for it
                // rather than leaving the previous node's figures on screen.
                <TestsPanel
                  key={testsNode.id}
                  projectId={projectId}
                  node={testsNode}
                  onClose={closeTests}
                />
              )}
              {auditNode && (
                <AuditPanel
                  key={auditNode.id}
                  projectId={projectId}
                  node={auditNode}
                  onClose={closeAudit}
                />
              )}
            </div>
          </Panel>
        )}

        {minimapOpen && (
          <MiniMap
            pannable
            zoomable
            // Larger than any node's half-width, so SVG clamps it and the rects draw as circles.
            nodeBorderRadius={100}
            nodeStrokeWidth={6}
            // Same fill and ring as the canvas: a service is card-coloured inside a primary
            // ring, a feature is muted with a quieter outline.
            nodeColor={(node) => (node.type === 'service' ? 'var(--card)' : 'var(--muted)')}
            nodeStrokeColor={(node) =>
              node.type === 'service' ? 'var(--primary)' : 'var(--muted-foreground)'
            }
            className="rounded-lg border"
            // MiniMap spreads this onto its own panel, and an inline margin beats the
            // stylesheet's `margin: 15px`. Lifts it clear of the toggle below: 15px of
            // panel margin, the 32px button, and a gap.
            style={{ marginBottom: 56 }}
          />
        )}

        {/* Stays at the minimap's own corner whether it is open or not, so the control
            does not move out from under the pointer that just used it. */}
        <Panel position="bottom-right">
          <Button
            variant="secondary"
            size="icon"
            aria-pressed={minimapOpen}
            aria-label={minimapOpen ? 'Hide the minimap' : 'Show the minimap'}
            title={minimapOpen ? 'Hide the minimap' : 'Show the minimap'}
            onClick={() => setMinimapOpen((open) => !open)}
          >
            {minimapOpen ? <X /> : <MapIcon />}
          </Button>
        </Panel>

        <Controls showInteractive={false} />
        <Background gap={26} size={1.5} />
      </ReactFlow>

      {chat && chatNode && (
        // Keyed by node and action, so opening the chat elsewhere starts a fresh
        // transcript instead of continuing the previous node's one.
        <ChatDialog
          key={`${chat.nodeId}-${chat.action}`}
          node={chatNode}
          action={chat.action}
          onClose={() => setChat(null)}
        />
      )}

      {/* Outside ReactFlow: the menu that opens it unmounts as soon as it is dismissed. */}
      <CreateActionDialog open={createActionOpen} onOpenChange={setCreateActionOpen} />
    </NodeMenuContext>
  )
}
