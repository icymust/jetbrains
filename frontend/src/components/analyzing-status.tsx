import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Roughly the order the backend works in, so the loop reads sensibly. These are
 * atmosphere, not progress: `POST /:id/load` reports nothing until it finishes.
 */
const messages = [
  'Thinking',
  'Reading the repository',
  'Scanning source files',
  'Spotting services',
  'Grouping features',
  'Tracing connections',
  'Drawing the map',
]

const INTERVAL_MS = 2500

/** Cycles the status messages, sliding each one up and out as the next rises in. */
export function AnalyzingStatus({ className }: { className?: string }) {
  // One piece of state, so advancing stays a pure update: the message we are leaving and
  // the one arriving always move together.
  const [{ current, previous }, setStep] = useState<{
    current: number
    previous: number | null
  }>({ current: 0, previous: null })

  useEffect(() => {
    const timer = setInterval(() => {
      setStep(({ current: index }) => ({
        current: (index + 1) % messages.length,
        previous: index,
      }))
    }, INTERVAL_MS)

    return () => clearInterval(timer)
  }, [])

  return (
    <div className={cn('relative h-8 w-full', className)}>
      {/* Both messages are absolutely positioned so the layout never shifts mid-swap. */}
      {previous !== null && (
        <Message
          key={`out-${previous}`}
          text={messages[previous]}
          className="message-out"
          // Dropping it once it has left keeps stale nodes from piling up.
          onAnimationEnd={() => setStep((step) => ({ ...step, previous: null }))}
          aria-hidden
        />
      )}
      <Message key={`in-${current}`} text={messages[current]} className="message-in" />

      {/* The text is what matters; the dots are decoration, announced as nothing. */}
      <span className="sr-only" aria-live="polite">
        {messages[current]}
      </span>
    </div>
  )
}

function Message({
  text,
  className,
  ...props
}: { text: string } & React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'absolute inset-x-0 top-0 flex items-center justify-center gap-0.5',
        'text-base font-medium text-foreground',
        className,
      )}
      {...props}
    >
      {text}
      <span aria-hidden className="inline-flex">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="dot-pulse"
            style={{ animationDelay: `${dot * 160}ms` }}
          >
            .
          </span>
        ))}
      </span>
    </p>
  )
}
