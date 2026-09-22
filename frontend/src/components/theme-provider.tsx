import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type Theme,
  type ThemeContextValue,
} from '@/lib/theme-context'

/** Matches the inline script in index.html, which applies the theme before first paint. */
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // Private mode or blocked storage — fall back to the default below.
  }
  // The app has always been dark, so that stays the default until someone picks otherwise.
  // Swap for a prefers-color-scheme check to follow the OS instead.
  return 'dark'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Not being able to remember the choice should not break switching it.
    }
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    }),
    [theme, setTheme],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
