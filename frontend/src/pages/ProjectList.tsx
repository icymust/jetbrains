import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, FolderGit2, Plus, RotateCw, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Skeleton } from '@/components/ui/skeleton'
import { ThemeToggle } from '@/components/theme-toggle'
import { ApiError, listProjects, type Project } from '@/lib/api'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; projects: Project[] }

export default function ProjectList() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    listProjects().then(
      (projects) => {
        if (!cancelled) setState({ status: 'ready', projects })
      },
      (error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message:
            error instanceof ApiError ? error.message : 'Could not load your projects.',
        })
      },
    )

    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => {
    setState({ status: 'loading' })
    setAttempt((value) => value + 1)
  }, [])

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">{describe(state)}</p>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {state.status === 'ready' && state.projects.length > 0 && (
            <Button nativeButton={false} render={<Link to="/projects/new" />}>
              <Plus />
              Add project
            </Button>
          )}
        </div>
      </header>

      {state.status === 'loading' && <ProjectSkeletons />}

      {state.status === 'error' && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Could not load projects</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
              <RotateCw />
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {state.status === 'ready' &&
        (state.projects.length === 0 ? (
          <Empty className="rounded-lg border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderGit2 />
              </EmptyMedia>
              <EmptyTitle>No projects yet</EmptyTitle>
              <EmptyDescription>
                Point CodeOrbit at a local Git repository and it will map the services and
                features it finds.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button nativeButton={false} render={<Link to="/projects/new" />}>
                <Plus />
                Add your first project
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ItemGroup className="gap-2">
            {state.projects.map((project) => (
              <Item
                key={project.id}
                variant="outline"
                render={<Link to={`/projects/${project.id}/graph`} />}
              >
                <ItemMedia variant="icon">
                  <FolderGit2 />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{project.name}</ItemTitle>
                  <ItemDescription className="font-mono text-xs">
                    {project.path}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ))}
    </main>
  )
}

function describe(state: State): string {
  if (state.status === 'loading') return 'Loading your projects…'
  if (state.status === 'error') return 'Something went wrong.'
  const count = state.projects.length
  if (count === 0) return 'Nothing mapped yet.'
  return `${count} ${count === 1 ? 'project' : 'projects'}`
}

function ProjectSkeletons() {
  return (
    <ItemGroup className="gap-2">
      {[0, 1, 2].map((index) => (
        <Item key={index} variant="outline">
          <ItemMedia variant="icon">
            <Skeleton className="size-4 rounded-sm" />
          </ItemMedia>
          <ItemContent className="gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  )
}
