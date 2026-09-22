import type { ProjectNode } from './api'

/** The node actions that open the chat. */
export type ChatAction = 'To chat' | 'Explain'

/**
 * The message the chat opens with when it is reached from a node.
 *
 * It names the node and asks the question, and stops there. Nothing in the frontend has
 * read the repository, so a prompt that described what the node *does* would be inventing
 * it — the same reason node-description.ts keeps its wording generic.
 */
export function promptFor(node: ProjectNode, action: ChatAction): string {
  if (action === 'Explain') {
    return `Explain what the ${node.type} “${node.name}” does and how it fits into the rest of the architecture.`
  }
  return `Let's talk about the ${node.type} “${node.name}” in this project map.`
}
