import { useCallback, useEffect, useState } from 'react'

import { getCustomActions, type CustomAction } from '@/lib/api'

type CustomActionsState =
  | { status: 'idle'; actions: CustomAction[] }
  | { status: 'loading'; actions: CustomAction[] }
  | { status: 'ready'; actions: CustomAction[] }
  | { status: 'error'; actions: CustomAction[]; message: string }

export function useCustomActions(projectId: string, nodeId: string, enabled: boolean) {
  const [state, setState] = useState<CustomActionsState>({ status: 'idle', actions: [] })
  const [revision, setRevision] = useState(0)

  const refresh = useCallback(() => setRevision((value) => value + 1), [])

  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle', actions: [] })
      return
    }

    const controller = new AbortController()
    setState({ status: 'loading', actions: [] })
    getCustomActions(projectId, nodeId, controller.signal).then(
      (actions) => {
        if (!controller.signal.aborted) setState({ status: 'ready', actions })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: 'error',
          actions: [],
          message: error instanceof Error ? error.message : 'Could not load custom actions.',
        })
      },
    )

    return () => controller.abort()
  }, [enabled, nodeId, projectId, revision])

  return { ...state, refresh }
}
