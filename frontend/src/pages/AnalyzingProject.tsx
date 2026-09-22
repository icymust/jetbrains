import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { RefreshCw, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { AnalyzingStatus } from '@/components/analyzing-status'
import { ApiError, getProjectNodes, loadProject } from '@/lib/api'

/** How often to re-check for a finished map when another analysis is already running. */
const POLL_MS = 2500
/** Stop waiting on someone else's analysis eventually rather than polling forever. */
const MAX_POLLS = 240

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function formatElapsed(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Resolves once the project has a map — either because this call produced one, or because
 * the analysis already running elsewhere (the commit monitor) finished and wrote it.
 */
async function runAnalysis(id: string): Promise<void> {
  try {
    await loadProject(id)
    return
  } catch (error) {
    // 409 is not a failure: someone else is analyzing this project right now.
    if (!(error instanceof ApiError) || error.status !== 409) throw error
  }

  for (let poll = 0; poll < MAX_POLLS; poll++) {
    await sleep(POLL_MS)
    try {
      await getProjectNodes(id)
      return
    } catch (error) {
      // 404 just means the map is not written yet; anything else is real.
      if (!(error instanceof ApiError) || error.status !== 404) throw error
    }
  }

  throw new ApiError('The analysis is taking longer than expected.', 0)
}

export default function AnalyzingProject({ preview = false }: { preview?: boolean }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [attempt, setAttempt] = useState(0)

  /**
   * The in-flight analysis, keyed by attempt. Strict Mode invokes effects twice, so the
   * request is started here once and each effect pass merely attaches its own handlers —
   * latching the effect itself would cancel the only run that ever started.
   */
  const run = useRef<{ key: string; promise: Promise<void> } | null>(null)

  useEffect(() => {
    // Runs in preview too, so the page looks the way it will in real use.
    if (error) return
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [error, attempt])

  useEffect(() => {
    if (preview) return

    const key = `${id}:${attempt}`
    if (run.current?.key !== key) {
      run.current = { key, promise: runAnalysis(id) }
    }

    let cancelled = false
    run.current.promise.then(
      () => {
        // replace: so Back goes to the project list, not to a loader that would re-run.
        if (!cancelled) navigate(`/projects/${id}/graph`, { replace: true })
      },
      (thrown: unknown) => {
        if (cancelled) return
        setError(
          thrown instanceof ApiError ? thrown.message : 'The analysis could not be run.',
        )
      },
    )

    return () => {
      cancelled = true
    }
  }, [id, attempt, preview, navigate])

  const retry = useCallback(() => {
    setError(null)
    setElapsed(0)
    setAttempt((value) => value + 1)
  }, [])

  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-6 px-6">
      {preview && <PreviewControls error={error} setError={setError} />}

      {error ? (
        <Alert variant="destructive" className="max-w-md text-left">
          <TriangleAlert />
          <AlertTitle>Analysis failed</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={retry}>
                <RefreshCw />
                Retry
              </Button>
              {/* The project already exists by now, so opening it beats losing it. */}
              <Button
                variant="ghost"
                size="sm"
                className="no-underline"
                nativeButton={false}
                render={<Link to={`/projects/${id}/graph`} />}
              >
                Open project anyway
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="no-underline"
                nativeButton={false}
                render={<Link to="/" />}
              >
                Back to projects
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Spinner className="size-8 text-muted-foreground" />

          <h1 className="text-xl font-semibold tracking-tight">Analyzing your project</h1>

          <AnalyzingStatus className="max-w-sm" />

          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatElapsed(elapsed)}
          </p>

          <div className="flex flex-col items-center gap-1">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}>
              Back to projects
            </Button>
            <p className="text-xs text-muted-foreground">
              The analysis keeps running on the server if you leave.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

/** Only rendered on /analyzing-preview, so both states can be seen without a backend. */
function PreviewControls({
  error,
  setError,
}: {
  error: string | null
  setError: (value: string | null) => void
}) {
  return (
    <div className="fixed top-4 right-4 flex items-center gap-2">
      <span className="text-xs text-muted-foreground">preview</span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setError(error ? null : 'Project analysis failed')}
      >
        {error ? 'Show loading' : 'Show error'}
      </Button>
    </div>
  )
}
