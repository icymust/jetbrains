import { useEffect, useMemo, useRef, useState } from 'react'
import { Play, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import type { ProjectNode } from '@/lib/api'
import { mockTestsFor } from '@/lib/mock-tests'

/** How long the pretend "looking for tests" step takes. */
const SCAN_MS = 1500

type Phase = 'scanning' | 'ready' | 'running' | 'done'

/** `0:03.1` — minutes, then seconds to a tenth. */
function formatElapsed(ms: number): string {
  const seconds = ms / 1000
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`
}

/**
 * Tests for one node.
 *
 * Every number shown here is invented — counts, coverage and run duration all come from
 * mock-tests.ts, and nothing is measured. Nothing on screen says so, so keep that in mind
 * before wiring this to anything that treats the coverage figure as real.
 */
export function TestsPanel({ node, onClose }: { node: ProjectNode; onClose: () => void }) {
  const tests = useMemo(() => mockTestsFor(node), [node])
  const [phase, setPhase] = useState<Phase>('scanning')
  const [elapsed, setElapsed] = useState(0)

  // The card grows as it moves from spinner to results to coverage. Height cannot be
  // transitioned from `auto`, so the content is measured and the wrapper animates to it.
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState<number>()

  useEffect(() => {
    // pointerdown rather than click: the click that opened this panel is still propagating
    // when the effect runs, so a click listener would see it and close immediately.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-graph-sidebar]')) return
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
    const timer = setTimeout(() => setPhase('ready'), SCAN_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (phase !== 'running') return

    // Elapsed is measured against a fixed start, not accumulated per tick — interval drift
    // would otherwise show up directly in the number on screen.
    const startedAt = Date.now()
    const tick = setInterval(() => setElapsed(Date.now() - startedAt), 80)
    const finish = setTimeout(() => {
      setElapsed(Date.now() - startedAt)
      setPhase('done')
    }, tests.runDurationMs)

    return () => {
      clearInterval(tick)
      clearTimeout(finish)
    }
  }, [phase, tests.runDurationMs])

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
            {phase === 'scanning' ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <Spinner />
                Looking for tests…
              </div>
            ) : (
              // gap rather than space-y: sibling margins would fall outside the measured box.
              <div className="flex flex-col gap-3">
                <ul className="space-y-1">
                  {tests.suites.map((suite) => (
                    <li key={suite.type} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{suite.type}</span>
                      <span className="font-medium tabular-nums">{suite.count}</span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between border-t pt-1 text-sm">
                    <span className="font-medium">Total</span>
                    <span className="font-medium tabular-nums">{tests.total}</span>
                  </li>
                </ul>

                {phase === 'done' && (
                  <Progress value={tests.coverage}>
                    <ProgressLabel className="text-xs">Coverage</ProgressLabel>
                    <ProgressValue className="text-xs" />
                  </Progress>
                )}

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
