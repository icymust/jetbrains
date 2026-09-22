import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { actionIcons, addCustomAction, type ActionIconName } from '@/lib/custom-actions'

export function CreateActionDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Action</DialogTitle>
          <DialogDescription>
            Adds an item to every node&rsquo;s menu. Stored in this browser only.
          </DialogDescription>
        </DialogHeader>

        {/* The portal unmounts on close, so the form starts empty each time it opens. */}
        <CreateActionForm onCreated={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function CreateActionForm({ onCreated }: { onCreated: () => void }) {
  const [icon, setIcon] = useState<ActionIconName>('zap')
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [script, setScript] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const trimmed = name.trim()
    if (!trimmed) {
      setError('Give the action a name.')
      return
    }

    addCustomAction({
      name: trimmed,
      icon,
      prompt: prompt.trim() || undefined,
      script: script.trim() || undefined,
    })
    toast.success(`Added “${trimmed}”`, { description: 'It is now in every node menu.' })
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor="action-name">Name</FieldLabel>
        <div className="flex gap-2">
          <IconPicker value={icon} onChange={setIcon} />
          <Input
            id="action-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            placeholder="Generate docs"
            autoComplete="off"
            aria-invalid={Boolean(error)}
          />
        </div>
        <FieldError>{error}</FieldError>
      </Field>

      <Field>
        <FieldLabel htmlFor="action-prompt">Prompt</FieldLabel>
        <Textarea
          id="action-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe what the model should do with this node…"
          className="min-h-20 resize-y"
        />
        <FieldDescription>Optional.</FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="action-script">Script</FieldLabel>
        <Textarea
          id="action-script"
          value={script}
          onChange={(event) => setScript(event.target.value)}
          placeholder="npm test -- --filter=…"
          className="min-h-20 resize-y font-mono text-xs"
        />
        <FieldDescription>Optional. Stored only — nothing runs it.</FieldDescription>
      </Field>

      <Button type="submit" size="lg" className="w-full">
        Create
      </Button>
    </form>
  )
}

function IconPicker({
  value,
  onChange,
}: {
  value: ActionIconName
  onChange: (icon: ActionIconName) => void
}) {
  const [open, setOpen] = useState(false)
  const Current = actionIcons[value]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button type="button" variant="outline" size="icon" aria-label="Choose icon" />}
      >
        <Current />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-8 gap-1">
          {Object.entries(actionIcons).map(([iconName, Icon]) => (
            <Button
              key={iconName}
              type="button"
              variant={iconName === value ? 'secondary' : 'ghost'}
              size="icon"
              aria-label={iconName}
              onClick={() => {
                onChange(iconName as ActionIconName)
                setOpen(false)
              }}
            >
              <Icon />
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
