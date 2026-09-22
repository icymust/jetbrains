import type { ProjectNode } from './api'
import { stableHash } from './stable-hash'

/**
 * Invented test figures for a node.
 *
 * Nothing here is measured: there is no runner, no coverage tool and no backend endpoint
 * behind any of it. The panel says so, because a coverage percentage is the kind of number
 * people act on. This is the single place to delete once real test data exists.
 */
export interface TestSuite {
  type: string
  count: number
}

export interface MockTests {
  suites: TestSuite[]
  total: number
  /** Percentage, in a believable band rather than a suspiciously round number. */
  coverage: number
  runDurationMs: number
}

const suiteTypes = ['Unit', 'Integration', 'API', 'E2E'] as const

export function mockTestsFor(node: ProjectNode): MockTests {
  const seed = stableHash(node.id)
  // A service covers more ground than one of its features, so it should read busier.
  const scale = node.type === 'service' ? 1 : 0.4

  const suites = suiteTypes.map((type, index) => {
    // A different slice of the seed per type, so the counts are not all in step.
    const raw = ((seed >> (index * 5)) % 23) + 2
    return { type, count: Math.max(1, Math.round(raw * scale)) }
  })

  return {
    suites,
    total: suites.reduce((sum, suite) => sum + suite.count, 0),
    coverage: 55 + (seed % 41),
    runDurationMs: 2600 + (seed % 900),
  }
}
