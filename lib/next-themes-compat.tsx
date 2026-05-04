"use client"

import * as React from "react"

export type Theme = "light" | "dark" | "system" | string

export interface ThemeProviderProps {
  children: React.ReactNode
  themes?: string[]
  forcedTheme?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
  storageKey?: string
  defaultTheme?: string
  attribute?: "class" | `data-${string}`
  value?: Record<string, string>
  enableColorScheme?: boolean
}

interface ThemeContextValue {
  theme: string
  setTheme: (theme: string) => void
  resolvedTheme: string
  systemTheme: "light" | "dark"
  themes: string[]
  forcedTheme?: string
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

const DEFAULT_THEMES = ["light", "dark"]

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function applyNoTransition(): () => void {
  const style = document.createElement("style")
  style.appendChild(document.createTextNode("*{transition:none!important}"))
  document.head.appendChild(style)

  return () => {
    // Force reflow, then remove style so transitions continue normally.
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    window.getComputedStyle(document.body)
    document.head.removeChild(style)
  }
}

function applyThemeToDom(
  resolvedTheme: string,
  themes: string[],
  attribute: ThemeProviderProps["attribute"],
  value: Record<string, string> | undefined,
  enableColorScheme: boolean,
  disableTransitionOnChange: boolean
) {
  const root = document.documentElement
  const cleanup = disableTransitionOnChange ? applyNoTransition() : undefined

  const mapThemeValue = value?.[resolvedTheme] ?? resolvedTheme

  if (attribute === "class") {
    root.classList.remove(...themes)
    root.classList.add(mapThemeValue)
  } else {
    root.setAttribute(attribute || "data-theme", mapThemeValue)
  }

  if (enableColorScheme) {
    root.style.colorScheme = resolvedTheme === "dark" ? "dark" : "light"
  }

  if (cleanup) cleanup()
}

export function ThemeProvider({
  children,
  themes = DEFAULT_THEMES,
  forcedTheme,
  enableSystem = true,
  disableTransitionOnChange = false,
  storageKey = "theme",
  defaultTheme = enableSystem ? "system" : "light",
  attribute = "class",
  value,
  enableColorScheme = true,
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<string>(defaultTheme)
  const [systemTheme, setSystemTheme] = React.useState<"light" | "dark">("light")

  React.useEffect(() => {
    setSystemTheme(getSystemTheme())

    if (typeof window === "undefined") return

    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) {
        setThemeState(stored)
      }
    } catch {
      // Ignore localStorage access failures.
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystemTheme(media.matches ? "dark" : "light")

    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [storageKey])

  const setTheme = React.useCallback(
    (newTheme: string) => {
      setThemeState(newTheme)
      try {
        window.localStorage.setItem(storageKey, newTheme)
      } catch {
        // Ignore localStorage access failures.
      }
    },
    [storageKey]
  )

  const resolvedTheme = React.useMemo(() => {
    const active = forcedTheme ?? theme
    return active === "system" ? systemTheme : active
  }, [forcedTheme, theme, systemTheme])

  React.useEffect(() => {
    if (typeof window === "undefined") return
    applyThemeToDom(
      resolvedTheme,
      themes,
      attribute,
      value,
      enableColorScheme,
      disableTransitionOnChange
    )
  }, [
    resolvedTheme,
    themes,
    attribute,
    value,
    enableColorScheme,
    disableTransitionOnChange,
  ])

  const contextValue = React.useMemo<ThemeContextValue>(
    () => ({
      theme: forcedTheme ?? theme,
      setTheme,
      resolvedTheme,
      systemTheme,
      themes,
      forcedTheme,
    }),
    [theme, setTheme, resolvedTheme, systemTheme, themes, forcedTheme]
  )

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext)
  if (!context) {
    return {
      theme: "system",
      setTheme: () => {},
      resolvedTheme: "light",
      systemTheme: "light",
      themes: DEFAULT_THEMES,
      forcedTheme: undefined,
    }
  }
  return context
}
