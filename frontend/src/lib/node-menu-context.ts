import { createContext, use } from 'react'
import type { ChatAction } from './chat-prompt'

export interface NodeMenuState {
  projectId: string
  /** The node whose action menu is open, or null when none is. */
  openNodeId: string | null
  close: () => void
  /** Opens the Tests window for a node; the menu closes as it does. */
  openTests: (nodeId: string) => void
  /** Opens the Audit window for a node. */
  openAudit: (nodeId: string) => void
  /** Opens the chat modal for a node, seeded with the action's question. */
  openChat: (nodeId: string, action: ChatAction) => void
}

export const NodeMenuContext = createContext<NodeMenuState>({
  projectId: '',
  openNodeId: null,
  close: () => {},
  openTests: () => {},
  openAudit: () => {},
  openChat: () => {},
})

export function useNodeMenu(): NodeMenuState {
  return use(NodeMenuContext)
}
