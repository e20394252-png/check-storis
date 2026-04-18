'use client';

import { useEffect, useState, useRef } from 'react';

declare global {
  interface Window { Telegram: any; }
}

type RegistrationStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface EventData {
  id: string;
  title: string;
  description?: string | null;
  date?: string | null;
  location?: string | null;
  repostUrl?: string | null;
}

interface MeData {
  user: { first_name?: string; username?: string };
  registration: {
    status: string;
    eventId: string;
    createdAt: string;
    adminNote?: string | null;
  } | null;
  event: EventData | null;
}

export default function App() {
  const [initData, setInitData] = useState('');
  const [meData, setMeData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Init Telegram WebApp
  useEffect(() => {
    const applyTg = () => {
      const tg = window.Telegram?.WebApp;
      if (!tg) return false;
      tg.expand();
      tg.ready();
      setInitData(tg.initData || '');
      return true;
    };
    if (applyTg()) return;
    const timers = [
      setTimeout(() => applyTg(), 300),
      setTimeout(() => applyTg(), 800),
      setTimeout(() => applyTg(), 1500),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Fetch user status
  useEffect(() => {
    if (!initData) return;
    fetch('/api/me', { headers: { 'x-telegram-init-data': initData } })
      .then(r => r.json())
      .then(data => { setMeData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [initData]);

  const status: RegistrationStatus = meData?.registration
    ? (meData.registration.status as RegistrationStatus)
    : 'none';

  const event = meData?.event;
  const user = meData?.user;

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
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
    if (!selectedImage || !event?.id || !initData) return;
    setUploading(true);
    setUploadError('');
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, eventId: event.id, proofBase64: selectedImage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.error || 'Ошибка при отправке');
      } else {
        setUploadSuccess(true);
        setSelectedImage(null);
        setTimeout(() => {
          fetch('/api/me', { headers: { 'x-telegram-init-data': initData } })
            .then(r => r.json())
            .then(d => { setMeData(d); setUploadSuccess(false); });
        }, 1500);
      }
    } catch {
      setUploadError('Ошибка сети. Попробуй ещё раз.');
    } finally {
      setUploading(false);
    }
  };

  // ── Shared styles ──────────────────────────────────────────────────────────
  const s = {
    page: { minHeight: '100vh', padding: '24px 20px 32px', maxWidth: 480, margin: '0 auto', position: 'relative' as const, zIndex: 1 } as React.CSSProperties,
    title: { fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 6 } as React.CSSProperties,
    subtitle: { fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 } as React.CSSProperties,
    card: { background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '20px', marginBottom: 16, position: 'relative' as const, overflow: 'hidden' as const } as React.CSSProperties,
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(0,229,255,0.2)', borderTopColor: 'var(--neon-cyan)', borderRadius: '50%' }} className="spin" />
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
      </div>
    );
  }

  // ── No event ────────────────────────────────────────────────────────────────
  if (!event) {
    return (
      <div style={s.page}>
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎪</div>
          <div style={s.title}>Мероприятий пока нет</div>
          <div style={{ ...s.subtitle, marginTop: 8 }}>Следи за обновлениями!</div>
        </div>
      </div>
    );
  }

  const uploadProps = {
    selectedImage, uploading, uploadError, uploadSuccess,
    onFileChange: handleFileChange, onUpload: handleUpload,
  };

  // ── APPROVED ───────────────────────────────────────────────────────────────
  if (status === 'approved') {
    return (
      <div style={s.page} className="animate-fade-in">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
          <div style={{ ...s.title, color: 'var(--neon-green)' }}>Ты участник!</div>
          <div style={{ ...s.subtitle, marginTop: 6, fontSize: 15 }}>
            {user?.first_name ? `${user.first_name}, твоя` : 'Твоя'} регистрация подтверждена
          </div>
        </div>
        <div className="approved-banner" style={{ padding: '24px 20px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--neon-green)', letterSpacing: '0.04em', marginBottom: 4 }}>
            РЕГИСТРАЦИЯ ПОДТВЕРЖДЕНА
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ты в официальном списке участников</div>
        </div>
        <div style={s.card}>
          <div style={{ fontSize: 10, color: 'var(--neon-cyan)', letterSpacing: '0.1em', marginBottom: 12, opacity: 0.7 }}>// МЕРОПРИЯТИЕ</div>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 14 }}>{event.title}</div>
          {event.date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>📅</span>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{formatDate(event.date)}</span>
            </div>
          )}
          {event.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>📍</span>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>{event.location}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── PENDING ────────────────────────────────────────────────────────────────
  if (status === 'pending') {
    return (
      <div style={s.page} className="animate-fade-in">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🕐</div>
          <div style={s.title}>Скриншот на проверке</div>
          <div style={{ ...s.subtitle, marginTop: 6 }}>Мы получили твой скриншот и скоро проверим</div>
        </div>
        <div style={{ ...s.card, borderColor: 'rgba(255,200,0,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,200,0,0.12)', border: '1.5px solid rgba(255,200,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>⏳</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--neon-yellow)' }}>На проверке</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Обычно проверка занимает до 24 часов</div>
            </div>
          </div>
        </div>
        <div style={{ ...s.card, marginTop: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            📣 Пока ждёшь — убедись, что твой репост виден в профиле. Если хочешь загрузить другой скриншот — нажми кнопку ниже.
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <ReuploadSection {...uploadProps} label="Загрузить другой скриншот" />
        </div>
      </div>
    );
  }

  // ── REJECTED ───────────────────────────────────────────────────────────────
  if (status === 'rejected') {
    return (
      <div style={s.page} className="animate-fade-in">
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>❌</div>
          <div style={s.title}>Скриншот не прошёл</div>
          <div style={{ ...s.subtitle, marginTop: 6 }}>Загрузи новый и мы проверим снова</div>
        </div>
        <div style={{ ...s.card, borderColor: 'rgba(255,0,128,0.3)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
            <b style={{ color: 'var(--neon-pink)' }}>Возможные причины:</b>
          </div>
          {['Репост не виден в профиле', 'Скриншот нечёткий или обрезан', 'Это не репост нашей публикации'].map(r => (
            <div key={r} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--neon-pink)' }}>•</span> {r}
            </div>
          ))}
          {meData?.registration?.adminNote && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,0,128,0.08)', borderRadius: 8, fontSize: 13, color: 'var(--neon-pink)' }}>
              💬 {meData.registration.adminNote}
            </div>
          )}
        </div>
        {event.repostUrl && (
          <a href={event.repostUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', marginBottom: 16 }}>
            <div className="cyber-btn" style={{ padding: '13px 20px', textAlign: 'center', fontSize: 14 }}>
              🔗 Открыть публикацию для репоста
            </div>
          </a>
        )}
        <ReuploadSection {...uploadProps} label="📸 Загрузить новый скриншот" />
      </div>
    );
  }

  // ── NONE (initial state) ───────────────────────────────────────────────────
  return (
    <div style={s.page} className="animate-fade-in">
      <div style={{ marginBottom: 24 }}>
        {user?.first_name && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
            👋 Привет, <b style={{ color: 'var(--text-primary)' }}>{user.first_name}</b>
          </div>
        )}
        <div style={s.title}>{event.title}</div>
        {event.description && <div style={{ ...s.subtitle, marginTop: 8 }}>{event.description}</div>}
      </div>

      {(event.date || event.location) && (
        <div style={s.card}>
          <div style={{ fontSize: 10, color: 'var(--neon-cyan)', letterSpacing: '0.1em', marginBottom: 12, opacity: 0.7 }}>// ДЕТАЛИ</div>
          {event.date && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 20 }}>📅</span>
              <span style={{ fontSize: 14 }}>{formatDate(event.date)}</span>
            </div>
          )}
          {event.location && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>📍</span>
              <span style={{ fontSize: 14 }}>{event.location}</span>
            </div>
          )}
        </div>
      )}

      <div style={s.card}>
        <div style={{ fontSize: 10, color: 'var(--neon-purple)', letterSpacing: '0.1em', marginBottom: 14, opacity: 0.8 }}>// КАК ПОПАСТЬ</div>
        {[
          { n: '1', text: 'Сделай репост нашей публикации в свой профиль' },
          { n: '2', text: 'Сделай скриншот — чтобы был виден репост' },
          { n: '3', text: 'Загрузи скриншот ниже и жди подтверждения' },
        ].map(step => (
          <div key={step.n} style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'flex-start' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, var(--neon-cyan), var(--neon-purple))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#000', flexShrink: 0 }}>{step.n}</div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', paddingTop: 5, lineHeight: 1.4 }}>{step.text}</div>
          </div>
        ))}
      </div>

      {event.repostUrl && (
        <a href={event.repostUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', marginBottom: 16 }}>
          <div className="cyber-btn" style={{ padding: '14px 20px', textAlign: 'center', fontSize: 14, borderRadius: 12 }}>
            🔗 Открыть публикацию для репоста
          </div>
        </a>
      )}

      <ReuploadSection {...uploadProps} label="📸 Загрузить скриншот репоста" />

      {!initData && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.3)', borderRadius: 10, fontSize: 12, color: 'var(--neon-yellow)', textAlign: 'center' }}>
          ⚠️ Открой приложение через Telegram-бота
        </div>
      )}
    </div>
  );
}

// ── Upload component (manages its own ref internally — React 19 compatible) ──
interface ReuploadProps {
  selectedImage: string | null;
  uploading: boolean;
  uploadError: string;
  uploadSuccess: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpload: () => void;
  label: string;
}

function ReuploadSection({ selectedImage, uploading, uploadError, uploadSuccess, onFileChange, onUpload, label }: ReuploadProps) {
  // Create ref internally — avoids React 19 ref prop typing issues
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerPick = () => inputRef.current?.click();

  return (
    <div>
      {/* Hidden file input — ref via callback to be React 19 compatible */}
      <input
        ref={(el) => { inputRef.current = el; }}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={onFileChange}
      />

      {!selectedImage ? (
        <div className="upload-zone" onClick={triggerPick} style={{ padding: '32px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Нажми, чтобы выбрать фото</div>
        </div>
      ) : (
        <div>
          <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
            <img
              src={selectedImage}
              alt="Preview"
              style={{ width: '100%', maxHeight: 300, objectFit: 'contain', display: 'block', background: '#0a0a1a' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={triggerPick}
              style={{ flex: 1, padding: '11px', fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              Другой файл
            </button>
            <button
              onClick={onUpload}
              disabled={uploading}
              className="cyber-btn-primary"
              style={{ flex: 2, padding: '11px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {uploading ? (
                <>
                  <span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', display: 'inline-block' }} className="spin" />
                  Отправляем...
                </>
              ) : uploadSuccess ? '✅ Отправлено!' : '✅ Отправить'}
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
    </div>
  );
}
