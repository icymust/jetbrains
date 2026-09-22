import { useSyncExternalStore } from 'react'
import {
  Bug,
  Cog,
  Container,
  Database,
  FileCode,
  Flag,
  GitBranch,
  Hammer,
  Lock,
  Rocket,
  Ruler,
  Scale,
  Sparkles,
  Timer,
  Wand2,
  Zap,
} from 'lucide-react'

/**
 * Actions someone defines themselves, kept in the browser. There is no backend for these:
 * a prompt or script is stored and shown, never sent or run.
 */
export const actionIcons = {
  zap: Zap,
  sparkles: Sparkles,
  wand: Wand2,
  bug: Bug,
  hammer: Hammer,
  rocket: Rocket,
  cog: Cog,
  timer: Timer,
  lock: Lock,
  scale: Scale,
  ruler: Ruler,
  flag: Flag,
  database: Database,
  container: Container,
  branch: GitBranch,
  file: FileCode,
} as const

export type ActionIconName = keyof typeof actionIcons

export interface CustomAction {
  id: string
  name: string
  icon: ActionIconName
  prompt?: string
  script?: string
}

const STORAGE_KEY = 'codeorbit-custom-actions'

function isCustomAction(value: unknown): value is CustomAction {
  if (typeof value !== 'object' || value === null) return false
  const action = value as Partial<CustomAction>
  return (
    typeof action.id === 'string' &&
    typeof action.name === 'string' &&
    action.name.trim().length > 0 &&
    typeof action.icon === 'string' &&
    action.icon in actionIcons
  )
}

function load(): CustomAction[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    // Anything malformed is dropped rather than crashing the menu it feeds.
    return Array.isArray(stored) ? stored.filter(isCustomAction) : []
  } catch {
    return []
  }
}

let actions: CustomAction[] = load()
const listeners = new Set<() => void>()

function emit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actions))
  } catch {
    // Blocked storage should not stop the action working for this session.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Stable between changes, which useSyncExternalStore requires. */
function getSnapshot(): CustomAction[] {
  return actions
}

export function addCustomAction(action: Omit<CustomAction, 'id'>): CustomAction {
  const created: CustomAction = { ...action, id: crypto.randomUUID() }
  actions = [...actions, created]
  emit()
  return created
}

export function removeCustomAction(id: string): void {
  actions = actions.filter((action) => action.id !== id)
  emit()
}

/** Every node's menu reads this, so a new action shows up in all of them at once. */
export function useCustomActions(): CustomAction[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
