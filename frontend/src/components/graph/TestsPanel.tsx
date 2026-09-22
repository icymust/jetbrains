import { useEffect, useRef, useState } from 'react'
import { Play, TriangleAlert, X } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { getNodeTests, type NodeTests, type ProjectNode } from '@/lib/api'

type Phase = 'ready' | 'running' | 'done'

/** `0:03.1` — minutes, then seconds to a tenth. */
function formatElapsed(ms: number): string {
  const seconds = ms / 1000
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

/**
 * Tests for one node, from GET /nodes/:id/tests.
 *
 * The counts come from the backend, but it derives them from a hash of the node id rather
 * than from a test runner — so they are consistent and plausible, not measured. The run
 * itself is a timer of the length the endpoint reports; nothing is executed.
 */
export function TestsPanel({
  projectId,
  node,
  onClose,
}: {
  projectId: string
  node: ProjectNode
  onClose: () => void
}) {
  const [tests, setTests] = useState<NodeTests | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [elapsed, setElapsed] = useState(0)

  // The card grows as it moves from spinner to results. Height cannot be transitioned from
  // `auto`, so the content is measured and the wrapper animates to it.
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number>()

  useEffect(() => {
    // pointerdown rather than click: the click that opened this panel is still propagating
    // when the effect runs, so a click listener would see it and close immediately.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-graph-sidebar], [data-slot="dialog-content"]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  useEffect(() => {
    const element = contentRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setContentHeight(entry.contentRect.height)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    getNodeTests(projectId, node.id).then(
      (result) => {
        if (!cancelled) setTests(result)
      },
      (thrown: unknown) => {
        if (cancelled) return
        setError(thrown instanceof Error ? thrown : new Error('Could not look for tests.'))
      },
    )
    return () => {
      cancelled = true
    }
  }, [projectId, node.id])

  useEffect(() => {
    if (phase !== 'running' || !tests) return

    // Elapsed is measured against a fixed start, not accumulated per tick — interval drift
    // would otherwise show up directly in the number on screen.
    const startedAt = Date.now()
    const tick = setInterval(() => setElapsed(Date.now() - startedAt), 80)
    const finish = setTimeout(() => {
      setElapsed(Date.now() - startedAt)
      setPhase('done')
    }, tests.duration * 1000)

    return () => {
      clearInterval(tick)
      clearTimeout(finish)
    }
  }, [phase, tests])

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="pr-8 text-base leading-tight">Tests</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close tests"
          className="absolute top-3 right-3"
          onClick={onClose}
        >
          <X />
        </Button>
      </CardHeader>

      <Separator />

      <CardContent>
        <div
          style={{ height: contentHeight }}
          className="overflow-hidden transition-[height] duration-300 ease-out motion-reduce:transition-none"
        >
          <div ref={contentRef}>
            {error ? (
              <Alert variant="destructive" className="border-0 p-0 py-1">
                <TriangleAlert />
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ) : !tests ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Spinner />
                Looking for tests…
              </div>
            ) : (
              // gap rather than space-y: sibling margins would fall outside the measured box.
              <div className="flex flex-col gap-3">
                <ul className="space-y-1">
                  <li className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium tabular-nums">{tests.total}</span>
                  </li>
                  {phase === 'done' && (
                    <>
                      <li className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Passed</span>
                        <span className="font-medium tabular-nums">{tests.passed}</span>
                      </li>
                      <li className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Failed</span>
                        <span
                          className={
                            tests.failed > 0
                              ? 'font-medium tabular-nums text-destructive'
                              : 'font-medium tabular-nums'
                          }
                        >
                          {tests.failed}
                        </span>
                      </li>
                    </>
                  )}
                </ul>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={phase === 'running'}
                    onClick={() => {
                      setElapsed(0)
                      setPhase('running')
                    }}
                  >
                    {phase === 'running' ? <Spinner /> : <Play />}
                    {phase === 'running' ? 'Running…' : phase === 'done' ? 'Re-run' : 'Run'}
                  </Button>
                  <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
                    {formatElapsed(elapsed)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
