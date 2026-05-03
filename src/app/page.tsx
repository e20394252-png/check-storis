'use client';

import { useEffect, useState, useRef } from 'react';

declare global { interface Window { Telegram: any; } }

type RegStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface EventItem {
  id: string; title: string; description?: string|null; date?: string|null;
  location?: string|null; repostUrl?: string|null; imageUrl?: string|null;
  price?: number|null; discountPrice?: number|null;
  registration: { status: string; createdAt: string; adminNote?: string|null } | null;
}

interface MeData {
  user: { first_name?: string|null; username?: string|null };
  events: EventItem[];
}

const formatDate = (d?: string|null) =>
  d ? new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

// Telegram-style rich text: **bold** __italic__ ~~strike~~ `code` [text](url)
function renderRichText(text: string) {
  const escaped = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, '<br/>');
  return <span className="rich-text" dangerouslySetInnerHTML={{ __html: escaped }} />;
}

const statusMeta: Record<RegStatus, { icon: string; label: string; color: string }> = {
  none:     { icon: '📸', label: 'Зарегистрироваться', color: 'var(--accent-gold)' },
  pending:  { icon: '⏳', label: 'На проверке',        color: 'var(--accent-warning)' },
  approved: { icon: '✅', label: 'Одобрено',           color: 'var(--accent-success)' },
  rejected: { icon: '❌', label: 'Отклонено',          color: 'var(--accent-error)' },
};

export default function App() {
  const [initData, setInitData] = useState('');
  const [meData, setMeData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEventId, setActiveEventId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [storyUrl, setStoryUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'current' | 'past'>('current');

  useEffect(() => {
    const applyTg = () => {
      const tg = window.Telegram?.WebApp;
      if (!tg) return false;
      tg.expand(); tg.ready();
      setInitData(tg.initData || '');
      return true;
    };
    if (applyTg()) return;
    const timers = [
      setTimeout(() => applyTg(), 300),
      setTimeout(() => applyTg(), 800),
      setTimeout(() => applyTg(), 1500),
      setTimeout(() => setLoading(false), 2000), // fallback: снять загрузку через 2с
    ];
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
    setActiveEventId(eventId); setSelectedImage(null);
    setUploadError(''); setUploadSuccess(false); setStoryUrl('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
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
        body: JSON.stringify({ initData, eventId: activeEventId, proofBase64: selectedImage, storyUrl: storyUrl || null }),
      });
      const data = await res.json();
      if (!res.ok) { setUploadError(data.error || 'Ошибка при отправке'); }
      else {
        setUploadSuccess(true); setSelectedImage(null);
        setTimeout(() => { refreshMe(); setUploadSuccess(false); setActiveEventId(null); }, 1800);
      }
    } catch { setUploadError('Ошибка сети. Попробуй ещё раз.'); }
    finally { setUploading(false); }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(200,168,110,0.2)', borderTopColor: 'var(--accent-gold)', borderRadius: '50%' }} className="spin" />
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
      </div>
    );
  }

  const events = meData?.events || [];
  const user = meData?.user;
  const now = new Date();
  const currentEvents = events.filter(ev => !ev.date || new Date(ev.date) >= now);
  const pastEvents = events.filter(ev => ev.date && new Date(ev.date) < now);
  const displayEvents = activeTab === 'current' ? currentEvents : pastEvents;

  if (events.length === 0) {
    return (
      <div style={{ minHeight: '100vh', padding: '20px 20px 40px', maxWidth: 520, margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--accent-cream)' }}>Мероприятий пока нет</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Следи за обновлениями!</div>
        </div>
      </div>
    );
  }

  const handlePayment = async (ev: EventItem, type: 'full' | 'discount') => {
    const priceValue = type === 'full' ? ev.price : ev.discountPrice;
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
    try {
      const res = await fetch('/api/payment/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
        body: JSON.stringify({
          eventId: ev.id,
          eventTitle: ev.title,
          price: priceValue,
          type,
          telegram_id: tgUser?.id?.toString() || '',
          user: { first_name: tgUser?.first_name || meData?.user?.first_name || '', username: tgUser?.username || meData?.user?.username || '' },
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Открываем бот с deep link — пользователь отправит /start pay → ЛидТех запустит сценарий
        const botUsername = process.env.NEXT_PUBLIC_BOT_USERNAME || 'check_storis_bot';
        window.Telegram?.WebApp?.openTelegramLink?.(`https://t.me/${botUsername}`);
        window.Telegram?.WebApp?.close?.();
      } else {
        alert('Ошибка: ' + (data.error || 'неизвестная'));
      }
    } catch {
      alert('Ошибка при отправке заявки');
    }
  };

  const UploadForm = ({ eventId }: { eventId: string }) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    return (
      <div style={{ marginTop: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
        <input ref={el => { inputRef.current = el; }} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        {/* Поле для ссылки на сторис */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>🔗 Ссылка на вашу сторис (необязательно)</label>
          <input value={storyUrl} onChange={e => setStoryUrl(e.target.value)} placeholder="https://t.me/..." style={{ width: '100%', padding: '10px 14px', background: 'rgba(200,168,110,0.05)', border: '1px solid rgba(200,168,110,0.18)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none' }} />
        </div>

        {!selectedImage ? (
          <div className="upload-zone" onClick={() => inputRef.current?.click()} style={{ padding: '22px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📸</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Загрузить скриншот репоста</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Нажми, чтобы выбрать фото</div>
          </div>
        ) : (
          <div>
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
              <img src={selectedImage} alt="Preview" style={{ width: '100%', maxHeight: 240, objectFit: 'contain', display: 'block', background: 'var(--bg-primary)' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => inputRef.current?.click()} style={{ flex: 1, padding: '10px', fontSize: 13, fontWeight: 600, background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer' }}>Другой файл</button>
              <button onClick={handleUpload} disabled={uploading} className="warm-btn-primary" style={{ flex: 2, padding: '10px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {uploading ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.3)', borderTopColor: '#000', borderRadius: '50%', display: 'inline-block' }} className="spin" />Отправляем...</> : uploadSuccess ? '✅ Отправлено!' : '✅ Отправить'}
              </button>
            </div>
          </div>
        )}

        {uploadError && <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(199,92,92,0.1)', border: '1px solid rgba(199,92,92,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--accent-error)' }}>❌ {uploadError}</div>}
        {uploadSuccess && <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(143,188,106,0.1)', border: '1px solid rgba(143,188,106,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--accent-success)' }}>✅ Скриншот отправлен! Ожидайте проверки.</div>}

        <button onClick={() => { setActiveEventId(null); setSelectedImage(null); }} style={{ width: '100%', marginTop: 10, padding: '9px', fontSize: 12, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Отмена</button>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', padding: '20px 20px 40px', maxWidth: 520, margin: '0 auto', position: 'relative', zIndex: 1 }} className="animate-fade-in">
      {/* Шапка */}
      <div style={{ marginBottom: 18 }}>
        {user?.first_name && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>👋 Привет, <b style={{ color: 'var(--accent-cream)' }}>{user.first_name}</b></div>}
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--accent-cream)' }}>Мероприятия</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>Выбери мероприятие и зарегистрируйся</div>
      </div>

      {/* Табы: Актуальные / Прошедшие */}
      <div className="tab-bar" style={{ marginBottom: 18 }}>
        <button className={`tab-bar-item ${activeTab === 'current' ? 'active' : ''}`} onClick={() => setActiveTab('current')}>Актуальные ({currentEvents.length})</button>
        <button className={`tab-bar-item ${activeTab === 'past' ? 'active' : ''}`} onClick={() => setActiveTab('past')}>Прошедшие ({pastEvents.length})</button>
      </div>

      {displayEvents.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>{activeTab === 'current' ? '🎪' : '📂'}</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-muted)' }}>{activeTab === 'current' ? 'Нет актуальных мероприятий' : 'Нет прошедших мероприятий'}</div>
        </div>
      )}

      {/* Список мероприятий */}
      {displayEvents.map(ev => {
        const reg = ev.registration;
        const regStatus = (reg ? reg.status : 'none') as RegStatus;
        const meta = statusMeta[regStatus];
        const isOpen = activeEventId === ev.id;
        const isPast = activeTab === 'past';

        return (
          <div key={ev.id} style={{
            background: 'var(--bg-card)', border: '1px solid', borderRadius: 16, padding: '18px 20px', marginBottom: 14, position: 'relative', overflow: 'hidden', opacity: isPast ? 0.7 : 1,
            borderColor: regStatus === 'approved' ? 'rgba(143,188,106,0.3)' : regStatus === 'pending' ? 'rgba(212,168,83,0.25)' : regStatus === 'rejected' ? 'rgba(199,92,92,0.2)' : 'var(--border-subtle)',
          }}>
            {/* Картинка мероприятия */}
            {ev.imageUrl && <img src={ev.imageUrl} alt="" className="event-image" />}

            {/* Заголовок + статус */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2, flex: 1, paddingRight: 10, color: 'var(--accent-cream)' }}>{ev.title}</div>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                background: regStatus === 'approved' ? 'rgba(143,188,106,0.12)' : regStatus === 'pending' ? 'rgba(212,168,83,0.12)' : regStatus === 'rejected' ? 'rgba(199,92,92,0.1)' : 'rgba(200,168,110,0.08)',
                color: meta.color, border: `1px solid ${meta.color}40`,
              }}>{meta.icon} {meta.label.toUpperCase()}</span>
            </div>

            {ev.description && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{renderRichText(ev.description)}</div>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
              {ev.date && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📅 {formatDate(ev.date)}</span>}
              {ev.location && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📍 {ev.location}</span>}
            </div>

            {regStatus === 'approved' && (
              <div className="approved-banner" style={{ padding: '12px 16px', textAlign: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--accent-success)', letterSpacing: '0.04em' }}>✅ ТЫ В СПИСКЕ УЧАСТНИКОВ</div>
              </div>
            )}

            {regStatus === 'rejected' && (
              <div style={{ padding: '10px 14px', background: 'rgba(199,92,92,0.07)', borderRadius: 8, marginBottom: 10, fontSize: 12, color: 'var(--accent-error)' }}>
                ❌ Скриншот не прошёл{reg?.adminNote ? `: ${reg.adminNote}` : ''}
              </div>
            )}

            {/* Кнопки оплаты */}
            {(ev.price || ev.discountPrice) && !isPast && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                {ev.price && (
                  <button onClick={() => handlePayment(ev, 'full')} className="warm-btn-primary" style={{ flex: 1, padding: '13px 10px', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 18 }}>{ev.price} ₽</span>
                    <span style={{ fontSize: 11, opacity: 0.8 }}>Оплатить</span>
                  </button>
                )}
                {ev.discountPrice && (
                  <button
                    onClick={() => regStatus === 'approved' ? handlePayment(ev, 'discount') : null}
                    disabled={regStatus !== 'approved'}
                    style={{
                      flex: 1, padding: '13px 10px', fontSize: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      borderRadius: 12, border: '1px solid', cursor: regStatus === 'approved' ? 'pointer' : 'not-allowed',
                      background: regStatus === 'approved' ? 'linear-gradient(135deg, rgba(143,188,106,0.15), rgba(143,188,106,0.08))' : 'rgba(200,168,110,0.04)',
                      borderColor: regStatus === 'approved' ? 'rgba(143,188,106,0.4)' : 'rgba(200,168,110,0.12)',
                      color: regStatus === 'approved' ? 'var(--accent-success)' : 'var(--text-muted)',
                      opacity: regStatus === 'approved' ? 1 : 0.5,
                      fontWeight: 700,
                    }}
                  >
                    <span style={{ fontWeight: 800, fontSize: 18, textDecoration: regStatus !== 'approved' ? 'line-through' : 'none' }}>{ev.discountPrice} ₽</span>
                    <span style={{ fontSize: 11, opacity: 0.8 }}>{regStatus === 'approved' ? 'Оплатить со скидкой' : '🔒 Сделай репост'}</span>
                  </button>
                )}
              </div>
            )}

            {ev.repostUrl && (regStatus === 'none' || regStatus === 'rejected') && !isPast && (
              <a href={ev.repostUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', marginBottom: 10 }}>
                <div className="warm-btn" style={{ padding: '11px 16px', textAlign: 'center', fontSize: 13 }}>🔗 Открыть публикацию для репоста</div>
              </a>
            )}

            {!isPast && (regStatus === 'none' || regStatus === 'rejected') && !isOpen && (
              <button onClick={() => openUpload(ev.id)} className="warm-btn-primary" style={{ width: '100%', padding: '12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                📸 {regStatus === 'rejected' ? 'Загрузить новый скриншот' : 'Загрузить скриншот репоста'}
              </button>
            )}

            {isOpen && <UploadForm eventId={ev.id} />}
          </div>
        );
      })}

      {!initData && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.3)', borderRadius: 10, fontSize: 12, color: 'var(--accent-warning)', textAlign: 'center' }}>
          ⚠️ Открой приложение через Telegram-бота
        </div>
      )}
    </div>
  );
}
