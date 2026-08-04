// Light/Dark theme. Stored in localStorage and applied as data-theme on <html>.
const KEY = 'theme'

export function getTheme() {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}

export function applyTheme(t) {
  const v = t === 'light' ? 'light' : 'dark'
  try { document.documentElement.setAttribute('data-theme', v) } catch { /* ignore */ }
  try { localStorage.setItem(KEY, v) } catch { /* ignore */ }
  return v
}
