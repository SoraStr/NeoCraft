import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system' | 'mc-classic' | 'mc-modern';

interface ThemeContextValue {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
});

const STORAGE_KEY = 'neocraft-theme';

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Theme) || 'system';
    } catch {
      return 'system';
    }
  });

  const resolved: 'light' | 'dark' = (() => {
    if (theme === 'system') return getSystemPreference();
    if (theme === 'mc-classic') return 'dark';
    if (theme === 'mc-modern') return 'dark';
    return theme;
  })();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'mc-classic', 'mc-modern');
    if (theme === 'dark' || resolved === 'dark') {
      root.classList.add('dark');
    }
    if (theme === 'mc-classic') {
      root.classList.add('mc-classic');
    }
    if (theme === 'mc-modern') {
      root.classList.add('mc-modern');
    }
  }, [theme, resolved]);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setThemeState('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {}
  };

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
