import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { CommitsState } from '@/lib/use-project-commits'

/**
 * The repository's recent commits as a chain of finished work.
 *
 * The backend runs `git log` against whatever is checked out, so this is the current
 * branch's history rather than master's specifically — which is why nothing here claims a
 * branch name the response does not carry.
 */
export function CommitsCard({ state }: { state: CommitsState }) {
  if (state.status === 'loading') {
    return (
      <Shell>
        <div className="space-y-2.5 px-4 py-3.5">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-4 w-full" />
          ))}
        </div>
      </Shell>
    )
  }

  if (state.status === 'error') {
    return (
      <Shell>
        <p className="px-4 py-3 text-xs text-muted-foreground">{state.message}</p>
      </Shell>
    )
  }

  if (state.commits.length === 0) {
    return (
      <Shell>
        <p className="px-4 py-3 text-xs text-muted-foreground">No commits yet.</p>
      </Shell>
    )
  }

  return (
    <Shell>
      <ScrollArea viewportClassName="max-h-64">
        <ol className="px-4 py-3">
          {state.commits.map((commit, index) => (
            <li key={commit.hash} className="relative flex items-center gap-2.5 py-1.5">
              {/* The chain, drawn from this dot to the next one. Rows are a uniform
                  height, so a full-height span starting at the centre lands exactly on
                  the centre of the row below. The last commit gets none: the history
                  ends there, and a line past it would point at nothing. */}
              {index < state.commits.length - 1 && (
                <span
                  aria-hidden
                  className="absolute top-1/2 left-1 h-full w-px -translate-x-1/2 bg-border"
                />
              )}
              {/* Positioned, and after the line in the DOM, so it paints over it. */}
              <span aria-hidden className="relative size-2 shrink-0 rounded-full bg-primary" />
              <code className="shrink-0 font-mono text-xs text-muted-foreground">
                {commit.short_hash}
              </code>
              {/* min-w-0 lets the flex item shrink; without it truncate never engages.
                  The author and date have no room on the row, so they go to the tooltip
                  rather than being dropped. */}
              <span
                className="min-w-0 flex-1 truncate text-sm"
                title={`${commit.message}\n${commit.author} · ${new Date(commit.date).toLocaleString()}`}
              >
                {commit.message}
              </span>
            </li>
          ))}
        </ol>
      </ScrollArea>
    </Shell>
  )
}

/** The card around whichever state is showing, so they share one frame. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Card className="w-full">
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  )
}
