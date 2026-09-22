import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, CornerLeftUp, Folder, TriangleAlert } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Spinner } from '@/components/ui/spinner'
import { ApiError, browseDirectories, type DirectoryListing } from '@/lib/api'

interface FolderPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where to start browsing; falls back to the root when it is not usable. */
  initialPath?: string
  onSelect: (path: string) => void
}

/**
 * Browses the machine's folders through the backend. A browser file picker cannot be used
 * here: it reports only a folder's name, never the absolute path the backend needs.
 */
export function FolderPicker({
  open,
  onOpenChange,
  initialPath,
  onSelect,
}: FolderPickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose repository folder</DialogTitle>
          <DialogDescription>
            Pick a folder that is a Git working tree. Folders are read from this machine by
            the backend.
          </DialogDescription>
        </DialogHeader>

        {/* The portal unmounts on close, so this starts fresh at `initialPath` every time. */}
        <PickerBody
          initialPath={initialPath}
          onCancel={() => onOpenChange(false)}
          onSelect={(path) => {
            onSelect(path)
            onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

function PickerBody({
  initialPath,
  onSelect,
  onCancel,
}: {
  initialPath?: string
  onSelect: (path: string) => void
  onCancel: () => void
}) {
  const [target, setTarget] = useState<string | undefined>(initialPath || undefined)
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    browseDirectories(target).then(
      (next) => {
        if (cancelled) return
        setListing(next)
        setError(null)
        setLoading(false)
      },
      (thrown: unknown) => {
        if (cancelled) return
        // A starting path that no longer exists should not strand the dialog.
        if (thrown instanceof ApiError && target !== undefined) {
          setTarget(undefined)
          return
        }
        setError(thrown instanceof ApiError ? thrown.message : 'Could not read that folder.')
        setLoading(false)
      },
    )

    return () => {
      cancelled = true
    }
  }, [target])

  // Loading is set here, in the event that causes it, rather than inside the effect.
  const navigate = useCallback((path: string | undefined) => {
    setLoading(true)
    setTarget(path)
  }, [])

  const canSelect = Boolean(listing?.isGitRepo)

  return (
    <>
      {listing && <Breadcrumb listing={listing} onNavigate={navigate} />}

      <div className="relative min-h-64 rounded-lg border">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60">
            <Spinner className="text-muted-foreground" />
          </div>
        )}

        {error ? (
          <Alert variant="destructive" className="border-0">
            <TriangleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="h-64">
            <div className="p-1">
              {listing?.parent && (
                <Row onClick={() => navigate(listing.parent!)}>
                  <CornerLeftUp className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground">..</span>
                </Row>
              )}

              {listing?.entries.map((entry) => (
                <Row key={entry.path} onClick={() => navigate(entry.path)}>
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.name}</span>
                  <span className="ml-auto flex shrink-0 items-center gap-1.5">
                    {entry.isGitRepo && (
                      <Badge variant="secondary" className="text-[10px]">
                        git
                      </Badge>
                    )}
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </span>
                </Row>
              ))}

              {listing && listing.entries.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No folders inside this one.</p>
              )}
              {listing?.truncated && (
                <p className="p-2 text-xs text-muted-foreground">
                  Only the first {listing.entries.length} folders are shown.
                </p>
              )}
            </div>
          </ScrollArea>
        )}
      </div>

      <div className="space-y-1">
        <p className="truncate font-mono text-xs text-muted-foreground" title={listing?.path}>
          {listing?.path ?? '—'}
        </p>
        {listing && !listing.isGitRepo && (
          <p className="text-xs text-muted-foreground">
            This folder is not a Git repository. Open one marked{' '}
            <span className="font-medium">git</span>.
          </p>
        )}
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!canSelect} onClick={() => listing && onSelect(listing.path)}>
          Select this folder
        </Button>
      </DialogFooter>
    </>
  )
}

function Row({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
    >
      {children}
    </button>
  )
}

/** Clickable path segments, so you can jump several levels up at once. */
function Breadcrumb({
  listing,
  onNavigate,
}: {
  listing: DirectoryListing
  onNavigate: (path: string) => void
}) {
  const relative = listing.path.slice(listing.root.length).split('/').filter(Boolean)

  return (
    <div className="flex flex-wrap items-center gap-0.5 text-xs">
      <Button variant="ghost" size="xs" onClick={() => onNavigate(listing.root)}>
        Home
      </Button>
      {relative.map((segment, index) => (
        <span key={`${segment}-${index}`} className="flex items-center gap-0.5">
          <ChevronRight className="size-3 text-muted-foreground" />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onNavigate([listing.root, ...relative.slice(0, index + 1)].join('/'))}
          >
            {segment}
          </Button>
        </span>
      ))}
    </div>
  )
}
