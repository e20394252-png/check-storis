'use client';

import { useEffect, useState } from 'react';

export const PALETTES = [
  { id: 'sand', label: 'Песок', hint: 'золото / беж' },
  { id: 'indigo', label: 'Индиго', hint: 'синий / белый' },
  { id: 'emerald', label: 'Изумруд', hint: 'зелёный' },
  { id: 'mono', label: 'Моно', hint: 'коралл' },
] as const;

export type PaletteId = (typeof PALETTES)[number]['id'];

export function applyPalette(id: PaletteId) {
  document.documentElement.setAttribute('data-palette', id);
  try {
    localStorage.setItem('cs-palette', id);
  } catch {
    /* ignore */
  }
}

export function readPalette(): PaletteId {
  try {
    const saved = localStorage.getItem('cs-palette') as PaletteId | null;
    if (saved && PALETTES.some((p) => p.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'sand';
}

/** Компактный переключатель палитры (по умолчанию sand). */
export default function PaletteSwitcher({ compact = false }: { compact?: boolean }) {
  const [palette, setPalette] = useState<PaletteId>('sand');

  useEffect(() => {
    const initial = readPalette();
    setPalette(initial);
    applyPalette(initial);
  }, []);

  const onPick = (id: PaletteId) => {
    setPalette(id);
    applyPalette(id);
  };

  return (
    <div
      style={{
        marginTop: compact ? 0 : 16,
        padding: compact ? '10px 12px' : '14px 16px',
        borderRadius: 12,
        border: '1.5px solid var(--border-subtle)',
        background: 'var(--bg-card)',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text-muted)',
          marginBottom: 10,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        Цветовая схема
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {PALETTES.map((p) => {
          const on = palette === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick(p.id)}
              style={{
                minHeight: 44,
                padding: '10px 12px',
                borderRadius: 10,
                border: on ? '2px solid var(--accent-gold)' : '1.5px solid var(--border-subtle)',
                background: on ? 'rgba(200,168,110,0.12)' : 'var(--bg-primary)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800 }}>{p.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.hint}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
