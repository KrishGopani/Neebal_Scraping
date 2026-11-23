/**
 * Slide-in side panel ("drawer") with a dimmed backdrop.
 *
 * Used for the Filters panel (SettingsPanel.tsx) and the side-by-side product comparison on the Matches page. It is always
 * in the DOM and slides in/out with a CSS transform, which gives a smooth animation without extra libraries.
 */
import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

/** Props: `open` (visible?), `onClose` (called on backdrop click, X button or Escape), `title`, `children` (content), `width` (Tailwind max-width class). */
export function Drawer({ open, onClose, title, children, width = 'max-w-md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: string }) {
  useEffect(() => {
    // Close on the Escape key — but only listen while the drawer is open, and clean the listener up afterwards.
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <>
      {/* Backdrop: click outside the panel to close. Fades in/out; `pointer-events-none` when closed so it can't block clicks. */}
      <div onClick={onClose} className={cn('fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] transition', open ? 'opacity-100' : 'pointer-events-none opacity-0')} />
      {/* The panel itself, fixed to the right edge; translated off-screen (translate-x-full) when closed. */}
      <aside className={cn('fixed right-0 top-0 z-50 flex h-full w-full flex-col border-l border-line bg-surface shadow-2xl transition-transform duration-200', width, open ? 'translate-x-0' : 'translate-x-full')}>
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="text-base font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-subtle hover:text-fg" aria-label="Close"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </>
  )
}
