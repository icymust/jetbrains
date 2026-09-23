import { useState } from 'react'

import { AlertDialog, AlertDialogClose, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { deleteCustomAction, type CustomAction } from '@/lib/api'

export function DeleteActionDialog({ projectId, nodeId, action, onClose, onDeleted }: {
  projectId: string
  nodeId: string
  action: CustomAction
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    if (deleting) return
    setDeleting(true)
    setError(null)
    try {
      await deleteCustomAction(projectId, nodeId, action.id)
      onDeleted()
      onClose()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not delete this action.')
      setDeleting(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open && !deleting) onClose() }}>
      <AlertDialogContent>
        <AlertDialogTitle>Delete “{action.name}”?</AlertDialogTitle>
        <AlertDialogDescription>This action will be permanently removed.</AlertDialogDescription>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" disabled={deleting} />}>Cancel</AlertDialogClose>
          <Button variant="destructive" onClick={remove} disabled={deleting}>{deleting && <Spinner />}{deleting ? 'Deleting…' : 'Delete'}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
