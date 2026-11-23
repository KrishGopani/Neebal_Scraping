/**
 * Reusable data table: sorting, text search, pagination and CSV export, built on TanStack Table.
 *
 * Used by the Matches, Pricing, Categories, Actions, Market and Catalogue pages. A page supplies `data` (array of row
 * objects) and `columns` (TanStack column definitions: header text, which field to read, and how to render the cell).
 * TanStack Table is "headless" — it computes the rows; this file provides all the markup and styling.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import { Button } from './ui'
import { cn, downloadCsv } from '../lib/utils'

/**
 * Props: `data`, `columns`; `pageSize` rows per page; `searchable` shows the search box; `onRowClick` makes rows clickable
 * (e.g. open a drawer); `initialSort` pre-sorts; `toolbar` adds extra controls next to the search; `csvName` enables the CSV
 * button (exports the filtered+sorted rows); `empty` is the no-rows message; `dense` uses tighter row padding.
 */
export function DataTable<T extends object>({ data, columns, pageSize = 10, searchable = true, onRowClick, initialSort, toolbar, csvName, empty = 'No rows', dense }: {
  data: T[]; columns: ColumnDef<T, any>[]; pageSize?: number; searchable?: boolean; onRowClick?: (row: T) => void
  initialSort?: SortingState; toolbar?: ReactNode; csvName?: string; empty?: string; dense?: boolean
}) {
  // UI state owned here: current sort order and the search text.
  const [sorting, setSorting] = useState<SortingState>(initialSort ?? [])
  const [filter, setFilter] = useState('')
  // Build the table model. The get*RowModel plugins switch on core rows, sorting, filtering and pagination.
  const table = useReactTable({
    data, columns, state: { sorting, globalFilter: filter }, onSortingChange: setSorting, onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(), initialState: { pagination: { pageSize } },
    // Search matches if the lowercase search text appears anywhere in the row's values (simple but effective for small tables).
    globalFilterFn: (row, _id, v) => JSON.stringify(Object.values(row.original)).toLowerCase().includes(String(v).toLowerCase()),
  })
  // `rows` = the current page after filtering+sorting; `total` = all rows that pass the filter (for the count and pagination).
  const rows = table.getRowModel().rows
  const total = table.getFilteredRowModel().rows.length
  const pg = table.getState().pagination
  // CSV export uses ALL filtered rows (not just the visible page), in current sort order.
  const csv = useMemo(() => () => downloadCsv(table.getFilteredRowModel().rows.map(r => r.original as Record<string, unknown>), csvName ?? 'export.csv'), [table, csvName])

  return (
    <div>
      {/* Toolbar: search box, optional extra controls, row count and CSV button. */}
      {(searchable || toolbar || csvName) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search…"
                className="w-56 rounded-lg border border-line bg-surface py-2 pl-8 pr-3 text-sm outline-none focus:border-brand" />
            </div>
          )}
          {toolbar}
          <div className="ml-auto flex items-center gap-3 text-xs text-muted">
            <span>{total} row{total === 1 ? '' : 's'}</span>
            {csvName && <Button size="sm" onClick={csv}><Download size={13} /> CSV</Button>}
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse text-sm">
          {/* Header cells: clicking a sortable header toggles ascending/descending, shown with an arrow icon. */}
          <thead className="bg-subtle text-left text-xs font-semibold uppercase tracking-wide text-muted">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} className={cn('px-3 py-2.5 whitespace-nowrap', h.column.getCanSort() && 'cursor-pointer select-none hover:text-fg')} onClick={h.column.getToggleSortingHandler()}>
                    <span className="inline-flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {h.column.getIsSorted() === 'asc' ? <ArrowUp size={12} /> : h.column.getIsSorted() === 'desc' ? <ArrowDown size={12} /> : null}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} onClick={() => onRowClick?.(r.original)} className={cn('border-t border-line transition', onRowClick && 'cursor-pointer hover:bg-subtle/70')}>
                {r.getVisibleCells().map(c => <td key={c.id} className={cn('px-3 align-middle', dense ? 'py-1.5' : 'py-2.5')}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>)}
              </tr>
            ))}
            {/* Empty-state row when no rows match. */}
            {!rows.length && <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-muted">{empty}</td></tr>}
          </tbody>
        </table>
      </div>
      {/* Pagination controls, shown only when there is more than one page. */}
      {total > pg.pageSize && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted">
          <span>Page {pg.pageIndex + 1} of {table.getPageCount()}</span>
          <div className="flex gap-1.5">
            <Button size="sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft size={14} /></Button>
            <Button size="sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight size={14} /></Button>
          </div>
        </div>
      )}
    </div>
  )
}
