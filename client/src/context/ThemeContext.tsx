/**
 * ThemeContext - dark / light mode toggle with localStorage persistence.
 * The active theme is applied as data-theme="dark"|"light" on <html>.
 */
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "dark" | "light";

/**
 * TEMPORARY: lock the entire app to dark mode and hide the theme toggle.
 * Light mode is parked (all light-mode styles remain in the codebase) and will
 * be revisited in a future version. Set LOCK_DARK = false to restore switching.
 */
export const LOCK_DARK = true;

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (LOCK_DARK) return "dark";
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("gmwr-theme") as Theme) ?? "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", LOCK_DARK ? "dark" : theme);
    if (!LOCK_DARK) localStorage.setItem("gmwr-theme", theme);
  }, [theme]);

  const toggle = () => {
    if (LOCK_DARK) return;
    setTheme(t => (t === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
