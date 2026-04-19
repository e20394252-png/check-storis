'use client';

import { useEffect, useState, useRef } from 'react';

declare global {
  interface Window { Telegram: any; }
}

type RegStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface EventItem {
  id: string;
  title: string;
  description?: string | null;
  date?: string | null;
  location?: string | null;
  repostUrl?: string | null;
  registration: { status: string; createdAt: string; adminNote?: string | null } | null;
}

interface MeData {
  user: { first_name?: string | null; username?: string | null };
  events: EventItem[];
}

const formatDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

const statusMeta: Record<RegStatus, { icon: string; label: string; color: string }> = {
  none:     { icon: '📸', label: 'Зарегистрироваться', color: 'var(--neon-cyan)' },
  pending:  { icon: '⏳', label: 'На проверке',        color: 'var(--neon-yellow)' },
  approved: { icon: '✅', label: 'Одобрено',           color: 'var(--neon-green)' },
  rejected: { icon: '❌', label: 'Отклонено',          color: 'var(--neon-pink)' },
};

export default function App() {
  const [initData, setInitData] = useState('');
  const [meData, setMeData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEventId, setActiveEventId] = useState<string | null>(null); // which event is open for upload

  // Upload state per event
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  useEffect(() => {
    const applyTg = () => {
      const tg = window.Telegram?.WebApp;
      if (!tg) return false;
      tg.expand(); tg.ready();
      setInitData(tg.initData || '');
      return true;
    };
    if (applyTg()) return;
    const timers = [setTimeout(() => applyTg(), 300), setTimeout(() => applyTg(), 800), setTimeout(() => applyTg(), 1500)];
    return () => timers.forEach(clearTimeout);
  }, []);

  const refreshMe = () => {
    if (!initData) return;
    fetch('/api/me', { headers: { 'x-telegram-init-data': initData } })
      .then(r => r.json())
      .then(d => { setMeData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { if (initData) refreshMe(); }, [initData]);

  const openUpload = (eventId: string) => {
    setActiveEventId(eventId);
    setSelectedImage(null);
    setUploadError('');
    setUploadSuccess(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    const reader = new FileReader();
    reader.onload = () => setSelectedImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedImage || !activeEventId || !initData) return;
    setUploading(true); setUploadError('');
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, eventId: activeEventId, proofBase64: selectedImage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Ошибка при отправке');
      } else {
        setUploadSuccess(true);
        setSelectedImage(null);
        setTimeout(() => { refreshMe(); setUploadSuccess(false); setActiveEventId(null); }, 1800);
      }
    } catch {
      setUploadError('Ошибка сети. Попробуй ещё раз.');
    } finally {
      setUploading(false);
    }
  };

  const s = {
    page: { minHeight: '100vh', padding: '20px 20px 40px', maxWidth: 520, margin: '0 auto', position: 'relative' as const, zIndex: 1 } as React.CSSProperties,
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '18px 20px', marginBottom: 14, position: 'relative' as const, overflow: 'hidden' as const } as React.CSSProperties,
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(0,229,255,0.2)', borderTopColor: 'var(--neon-cyan)', borderRadius: '50%' }} className="spin" />
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
      </div>
    );
  }

  const events = meData?.events || [];
  const user = meData?.user;

  if (events.length === 0) {
    return (
      <div style={s.page}>
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎪</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Мероприятий пока нет</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Следи за обновлениями!</div>
        </div>
      </div>
    );
  }

  // Upload form modal (inline, shown below the chosen event card)
  const UploadForm = ({ eventId }: { eventId: string }) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    return (
      <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
        <input ref={el => { inputRef.current = el; }} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        {!selectedImage ? (
          <div className="upload-zone" onClick={() => inputRef.current?.click()} style={{ padding: '22px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Загрузить скриншот репоста</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Нажми, чтобы выбрать фото</div>
          </div>
        ) : (
          <div>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
              <img src={selectedImage} alt="Preview" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', display: 'block', background: '#0a0a1a' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => inputRef.current?.click()}
                style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>
                Другой файл
              </button>
              <button onClick={handleUpload} disabled={uploading} className="cyber-btn-primary"
                style={{ flex: 2, padding: '10px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {uploading
                  ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', display: 'inline-block' }} className="spin" />Отправляем...</>
                  : uploadSuccess ? '✅ Отправлено!' : '✅ Отправить'}
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(255,0,128,0.1)', border: '1px solid rgba(255,0,128,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--neon-pink)' }}>
            ❌ {uploadError}
          </div>
        )}
        {uploadSuccess && (
          <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--neon-green)' }}>
            ✅ Скриншот отправлен! Ожидайте проверки.
          </div>
        )}

        <button onClick={() => { setActiveEventId(null); setSelectedImage(null); }}
          style={{ width: '100%', marginTop: 10, padding: '9px', fontSize: 12, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          Отмена
        </button>
      </div>
    );
  };

  return (
    <div style={s.page} className="animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: 22 }}>
        {user?.first_name && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>
            👋 Привет, <b style={{ color: 'var(--text-primary)' }}>{user.first_name}</b>
          </div>
        )}
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
          Мероприятия
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>
          Выбери мероприятие и зарегистрируйся
        </div>
      </div>

      {/* Event list */}
      {events.map(ev => {
        const reg = ev.registration;
        const regStatus = (reg ? reg.status : 'none') as RegStatus;
        const meta = statusMeta[regStatus];
        const isOpen = activeEventId === ev.id;

        return (
          <div key={ev.id} style={{
            ...s.card,
            borderColor: regStatus === 'approved'
              ? 'rgba(0,255,136,0.3)'
              : regStatus === 'pending'
                ? 'rgba(255,200,0,0.25)'
                : regStatus === 'rejected'
                  ? 'rgba(255,0,128,0.2)'
                  : 'var(--border-subtle)',
          }}>
            {/* Status badge */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2, flex: 1, paddingRight: 10 }}>{ev.title}</div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                background: regStatus === 'approved' ? 'rgba(0,255,136,0.12)' : regStatus === 'pending' ? 'rgba(255,200,0,0.12)' : regStatus === 'rejected' ? 'rgba(255,0,128,0.1)' : 'rgba(0,229,255,0.08)',
                color: meta.color, border: `1px solid ${meta.color}40`,
              }}>{meta.icon} {meta.label.toUpperCase()}</span>
            </div>

            {ev.description && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{ev.description}</div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              {ev.date && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📅 {formatDate(ev.date)}</span>}
              {ev.location && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📍 {ev.location}</span>}
            </div>

            {regStatus === 'approved' && (
              <div className="approved-banner" style={{ padding: '12px 16px', textAlign: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--neon-green)', letterSpacing: '0.04em' }}>✅ ТЫ В СПИСКЕ УЧАСТНИКОВ</div>
              </div>
            )}

            {regStatus === 'rejected' && (
              <div style={{ padding: '10px 14px', background: 'rgba(255,0,128,0.07)', borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--neon-pink)' }}>
                ❌ Скриншот не прошёл{reg?.adminNote ? `: ${reg.adminNote}` : ''}
              </div>
            )}

            {ev.repostUrl && (regStatus === 'none' || regStatus === 'rejected') && (
              <a href={ev.repostUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', marginBottom: 10 }}>
                <div className="cyber-btn" style={{ padding: '11px 16px', textAlign: 'center', fontSize: 13 }}>
                  🔗 Открыть публикацию для репоста
                </div>
              </a>
            )}

            {/* Action button */}
            {(regStatus === 'none' || regStatus === 'rejected') && !isOpen && (
              <button onClick={() => openUpload(ev.id)} className="cyber-btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                📸 {regStatus === 'rejected' ? 'Загрузить новый скриншот' : 'Загрузить скриншот репоста'}
              </button>
            )}

            {isOpen && <UploadForm eventId={ev.id} />}
          </div>
        );
      })}

      {!initData && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 10, fontSize: 12, color: 'var(--neon-yellow)', textAlign: 'center' }}>
          ⚠️ Открой приложение через Telegram-бота
        </div>
      )}
    </div>
  );
}
