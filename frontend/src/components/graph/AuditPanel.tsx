import { useEffect, useRef, useState } from 'react'
import { RefreshCw, TriangleAlert, X } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { ApiError, auditNode, type NodeAudit, type ProjectNode } from '@/lib/api'

/**
 * Audit results for one node, from POST /nodes/:id/audit.
 *
 * Unlike the other panels this shows real output: the backend reads the node's evidence
 * files and asks a model to score them. That makes each run slow and billed, which is why
 * it runs once per open and re-runs only on request.
 */
export function AuditPanel({
  projectId,
  node,
  onClose,
}: {
  projectId: string
  node: ProjectNode
  onClose: () => void
}) {
  const [audit, setAudit] = useState<NodeAudit | null>(null)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [attempt, setAttempt] = useState(0)

  /**
   * The in-flight request, so Strict Mode's double-invoked effect cannot bill a second
   * audit. Each effect pass attaches handlers to the one promise; latching the effect
   * itself would cancel the only run that started.
   */
  const run = useRef<{ key: string; promise: Promise<NodeAudit> } | null>(null)

  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number>()

  useEffect(() => {
    const element = contentRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setContentHeight(entry.contentRect.height))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-graph-sidebar], [data-slot="dialog-content"]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  useEffect(() => {
    const key = `${projectId}:${node.id}:${attempt}`
    if (run.current?.key !== key) {
      run.current = { key, promise: auditNode(projectId, node.id) }
    }

    let cancelled = false
    run.current.promise.then(
      (result) => {
        if (cancelled) return
        setAudit(result)
        setError(null)
      },
      (thrown: unknown) => {
        if (cancelled) return
        setError(thrown instanceof Error ? thrown : new Error('The audit could not be run.'))
      },
    )

    return () => {
      cancelled = true
    }
  }, [projectId, node.id, attempt])

  // A node with nothing readable behind it will answer the same way every time, so there
  // is no point offering a retry for it.
  const retryable = !(error instanceof ApiError && error.status === 409)
  const running = !audit && !error

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="pr-8 text-base leading-tight">Audit</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close audit"
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
            {running && (
              <div className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Spinner />
                  Auditing {node.name}…
                </div>
                <p className="text-xs text-muted-foreground">
                  Reads the node&rsquo;s files and asks a model to score them. This takes a
                  few seconds.
                </p>
              </div>
            )}

            {error && (
              <div className="flex flex-col gap-3 py-1">
                <Alert variant="destructive" className="border-0 p-0">
                  <TriangleAlert />
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
                {retryable && (
                  <Button size="sm" onClick={() => setAttempt((value) => value + 1)}>
                    <RefreshCw />
                    Retry
                  </Button>
                )}
              </div>
            )}

            {audit && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-semibold tabular-nums">
                      {audit.overall_score}
                    </span>
                    <span className="text-xs text-muted-foreground">overall</span>
                  </div>
                  <Progress value={audit.overall_score} />
                </div>

                <div className="flex flex-col gap-2">
                  <Progress value={audit.optimization_score}>
                    <ProgressLabel className="text-xs">Optimization</ProgressLabel>
                    <ProgressValue className="text-xs" />
                  </Progress>
                  <Progress value={audit.maintainability_score}>
                    <ProgressLabel className="text-xs">Maintainability</ProgressLabel>
                    <ProgressValue className="text-xs" />
                  </Progress>
                </div>

                <ul className="flex flex-col gap-3">
                  {audit.improvements.map((improvement) => (
                    <li key={improvement.title} className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium">{improvement.title}</p>
                      <p className="text-xs leading-snug text-muted-foreground">
                        {improvement.description}
                      </p>
                    </li>
                  ))}
                </ul>

                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => {
                    setAudit(null)
                    setAttempt((value) => value + 1)
                  }}
                >
                  <RefreshCw />
                  Re-run
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
