import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme-context'

/** Switches between the light and dark palettes; the choice is remembered per browser. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <Button
      variant="outline"
      size="icon"
      className={className}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={toggleTheme}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
