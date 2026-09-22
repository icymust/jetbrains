/**
 * Invented commits for the Completed Tasks card.
 *
 * Nothing here is read from git. The card is titled after a branch and lays the rows out
 * like `git log --oneline`, which is exactly why these messages are generic rather than
 * copied from any real history — a list that looked like someone's actual commits would
 * be taken for them. The card carries a `mock` badge for the same reason. This is the
 * single place to delete once a real commit source exists.
 */
export interface Commit {
  /** Abbreviated SHA, the seven characters git itself shows. */
  hash: string
  /** The subject line only — the card gives each commit exactly one row. */
  message: string
}

/** Newest first, the order `git log` returns. */
export const mockCommits: Commit[] = [
  { hash: '9f3c1ab', message: 'Open node actions on right click, and add a mock tests panel' },
  { hash: '4d80e57', message: 'Trim edges back to each circle so lines stop crossing node faces' },
  { hash: 'b21a6f4', message: 'Add folder selection on the add product page' },
  { hash: '7ce9052', message: 'Move project analysis onto a dedicated loading page' },
  { hash: '0a5b83d', message: 'Retire the demo graph page and drive the real one from the backend' },
  { hash: 'e64f2c9', message: 'Add a light/dark theme switcher and lift the dark palette' },
  { hash: '3b17ae8', message: 'Cache the analyzer response between reloads' },
  { hash: 'c92d40f', message: 'Lay features out on an arc around the service that owns them' },
  { hash: '5e8b1d6', message: 'Validate the graph the model returns before writing it to disk' },
  { hash: 'a70c3f2', message: 'Watch the working tree for new commits and re-analyze' },
  { hash: '1df6b90', message: 'Confine directory browsing to a single configured root' },
  { hash: '8ab452e', message: 'Set up the project' },
]
