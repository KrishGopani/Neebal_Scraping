import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export interface Palette {
  fg: string; muted: string; line: string; surface: string
  ours: string; comp: string; good: string; bad: string; neutral: string; warn: string; dark: boolean
}
const light: Palette = { fg: '#0f172a', muted: '#64748b', line: '#e2e8f0', surface: '#ffffff', ours: '#2563eb', comp: '#f59e0b', good: '#16a34a', bad: '#dc2626', neutral: '#94a3b8', warn: '#d97706', dark: false }
const dark: Palette = { fg: '#e6edf7', muted: '#8fa0ba', line: '#24304a', surface: '#111a2e', ours: '#60a5fa', comp: '#fbbf24', good: '#34d399', bad: '#f87171', neutral: '#64748b', warn: '#fbbf24', dark: true }

const Ctx = createContext<{ isDark: boolean; toggle: () => void; palette: Palette }>(null as never)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    try { localStorage.setItem('theme', isDark ? 'dark' : 'light') } catch { /* ignore */ }
  }, [isDark])
  return <Ctx.Provider value={{ isDark, toggle: () => setDark(d => !d), palette: isDark ? dark : light }}>{children}</Ctx.Provider>
}
export const useTheme = () => useContext(Ctx)
