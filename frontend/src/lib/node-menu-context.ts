import { createContext, use } from 'react'

export interface NodeMenuState {
  /** The node whose action menu is open, or null when none is. */
  openNodeId: string | null
  close: () => void
  /** Opens the Tests window for a node; the menu closes as it does. */
  openTests: (nodeId: string) => void
}

export const NodeMenuContext = createContext<NodeMenuState>({
  openNodeId: null,
  close: () => {},
  openTests: () => {},
})

export function useNodeMenu(): NodeMenuState {
  return use(NodeMenuContext)
}
