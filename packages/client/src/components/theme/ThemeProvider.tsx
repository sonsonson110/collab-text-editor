import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/** The three settable theme values. `"system"` follows the OS preference. */
export type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** The resolved theme after applying the system preference. */
  resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "app:theme";

interface ThemeProviderProps {
  children: ReactNode;
  /** Default theme when no value is stored in localStorage. Defaults to `"system"`. */
  defaultTheme?: Theme;
}

/**
 * Provides light / dark / system theme switching for the entire application.
 *
 * Applies the resolved theme as a `"dark"` or `"light"` class on `<html>` so
 * that Tailwind's class-based dark-mode variant and shadcn's CSS variables both
 * pick up the correct token values.
 *
 * Persists the user's explicit choice in `localStorage` under the key
 * `"app:theme"`. When `"system"` is chosen the provider listens to the
 * `prefers-color-scheme` media query and updates automatically.
 */
export function ThemeProvider({ children, defaultTheme = "system" }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored ?? defaultTheme;
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    resolveTheme(theme),
  );

  function resolveTheme(t: Theme): "light" | "dark" {
    if (t !== "system") return t;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(resolved: "light" | "dark") {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
  }

  // Apply theme class on mount and whenever theme changes.
  useEffect(() => {
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [theme]);

  // Track system preference changes when theme is "system".
  useEffect(() => {
    if (theme !== "system") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };

    mq.addEventListener("change", handler);
    return () => {
      mq.removeEventListener("change", handler);
    };
  }, [theme]);

  function setTheme(next: Theme) {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Returns the current theme setting and resolved theme from the nearest
 * {@link ThemeProvider}. Throws if called outside a provider.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a <ThemeProvider>");
  }
  return ctx;
}
