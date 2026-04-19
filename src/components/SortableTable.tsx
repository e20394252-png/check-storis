'use client';

import { useState, useMemo } from 'react';

export type RegRow = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  adminNote?: string | null;
  user: { first_name?: string | null; username?: string | null };
  event: { title?: string | null };
};

type Column = {
  key: string;
  label: string;
  getValue: (row: RegRow) => string | number;
  render: (row: RegRow) => React.ReactNode;
};

type Props = {
  rows: RegRow[];
  columns: Column[];
  emptyMessage?: string;
  borderColor?: string;
  headerBg?: string;
  rowOpacity?: number;
  defaultSort?: string;
  defaultDir?: 'asc' | 'desc';
};

const cyan   = '#00e5ff';
const muted  = '#6870a0';

export default function SortableTable({
  rows, columns,
  emptyMessage = 'Нет данных',
  borderColor = 'rgba(0,229,255,0.12)',
  headerBg    = 'rgba(0,229,255,0.03)',
  rowOpacity  = 1,
  defaultSort = 'createdAt',
  defaultDir  = 'desc',
}: Props) {
  const [sortKey, setSortKey]   = useState(defaultSort);
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>(defaultDir);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sortKey);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = col.getValue(a);
      const bv = col.getValue(b);
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [rows, sortKey, sortDir, columns]);

  const th: React.CSSProperties = {
    padding: '11px 16px',
    textAlign: 'left',
    fontWeight: 600,
    letterSpacing: '0.04em',
    fontSize: 11,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
    userSelect: 'none',
  };

  const td: React.CSSProperties = {
    padding: '13px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    fontSize: 13,
  };

  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${borderColor}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: headerBg, borderBottom: `1px solid ${borderColor}` }}>
            {columns.map(col => {
              const isActive = sortKey === col.key;
              const arrow = isActive ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ⇅';
              return (
                <th key={col.key} style={th}>
                  <span
                    onClick={() => handleSort(col.key)}
                    style={{
                      color: isActive ? cyan : muted,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      transition: 'color 0.15s',
                    }}
                  >
                    {col.label}
                    <span style={{ opacity: isActive ? 1 : 0.4, fontSize: 10 }}>{arrow}</span>
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 48, textAlign: 'center', color: muted }}>
                {emptyMessage}
              </td>
            </tr>
          ) : sorted.map(row => (
            <tr key={row.id} style={{ opacity: rowOpacity }}>
              {columns.map(col => (
                <td key={col.key} style={td}>{col.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
