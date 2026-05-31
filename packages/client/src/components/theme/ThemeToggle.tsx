import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "./ThemeProvider";

/** Ordered cycle: light → dark → system → light */
const THEME_CYCLE: Theme[] = ["light", "dark", "system"];

const THEME_ICON = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const THEME_LABEL = {
  light: "Switch to dark mode",
  dark: "Switch to system mode",
  system: "Switch to light mode",
} as const;

/**
 * An icon button that cycles through light / dark / system themes.
 *
 * Intended for placement in the {@link BottomBar} status bar (VSCode-style).
 * Uses shadcn `<Button variant="ghost" size="icon">` and Lucide icons.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  function handleClick() {
    const currentIndex = THEME_CYCLE.indexOf(theme);
    const next = THEME_CYCLE[(currentIndex + 1) % THEME_CYCLE.length];
    // Safe: THEME_CYCLE is a fixed-size tuple; indexOf always returns a valid index for a known Theme value.
    setTheme(next!);
  }

  const Icon = THEME_ICON[theme];

  return (
    <Button
      id="theme-toggle-btn"
      variant="ghost"
      size="icon"
      className="h-5 w-5 rounded-none text-neutral-400 hover:text-neutral-200 hover:bg-transparent"
      onClick={handleClick}
      aria-label={THEME_LABEL[theme]}
      title={THEME_LABEL[theme]}
    >
      <Icon className="h-3 w-3" />
    </Button>
  );
}
