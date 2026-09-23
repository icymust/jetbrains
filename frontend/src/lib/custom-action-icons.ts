import {
  Activity,
  BookOpen,
  Bug,
  Code,
  FileText,
  Search,
  Shield,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react'

export const customActionIcons = {
  'file-text': FileText,
  document: FileText,
  search: Search,
  shield: Shield,
  zap: Zap,
  wrench: Wrench,
  bug: Bug,
  code: Code,
  'book-open': BookOpen,
  activity: Activity,
  sparkles: Sparkles,
} as const

export type CustomActionIconName = keyof typeof customActionIcons

export function getCustomActionIcon(name: string) {
  return customActionIcons[name as CustomActionIconName] ?? Sparkles
}
