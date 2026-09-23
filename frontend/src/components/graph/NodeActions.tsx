import { useEffect, useState } from 'react'
import { Handle, NodeToolbar, Position } from '@xyflow/react'
import { ArrowUpRight, Ellipsis, FlaskConical, Lightbulb, Plus, Search, Trash2 } from 'lucide-react'

import { CreateActionDialog } from '@/components/graph/CreateActionDialog'
import { DeleteActionDialog } from '@/components/graph/DeleteActionDialog'
import { ExecuteActionDialog } from '@/components/graph/ExecuteActionDialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import type { CustomAction, ProjectNode } from '@/lib/api'
import { getCustomActionIcon } from '@/lib/custom-action-icons'
import { useCustomActions } from '@/lib/use-custom-actions'
import { useNodeMenu } from '@/lib/node-menu-context'

const actions = [
  { label: 'To chat', icon: ArrowUpRight },
  { label: 'Test', icon: FlaskConical },
  { label: 'Explain', icon: Lightbulb },
  { label: 'Audit', icon: Search },
] as const

export function NodeActions({ visible, projectId, nodeId, name, nodeType }: {
  visible: boolean
  projectId: string
  nodeId: string
  name: string
  nodeType: ProjectNode['type']
}) {
  const { openNodeId, close, openTests, openChat, openAudit } = useNodeMenu()
  const [addOpen, setAddOpen] = useState(false)
  const [executingAction, setExecutingAction] = useState<CustomAction | null>(null)
  const [deletingAction, setDeletingAction] = useState<CustomAction | null>(null)
  const custom = useCustomActions(projectId, nodeId, nodeType === 'service' && visible)

  useEffect(() => {
    if (openNodeId && openNodeId !== nodeId) {
      setAddOpen(false)
      setExecutingAction(null)
      setDeletingAction(null)
    }
  }, [nodeId, openNodeId])

  return (
    <>
      <NodeToolbar isVisible={visible} position={Position.Right} offset={12} className="nopan nodrag">
        <div className="flex min-w-40 flex-col gap-0.5 rounded-lg border bg-popover p-1 shadow-md">
          {actions.map(({ label, icon: Icon }) => (
            <Button key={label} variant="ghost" size="sm" className="justify-start" onClick={(event) => {
              event.stopPropagation()
              close()
              if (label === 'Test') return openTests(nodeId)
              if (label === 'Audit') return openAudit(nodeId)
              if (label === 'To chat' || label === 'Explain') return openChat(nodeId, label)
            }}>
              <Icon />{label}
            </Button>
          ))}

          {nodeType === 'service' && custom.status === 'loading' && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"><Spinner />Loading actions…</div>
          )}
          {nodeType === 'service' && custom.status === 'error' && (
            <button type="button" className="px-2 py-1.5 text-left text-xs text-destructive" onClick={custom.refresh}>{custom.message} Click to retry.</button>
          )}
          {nodeType === 'service' && custom.actions.map((action) => {
            const Icon = getCustomActionIcon(action.icon)
            return (
              <div key={action.id} className="flex items-center">
                <Button variant="ghost" size="sm" className="min-w-0 flex-1 justify-start" onClick={(event) => {
                  event.stopPropagation()
                  setExecutingAction(action)
                  close()
                }}>
                  <Icon /><span className="truncate">{action.name}</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`More options for ${action.name}`} onClick={(event) => event.stopPropagation()} />}>
                    <Ellipsis />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-destructive data-highlighted:text-destructive" onClick={() => { setDeletingAction(action); close() }}>
                      <Trash2 className="size-4" />Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          })}

          {nodeType === 'service' && (
            <>
              <div className="my-0.5 border-t" />
              <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={(event) => {
                event.stopPropagation()
                setAddOpen(true)
                close()
              }}>
                <Plus />Add
              </Button>
            </>
          )}
        </div>
      </NodeToolbar>

      {nodeType === 'service' && addOpen && (
        <CreateActionDialog projectId={projectId} nodeId={nodeId} nodeName={name} open={addOpen} onOpenChange={setAddOpen} onCreated={custom.refresh} />
      )}
      {executingAction && (
        <ExecuteActionDialog projectId={projectId} nodeId={nodeId} action={executingAction} onClose={() => setExecutingAction(null)} />
      )}
      {deletingAction && (
        <DeleteActionDialog projectId={projectId} nodeId={nodeId} action={deletingAction} onClose={() => setDeletingAction(null)} onDeleted={custom.refresh} />
      )}
    </>
  )
}

export function CentreHandles() {
  const style = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0, pointerEvents: 'none' } as const
  return <><Handle type="target" position={Position.Top} style={style} isConnectable={false} /><Handle type="source" position={Position.Bottom} style={style} isConnectable={false} /></>
}
