import { useState } from 'react'
import { CheckCircle2, TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { executeCustomAction, type CustomAction, type CustomActionExecution } from '@/lib/api'

type ExecutionState =
  | { status: 'form' }
  | { status: 'executing' }
  | { status: 'done'; result: CustomActionExecution }
  | { status: 'error'; message: string }

export function ExecuteActionDialog({ projectId, nodeId, action, onClose }: {
  projectId: string
  nodeId: string
  action: CustomAction
  onClose: () => void
}) {
  const [instructions, setInstructions] = useState('')
  const [state, setState] = useState<ExecutionState>({ status: 'form' })

  async function run() {
    if (state.status === 'executing') return
    setState({ status: 'executing' })
    try {
      const result = await executeCustomAction(projectId, nodeId, action.id, instructions.trim() || undefined)
      setState({ status: 'done', result })
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : 'Could not complete this action.' })
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && state.status !== 'executing') onClose() }}>
      <DialogContent className="sm:max-w-lg" showCloseButton={state.status !== 'executing'}>
        <DialogHeader>
          <DialogTitle>{state.status === 'form' ? `Execute “${action.name}”` : action.name}</DialogTitle>
          <DialogDescription>
            {state.status === 'form' && 'Run this action with the service context.'}
            {state.status === 'executing' && 'Analyzing service context'}
            {state.status === 'done' && 'The action completed successfully.'}
            {state.status === 'error' && 'The action could not be completed.'}
          </DialogDescription>
        </DialogHeader>

        {state.status === 'form' && (
          <Field>
            <FieldLabel htmlFor={`action-instructions-${action.id}`}>Additional Instructions</FieldLabel>
            <Textarea id={`action-instructions-${action.id}`} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Focus on the public API and keep the answer concise." className="min-h-24 resize-y" />
            <FieldDescription>Optional</FieldDescription>
          </Field>
        )}

        {state.status === 'executing' && (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Spinner className="size-6" />
            <p>Executing…</p>
          </div>
        )}

        {state.status === 'done' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="size-4 text-emerald-500" />Status: Done</div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Output</p>
              <ScrollArea className="h-64 rounded-lg border bg-muted/30" viewportClassName="p-3">
                <div className="whitespace-pre-wrap text-sm leading-relaxed">{state.result.output}</div>
              </ScrollArea>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="flex items-center gap-2 font-medium text-destructive"><TriangleAlert className="size-4" />Execution failed</p>
            <p className="mt-1 text-muted-foreground">{state.message}</p>
          </div>
        )}

        {state.status !== 'executing' && (
          <DialogFooter>
            {state.status === 'form' && <><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={run}>Run</Button></>}
            {state.status === 'error' && <><Button variant="outline" onClick={onClose}>Close</Button><Button onClick={run}>Retry</Button></>}
            {state.status === 'done' && <Button onClick={onClose}>Close</Button>}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
