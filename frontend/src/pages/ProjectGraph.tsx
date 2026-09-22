import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, RefreshCw, ScanSearch, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { CommitsCard } from '@/components/graph/CommitsCard'
import { useProjectCommits } from '@/lib/use-project-commits'
import { GraphCanvas } from '@/components/graph/GraphCanvas'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  ApiError,
  getProject,
  getProjectNodes,
  type Graph,
  type Project,
} from '@/lib/api'

type State =
  | { status: 'loading' }
  /** The project exists but has never been analyzed, so there is no ProjectMap.json yet. */
  | { status: 'unanalyzed'; project: Project }
  | { status: 'error'; message: string }
  | { status: 'ready'; project: Project; graph: Graph }

export default function ProjectGraph() {
  const { id = '' } = useParams()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [tasksOpen, setTasksOpen] = useState(false)
  const commits = useProjectCommits(id)

  useEffect(() => {
    let cancelled = false

    async function fetchGraph() {
      const project = await getProject(id)
      try {
        const graph = await getProjectNodes(id)
        return { status: 'ready', project, graph } as const
      } catch (error) {
        // 404 here means "no map yet", which is a first-run state rather than a failure.
        if (error instanceof ApiError && error.status === 404) {
          return { status: 'unanalyzed', project } as const
        }
        throw error
      }
    }

    fetchGraph().then(
      (next) => {
        if (!cancelled) setState(next)
      },
      (error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message:
            error instanceof ApiError ? error.message : 'Could not load this project.',
        })
      },
    )

    return () => {
      cancelled = true
    }
  }, [id, attempt])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }, [])

  /** Running an analysis is the loader page's job, so every entry point leads there. */
  const analyzingHref = `/projects/${id}/analyzing`

  if (state.status === 'loading') {
    return (
      <Centered>
        <Spinner className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading the project map…</p>
      </Centered>
    )
  }

  if (state.status === 'error') {
    return (
      <Centered>
        <Alert variant="destructive" className="max-w-md text-left">
          <TriangleAlert />
          <AlertTitle>Could not open this project</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" onClick={reload}>
                <RefreshCw />
                Try again
              </Button>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}>
                Back to projects
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </Centered>
    )
  }

  if (state.status === 'unanalyzed') {
    return (
      <Centered>
        <Empty className="max-w-md rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScanSearch />
            </EmptyMedia>
            <EmptyTitle>{state.project.name} has not been mapped yet</EmptyTitle>
            <EmptyDescription>
              Analyzing reads the repository and asks the model for its architecture, then
              writes <code className="font-mono text-xs">ProjectMap.json</code> into the
              working tree. It can take a while.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex gap-2">
              <Button nativeButton={false} render={<Link to={analyzingHref} />}>
                <ScanSearch />
                Analyze now
              </Button>
              <Button variant="ghost" nativeButton={false} render={<Link to="/" />}>
                Back
              </Button>
            </div>
          </EmptyContent>
        </Empty>
      </Centered>
    )
  }

  const { project, graph } = state
  const services = graph.nodes.filter((node) => node.type === 'service').length
  const features = graph.nodes.length - services

  return (
    <div className="graph-canvas h-dvh w-full">
      {graph.nodes.length === 0 ? (
        <Centered>
          <Empty className="max-w-md rounded-lg border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScanSearch />
              </EmptyMedia>
              <EmptyTitle>The map for {project.name} is empty</EmptyTitle>
              <EmptyDescription>
                The last analysis produced no services. Re-running it may help if the
                repository has changed.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link to={analyzingHref} />}>
                <RefreshCw />
                Re-analyze
              </Button>
            </EmptyContent>
          </Empty>
        </Centered>
      ) : (
        <GraphCanvas
          // Rebuild the layout when a new analysis replaces the data.
          key={`${project.id}-${graph.nodes.length}-${graph.relations.length}`}
          projectId={project.id}
          graph={graph}
          header={
            <div className="flex max-h-[calc(100dvh-4rem)] w-72 flex-col gap-3 overflow-y-auto">
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" nativeButton={false} render={<Link to="/" />}>
                  <ArrowLeft />
                  Projects
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Re-analyze this project"
                  title="Re-analyze this project"
                  nativeButton={false}
                  render={<Link to={analyzingHref} />}
                >
                  <RefreshCw />
                </Button>
                {/* Floats on the canvas: outline is see-through (and in dark mode
                    bg-input/30 over a 17% token is barely there), so it gets a surface. */}
                <ThemeToggle className="ml-auto bg-background dark:bg-background" />
              </div>
              <div>
                <p className="text-sm font-semibold">{project.name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {project.path}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{services} services</Badge>
                <Badge variant="outline" className="bg-background">
                  {features} features
                </Badge>
                {/* Same chip shape as the counts, but this one opens the list below it. */}
                <Badge
                  render={
                    <button
                      type="button"
                      aria-expanded={tasksOpen}
                      onClick={() => setTasksOpen((open) => !open)}
                    />
                  }
                  variant={tasksOpen ? 'secondary' : 'outline'}
                  // Open, the secondary fill already covers the canvas; closed, the
                  // outline variant needs one of its own.
                  className={
                    tasksOpen
                      ? 'cursor-pointer gap-1 hover:bg-muted'
                      : 'cursor-pointer gap-1 bg-background hover:bg-muted'
                  }
                >
                  {commits.status === 'ready' ? `${commits.commits.length} commits` : 'Commits'}
                  <ChevronDown
                    className={tasksOpen ? 'size-3 rotate-180 transition-transform' : 'size-3 transition-transform'}
                  />
                </Badge>
              </div>
              {tasksOpen && <CommitsCard state={commits} />}
            </div>
          }
        />
      )}
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  )
}
