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

export type TableType = 'all' | 'approved' | 'rejected' | 'archive';

const cyan   = '#00e5ff';
const muted  = '#6870a0';
const green  = '#00ff88';
const pink   = '#ff0080';
const yellow = '#ffc800';

type ColDef = {
  key: string;
  label: string;
  getValue: (r: RegRow) => string | number;
  render:   (r: RegRow) => React.ReactNode;
};

function getColumns(type: TableType): ColDef[] {
  const colName: ColDef = {
    key: 'name', label: 'Имя',
    getValue: r => r.user.first_name || '',
    render:   r => <b style={{ fontWeight: 600, color: type === 'approved' ? green : undefined }}>{r.user.first_name || '—'}</b>,
  };
  const colUser: ColDef = {
    key: 'username', label: '@username',
    getValue: r => r.user.username || '',
    render:   r => <span style={{ color: muted }}>{r.user.username ? `@${r.user.username}` : '—'}</span>,
  };
  const colEvent: ColDef = {
    key: 'event', label: 'Мероприятие',
    getValue: r => r.event.title || '',
    render:   r => <span style={{ color: cyan, fontSize: 12 }}>{r.event.title || '—'}</span>,
  };
  const colDate: ColDef = {
    key: 'createdAt', label: 'Дата подачи',
    getValue: r => r.createdAt,
    render:   r => <span style={{ color: muted, fontSize: 11 }}>{new Date(r.createdAt).toLocaleString('ru-RU')}</span>,
  };
  const colUpdated: ColDef = {
    key: 'updatedAt', label: 'Дата',
    getValue: r => r.updatedAt,
    render:   r => <span style={{ color: muted, fontSize: 11 }}>{new Date(r.updatedAt).toLocaleString('ru-RU')}</span>,
  };
  const colStatus: ColDef = {
    key: 'status', label: 'Статус',
    getValue: r => r.status,
    render: r => {
      const c = r.status === 'APPROVED' ? green : r.status === 'REJECTED' ? pink : yellow;
      const l = r.status === 'APPROVED' ? 'Одобрен' : r.status === 'REJECTED' ? 'Отклонён' : 'На проверке';
      return <span style={{ fontSize: 11, fontWeight: 700, color: c }}>{l}</span>;
    },
  };
  const colNote: ColDef = {
    key: 'adminNote', label: 'Причина',
    getValue: r => r.adminNote || '',
    render:   r => <span style={{ color: muted, fontSize: 11 }}>{r.adminNote || '—'}</span>,
  };

  switch (type) {
    case 'approved': return [colName, colUser, colEvent, colUpdated];
    case 'rejected': return [colName, colUser, colEvent, colUpdated, colNote];
    case 'archive':  return [colName, colUser, colEvent, colDate, colStatus];
    default:         return [colName, colUser, colEvent, colDate, colStatus];
  }
}

const tableMeta: Record<TableType, { borderColor: string; headerBg: string; defaultSort: string }> = {
  all:      { borderColor: 'rgba(0,229,255,0.12)',    headerBg: 'rgba(0,229,255,0.03)',    defaultSort: 'createdAt' },
  approved: { borderColor: 'rgba(0,255,136,0.15)',    headerBg: 'rgba(0,255,136,0.03)',    defaultSort: 'updatedAt' },
  rejected: { borderColor: 'rgba(255,0,128,0.15)',    headerBg: 'rgba(255,0,128,0.03)',    defaultSort: 'updatedAt' },
  archive:  { borderColor: 'rgba(255,255,255,0.07)',  headerBg: 'rgba(255,255,255,0.02)', defaultSort: 'createdAt' },
};

type Props = {
  rows: RegRow[];
  tableType: TableType;
  emptyMessage?: string;
};

export default function RegistrationsTable({ rows, tableType, emptyMessage = 'Нет данных' }: Props) {
  const meta    = tableMeta[tableType];
  const columns = useMemo(() => getColumns(tableType), [tableType]);

  const [sortKey, setSortKey] = useState(meta.defaultSort);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sortKey);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = col.getValue(a);
      const bv = col.getValue(b);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'ru');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const th: React.CSSProperties = {
    padding: '11px 16px', textAlign: 'left', fontWeight: 600,
    letterSpacing: '0.04em', fontSize: 11, textTransform: 'uppercase',
    whiteSpace: 'nowrap', userSelect: 'none',
  };
  const td: React.CSSProperties = {
    padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13,
  };

  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${meta.borderColor}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: meta.headerBg, borderBottom: `1px solid ${meta.borderColor}` }}>
            {columns.map(col => {
              const isActive = sortKey === col.key;
              const arrow = isActive ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ' ⇅';
              return (
                <th key={col.key} style={th}>
                  <span
                    onClick={() => handleSort(col.key)}
                    style={{ color: isActive ? cyan : muted, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, transition: 'color 0.15s' }}
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
            <tr><td colSpan={columns.length} style={{ padding: 48, textAlign: 'center', color: muted }}>{emptyMessage}</td></tr>
          ) : sorted.map(row => (
            <tr key={row.id} style={{ opacity: tableType === 'archive' ? 0.65 : 1 }}>
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
