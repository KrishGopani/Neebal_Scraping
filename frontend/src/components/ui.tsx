import { Fragment, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '../lib/utils'
import type { Tone } from '../lib/api'

const TONE: Record<string, string> = {
  good: 'bg-good-soft text-good', bad: 'bg-bad-soft text-bad', warn: 'bg-warn-soft text-warn',
  info: 'bg-brand-soft text-brand', neutral: 'bg-subtle text-muted',
}
const ACCENT: Record<string, string> = { good: 'border-good', bad: 'border-bad', warn: 'border-warn', info: 'border-brand', neutral: 'border-line' }

export function Card({ title, subtitle, actions, children, className, bodyClass }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,.04)]', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-[15px] font-semibold leading-tight">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn('p-5', title && 'pt-3', bodyClass)}>{children}</div>
    </section>
  )
}

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone | string; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap', TONE[tone], className)}>{children}</span>
}
export const positionTone = (p: string): Tone => (p === 'Cheaper' ? 'good' : p === 'Pricier' ? 'bad' : 'neutral')
export const confidenceTone = (c: string): Tone => (c === 'High' ? 'good' : c === 'Medium' ? 'info' : 'warn')

export function Button({ variant = 'secondary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        variant === 'primary' && 'bg-brand text-white hover:opacity-90 dark:text-slate-900',
        variant === 'secondary' && 'border border-line bg-surface hover:bg-subtle',
        variant === 'ghost' && 'text-muted hover:bg-subtle hover:text-fg',
        className,
      )}
    />
  )
}

export function KpiCard({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone | ''; icon?: ReactNode }) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-fg'
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span>{label}</span>{icon}
      </div>
      <div className={cn('tabular mt-1.5 text-[28px] font-bold leading-none', color)}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </div>
  )
}

/** **bold** / *italic* -> React nodes (server insight text uses light markdown). */
export function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*.+?\*\*|\*.+?\*)/g)
  return (
    <>
      {parts.map((s, i) =>
        s.startsWith('**') ? <strong key={i}>{s.slice(2, -2)}</strong> : s.startsWith('*') && s.length > 2 ? <em key={i}>{s.slice(1, -1)}</em> : <Fragment key={i}>{s}</Fragment>,
      )}
    </>
  )
}
export function InsightCard({ tone, title, body }: { tone: Tone; title: string; body: string }) {
  return (
    <div className={cn('rounded-xl border-l-4 p-4 text-sm leading-relaxed', TONE[tone], ACCENT[tone])}>
      <div className="mb-0.5 font-semibold"><Md text={title} /></div>
      <div className="text-fg/90"><Md text={body} /></div>
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1.5">
      <span className="text-sm"><span className="font-medium">{label}</span>{hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={cn('relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition', checked ? 'bg-brand' : 'bg-line')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

export function Slider({ label, hint, value, min, max, step = 1, onChange, format }: {
  label: string; hint?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string
}) {
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span><span className="tabular font-semibold text-brand">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: readonly T[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg bg-subtle p-0.5">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className={cn('rounded-md font-medium transition', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm', o === value ? 'bg-surface shadow-sm' : 'text-muted hover:text-fg')}>
          {o}
        </button>
      ))}
    </div>
  )
}

export function Select({ value, onChange, options, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] | string[]; className?: string }) {
  const opts = (options as (string | { value: string; label: string })[]).map(o => (typeof o === 'string' ? { value: o, label: o } : o))
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={cn('rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-brand', className)}>
      {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

/** Toggle-able pills for multi-select (match types, positions, categories). */
export function Pills({ options, value, onChange, tone }: { options: readonly string[]; value: string[]; onChange: (v: string[]) => void; tone?: (o: string) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const on = value.includes(o)
        return (
          <button key={o} onClick={() => onChange(on ? value.filter(v => v !== o) : [...value, o])}
            className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition', on ? 'border-brand bg-brand-soft text-brand' : 'border-line text-muted hover:bg-subtle', on && tone?.(o))}>
            {o}
          </button>
        )
      })}
    </div>
  )
}

export function ScoreBar({ value }: { value: number }) {
  const c = value >= 75 ? 'bg-good' : value >= 60 ? 'bg-brand' : 'bg-warn'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-subtle"><div className={cn('h-full rounded-full', c)} style={{ width: `${Math.min(value, 100)}%` }} /></div>
      <span className="tabular text-xs text-muted">{value.toFixed(0)}</span>
    </div>
  )
}
export const Stars = ({ r }: { r: number | null | undefined }) =>
  r == null ? <span className="text-muted">—</span> : <span className="whitespace-nowrap text-warn">{'★'.repeat(Math.round(r))}<span className="opacity-30">{'★'.repeat(5 - Math.round(r))}</span><span className="ml-1 text-xs text-muted">{r.toFixed(1)}</span></span>

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
    <div><h1 className="text-xl font-bold tracking-tight">{title}</h1>{subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}</div>
    {actions}
  </div>
)
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton', className)} />
export const EmptyState = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
    <div className="text-base font-semibold">{title}</div>
    {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
  </div>
)
export const Grid = ({ cols = 2, children, className }: { cols?: 1 | 2 | 3 | 4 | 5; children: ReactNode; className?: string }) => (
  <div className={cn('grid gap-4', { 1: 'grid-cols-1', 2: 'grid-cols-1 lg:grid-cols-2', 3: 'grid-cols-1 lg:grid-cols-3', 4: 'grid-cols-2 lg:grid-cols-4', 5: 'grid-cols-2 lg:grid-cols-5' }[cols], className)}>{children}</div>
)
