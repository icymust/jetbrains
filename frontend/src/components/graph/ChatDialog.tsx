import { useEffect, useRef, useState } from 'react'
import { ArrowUp } from 'lucide-react'

import { AirMark } from '@/components/AirMark'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import type { ProjectNode } from '@/lib/api'
import { promptFor, type ChatAction } from '@/lib/chat-prompt'

interface Message {
  id: number
  text: string
}

/**
 * A mock chat, opened from a node's To chat or Explain action and seeded with that
 * action's question.
 *
 * Sending appends the text and nothing else. There is no model behind this and no
 * endpoint to call, so the modal stops at the user's own words rather than answering in a
 * voice that would be taken for one — the footer says as much.
 */
export function ChatDialog({
  node,
  action,
  onClose,
}: {
  node: ProjectNode
  action: ChatAction
  onClose: () => void
}) {
  const [messages, setMessages] = useState<Message[]>(() => [
    { id: 0, text: promptFor(node, action) },
  ])
  const [draft, setDraft] = useState('')
  const nextId = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setMessages((current) => [...current, { id: nextId.current++, text }])
    setDraft('')
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {/* The shared popup is a padded grid; this one is a column whose composer sits
          flush against the bottom edge, so the display and spacing are overridden here
          rather than in the component everything else uses. */}
      <DialogContent className="flex h-[min(80dvh,40rem)] flex-col gap-0 p-0 sm:max-w-lg">
        <div className="flex items-center gap-2 px-4 py-3 pr-12">
          <DialogTitle className="truncate">Chat · {node.name}</DialogTitle>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            mock
          </Badge>
        </div>

        <Separator />

        {/* min-h-0 is what lets this shrink inside the flex column and scroll on its own,
            instead of growing the dialog past its height. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <AirMark className="size-10" />
            <div>
              <p className="font-heading text-base font-medium">JetBrains Air Chat</p>
              <p className="text-sm text-muted-foreground">Ask about this part of the map.</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {messages.map((message) => (
              <div key={message.id} className="flex justify-end">
                <p className="max-w-[80%] rounded-2xl bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
                  {message.text}
                </p>
              </div>
            ))}
          </div>

          <div ref={endRef} />
        </div>

        <div className="border-t p-3">
          <form
            className="flex items-center gap-2 rounded-full border border-input py-1 pr-1 pl-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
          >
            <Input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask anything…"
              aria-label="Message"
              className="border-0 bg-transparent focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
            />
            <Button
              type="submit"
              size="icon"
              aria-label="Send message"
              className="size-8 shrink-0 rounded-full"
              disabled={draft.trim().length === 0}
            >
              <ArrowUp />
            </Button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
            Mock — messages are not sent anywhere.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
