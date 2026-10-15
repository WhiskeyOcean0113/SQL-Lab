// Light / dark. Until the learner picks one, the page follows the system
// setting. The choice is a per-browser convenience, so it lives in
// localStorage; index.html applies it before first paint to avoid a flash.

export type Theme = 'light' | 'dark'
const KEY = 'sql-lab:theme'
const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches

/** The theme on screen now: the learner's choice, or the system's. */
export function currentTheme(): Theme {
  const set = document.documentElement.dataset.theme
  return set === 'light' || set === 'dark' ? set : systemDark() ? 'dark' : 'light'
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch { /* private mode: applies to this visit only */ }
}

/** Call when the system setting flips, so a control showing the theme can update. */
export function onSystemThemeChange(fn: () => void) {
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', fn)
}
