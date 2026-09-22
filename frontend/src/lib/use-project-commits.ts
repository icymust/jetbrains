import { useEffect, useState } from 'react'

import { ApiError, getProjectCommits, type GitCommit } from './api'

export type CommitsState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; commits: GitCommit[] }

/**
 * Loads the project's recent commits once.
 *
 * It sits outside the card because the chip that opens the card shows the count, so the
 * two read a single fetch rather than each making their own.
 */
export function useProjectCommits(projectId: string): CommitsState {
  const [state, setState] = useState<CommitsState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    getProjectCommits(projectId).then(
      (commits) => {
        if (!cancelled) setState({ status: 'ready', commits })
      },
      (error: unknown) => {
        if (cancelled) return
        setState({
          status: 'error',
          message:
            error instanceof ApiError ? error.message : 'Could not read the commit history.',
        })
      },
    )

    return () => {
      cancelled = true
    }
  }, [projectId])

  return state
}
