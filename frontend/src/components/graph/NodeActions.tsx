import { Handle, NodeToolbar, Position } from '@xyflow/react'
import { ArrowUpRight, FlaskConical, Lightbulb, Search } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useNodeMenu } from '@/lib/node-menu-context'

const actions = [
  { label: 'To chat', icon: ArrowUpRight },
  { label: 'Test', icon: FlaskConical },
  { label: 'Explain', icon: Lightbulb },
  { label: 'Audit', icon: Search },
] as const

/**
 * The per-node action menu, opened by right-clicking a node. Test and the two chat
 * actions open their own windows; Audit has no backend, so it reports what it would do
 * instead of doing it.
 */
export function NodeActions({
  visible,
  nodeId,
  name,
}: {
  visible: boolean
  nodeId: string
  name: string
}) {
  const { close, openTests, openChat } = useNodeMenu()

  return (
    <NodeToolbar
      isVisible={visible}
      position={Position.Right}
      offset={12}
      // The toolbar is portaled onto the pane, so without these a mousedown on it starts a
      // pan/drag gesture — which closed this menu before the click could ever land.
      className="nopan nodrag"
    >
      <div className="flex flex-col gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
        {actions.map(({ label, icon: Icon }) => (
          <Button
            key={label}
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={(event) => {
              event.stopPropagation()
              close()
              if (label === 'Test') {
                openTests(nodeId)
                return
              }
              if (label === 'To chat' || label === 'Explain') {
                openChat(nodeId, label)
                return
              }
              toast(`${label} — ${name}`, { description: 'Not wired to the backend yet.' })
            }}
          >
            <Icon />
            {label}
          </Button>
        ))}
      </div>
    </NodeToolbar>
  )
}

/**
 * Source and target handles stacked in the node's centre. They stay invisible: edges are
 * generated from the graph, never drawn by hand, so the connection dots would be noise.
 */
export function CentreHandles() {
  const style = {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    opacity: 0,
    pointerEvents: 'none',
  } as const

  return (
    <>
      <Handle type="target" position={Position.Top} style={style} isConnectable={false} />
      <Handle type="source" position={Position.Bottom} style={style} isConnectable={false} />
    </>
  )
}
