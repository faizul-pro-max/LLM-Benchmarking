import { create } from 'zustand'

export type Theme = 'dark' | 'light'

function applyTheme(theme: Theme) {
  // 'light' class on <html> swaps the CSS variables defined in index.css
  document.documentElement.classList.toggle('light', theme === 'light')
}

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

interface ThemeStore {
  theme: Theme
  toggle: () => void
  setTheme: (t: Theme) => void
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: readStoredTheme(),
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setTheme: (theme) => {
    try {
      localStorage.setItem('theme', theme)
    } catch {
      /* ignore persistence errors (private mode, etc.) */
    }
    applyTheme(theme)
    set({ theme })
  },
}))

// Ensure the DOM class matches the store on first load (index.html sets it pre-paint;
// this keeps them in sync if that inline script was skipped).
applyTheme(useThemeStore.getState().theme)
