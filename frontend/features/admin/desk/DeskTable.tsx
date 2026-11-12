import type { ReactNode } from 'react';

export interface DeskColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  align?: 'right';
  /// A CSS grid track, e.g. '1.4fr' or '140px'. Defaults to 1fr.
  width?: string;
}

export function DeskTable<T>({ columns, rows, rowKey, onOpen, selected, empty, footer }: {
  columns: DeskColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  selected?: string | null;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  const grid = { gridTemplateColumns: columns.map((c) => c.width ?? 'minmax(0,1fr)').join(' ') };
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-[var(--d-line)] bg-[var(--d-surface)]">
        <div className="min-w-[640px]" role="table">
          <div role="row" className="grid gap-4 bg-[var(--d-head)] px-4 py-[9px]" style={grid}>
            {columns.map((c) => (
              <span key={c.key} role="columnheader" className={`text-[12px] font-medium text-[var(--d-text-3)] ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</span>
            ))}
          </div>
          {rows.length === 0 && <p className="border-t border-[var(--d-line)] px-4 py-8 text-center text-[13px] text-[var(--d-text-3)]">{empty ?? 'Nothing here.'}</p>}
          {rows.map((row) => {
            const key = rowKey(row);
            const open = onOpen ? () => onOpen(row) : undefined;
            return (
              <div
                key={key}
                role="row"
                tabIndex={open ? 0 : undefined}
                onClick={open}
                onKeyDown={open ? (e) => { if (e.key === 'Enter') open(); } : undefined}
                className={`grid min-h-[54px] items-center gap-4 border-t border-[var(--d-line)] px-4 py-2.5 ${open ? 'cursor-pointer hover:bg-[var(--d-hover)]' : ''} ${selected === key ? 'bg-[var(--d-hover)]' : ''}`}
                style={grid}
              >
                {columns.map((c) => (
                  <div key={c.key} role="cell" className={`min-w-0 ${c.align === 'right' ? 'text-right' : ''}`}>{c.render(row)}</div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {footer && <div className="mt-2.5 text-[12px] text-[var(--d-text-3)]">{footer}</div>}
    </div>
  );
}

/// A cell with a main line and a quieter line under it.
export function Cell({ main, under, tone }: { main: ReactNode; under?: ReactNode; tone?: 'red' }) {
  return (
    <>
      <p className={`truncate text-[13px] font-medium ${tone === 'red' ? 'text-[var(--d-red)]' : 'text-[var(--d-text)]'}`}>{main}</p>
      {under && <p className="mt-0.5 truncate text-[12px] text-[var(--d-text-3)]">{under}</p>}
    </>
  );
}
