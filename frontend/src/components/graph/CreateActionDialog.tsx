import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { createCustomAction, type CustomAction } from '@/lib/api'
import { customActionIcons, type CustomActionIconName } from '@/lib/custom-action-icons'

export function CreateActionDialog({ projectId, nodeId, nodeName, open, onOpenChange, onCreated }: {
  projectId: string
  nodeId: string
  nodeName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (action: CustomAction) => void
}) {
  const [icon, setIcon] = useState<CustomActionIconName>('file-text')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function reset() {
    setIcon('file-text')
    setName('')
    setPrompt('')
    setError(null)
    setSubmitting(false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedPrompt = prompt.trim()
    if (!trimmedName || !trimmedPrompt) {
      setError('Name and prompt are required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const action = await createCustomAction(projectId, nodeId, { name: trimmedName, icon, prompt: trimmedPrompt })
      onCreated(action)
      reset()
      onOpenChange(false)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not add this action.')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (submitting) return
      if (!nextOpen) reset()
      onOpenChange(nextOpen)
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Action</DialogTitle>
          <DialogDescription>Create a persistent action for {nodeName}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor={`action-name-${nodeId}`}>Name</FieldLabel>
            <Input id={`action-name-${nodeId}`} value={name} onChange={(event) => setName(event.target.value)} placeholder="Generate Docs" autoComplete="off" required disabled={submitting} />
          </Field>
          <Field>
            <FieldLabel>Icon</FieldLabel>
            <IconPicker value={icon} onChange={setIcon} disabled={submitting} />
          </Field>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`action-prompt-${nodeId}`}>Prompt</FieldLabel>
            <Textarea id={`action-prompt-${nodeId}`} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Generate concise documentation for this service…" className="min-h-24 resize-y" required disabled={submitting} />
            <FieldError>{error}</FieldError>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting && <Spinner />}{submitting ? 'Adding…' : 'Add'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function IconPicker({ value, onChange, disabled }: { value: CustomActionIconName; onChange: (icon: CustomActionIconName) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const Current = customActionIcons[value]
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" className="w-full justify-start" disabled={disabled} />}>
        <Current />{value}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-5 gap-1">
          {Object.entries(customActionIcons).filter(([iconName]) => iconName !== 'document').map(([iconName, Icon]) => (
            <Button key={iconName} type="button" variant={iconName === value ? 'secondary' : 'ghost'} size="icon" aria-label={`Use ${iconName} icon`} title={iconName} onClick={() => { onChange(iconName as CustomActionIconName); setOpen(false) }}><Icon /></Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
