import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { mockCommits } from '@/lib/mock-commits'

/**
 * The branch's history as a list of finished work — see mock-commits.ts, none of it real.
 *
 * Each row is one commit, and the dots are joined into a chain so the list reads as a
 * branch rather than as bullet points.
 */
export function CommitsCard() {
  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="text-base leading-tight">Completed Tasks</CardTitle>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="font-mono text-[10px]">
            master
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            mock
          </Badge>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="p-0">
        <ScrollArea className="max-h-64">
          <ol className="px-4 py-3">
            {mockCommits.map((commit, index) => (
              <li key={commit.hash} className="relative flex items-center gap-2.5 py-1.5">
                {/* The chain, drawn from this dot to the next one. Rows are a uniform
                    height, so a full-height span starting at the centre lands exactly on
                    the centre of the row below. The last commit gets none: the branch
                    ends there, and a line past it would point at nothing. */}
                {index < mockCommits.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 left-1 h-full w-px -translate-x-1/2 bg-border"
                  />
                )}
                {/* Positioned, and after the line in the DOM, so it paints over it. */}
                <span
                  aria-hidden
                  className="relative size-2 shrink-0 rounded-full bg-primary"
                />
                <code className="shrink-0 font-mono text-xs text-muted-foreground">
                  {commit.hash}
                </code>
                {/* min-w-0 lets the flex item shrink; without it truncate never engages. */}
                <span className="min-w-0 flex-1 truncate text-sm" title={commit.message}>
                  {commit.message}
                </span>
              </li>
            ))}
          </ol>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
