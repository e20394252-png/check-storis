'use client';

import { useEffect, useState, useRef } from 'react';

declare global { interface Window { Telegram: any; } }

type RegStatus = 'none' | 'pending' | 'approved' | 'rejected';

interface EventItem {
  id: string; title: string; description?: string|null; date?: string|null;
  location?: string|null; repostUrl?: string|null; imageUrl?: string|null;
  price?: number|null; discountPrice?: number|null;
  isPaidRepost?: boolean; repostRewardUsdt?: number|null;
  repostsNeeded?: number|null; repostsFilled?: number;
  campaignStatus?: string|null;
  registration: { status: string; createdAt: string; adminNote?: string|null; paidAmount?: number|null } | null;
}

interface WalletData {
  balance: number; balanceRub: number;
  totalEarned: number; totalPaid: number;
  history: Array<{ type: string; amount: number; amountRub: number; title?: string; status?: string; date: string }>;
}

interface MeData {
  user: { first_name?: string|null; username?: string|null };
  wallet?: { balance: number; totalEarned: number; totalPaid: number } | null;
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
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'events'|'profile'>('events');
  const [walletData, setWalletData] = useState<WalletData|null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState('');

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

  const loadWallet = () => {
    if (!initData) return;
    setWalletLoading(true);
    fetch('/api/wallet/me', { headers: { 'x-telegram-init-data': initData } })
      .then(r => r.json())
      .then(d => { setWalletData(d); setWalletLoading(false); })
      .catch(() => setWalletLoading(false));
  };

  useEffect(() => { if (activeTab === 'profile' && initData) loadWallet(); }, [activeTab, initData]);

  const handleWithdraw = async () => {
    if (!walletData || walletData.balance <= 0) return;
    const amount = prompt(`Сколько USDT вывести? (доступно: ${walletData.balance})`);
    if (!amount || Number(amount) <= 0) return;
    setWithdrawing(true); setWithdrawMsg('');
    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-telegram-init-data': initData },
        body: JSON.stringify({ amount: Number(amount) }),
      });
      const data = await res.json();
      if (data.success) {
        setWithdrawMsg(`✅ ${amount} USDT отправлено на ваш CryptoBot!`);
        loadWallet();
      } else {
        setWithdrawMsg(`❌ ${data.error || 'Ошибка вывода'}`);
      }
    } catch { setWithdrawMsg('❌ Ошибка сети'); }
    setWithdrawing(false);
  };

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
  const nowMs = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const currentEvents = events
    .filter(ev => !ev.date || nowMs - new Date(ev.date).getTime() < DAY)
;
  const archivedEvents = events
    .filter(ev => ev.date && nowMs - new Date(ev.date).getTime() >= DAY)
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());

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
        // Мини-апп закрывается, бот уже отправил ссылку на оплату в чат
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
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>🔗 Ссылка на вашу сторис {meData?.events.find(e => e.id === eventId)?.isPaidRepost ? <span style={{ color:'var(--accent-error)' }}>(обязательно)</span> : '(необязательно)'}</label>
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

  // Profile view
  const ProfileView = () => (
    <div className="animate-fade-in">
      <div style={{ textAlign:'center', marginBottom:24 }}>
        <div style={{ fontSize:40, marginBottom:8 }}>👤</div>
        <div style={{ fontSize:20, fontWeight:800, color:'var(--accent-cream)' }}>{user?.first_name || 'Пользователь'}</div>
        {user?.username && <div style={{ fontSize:13, color:'var(--text-muted)' }}>@{user.username}</div>}
      </div>

      {/* Balance card */}
      <div style={{ background:'linear-gradient(135deg, rgba(212,168,83,0.12), rgba(200,168,110,0.06))', border:'1px solid rgba(212,168,83,0.3)', borderRadius:16, padding:'20px 24px', marginBottom:20, textAlign:'center' }}>
        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:8, fontWeight:600, letterSpacing:'0.06em' }}>💰 БАЛАНС</div>
        <div style={{ fontSize:32, fontWeight:800, color:'var(--accent-cream)', letterSpacing:'-0.02em' }}>
          {walletLoading ? '...' : `${walletData?.balance?.toFixed(2) || '0.00'} USDT`}
        </div>
        {walletData && walletData.balanceRub > 0 && (
          <div style={{ fontSize:13, color:'var(--text-muted)', marginTop:4 }}>≈ {walletData.balanceRub.toLocaleString()} ₽</div>
        )}
        <button onClick={handleWithdraw} disabled={withdrawing || !walletData || walletData.balance <= 0}
          className="warm-btn-primary" style={{ marginTop:16, padding:'12px 32px', fontSize:14, opacity: (!walletData || walletData.balance <= 0) ? 0.5 : 1 }}>
          {withdrawing ? 'Выводим...' : '🏧 Вывести на CryptoBot'}
        </button>
        {withdrawMsg && (
          <div style={{ marginTop:12, padding:'10px 14px', borderRadius:8, fontSize:12, background: withdrawMsg.startsWith('✅') ? 'rgba(143,188,106,0.1)' : 'rgba(199,92,92,0.1)', color: withdrawMsg.startsWith('✅') ? 'var(--accent-success)' : 'var(--accent-error)' }}>
            {withdrawMsg}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>Заработано</div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--accent-success)' }}>{walletData?.totalEarned?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize:10, color:'var(--text-muted)' }}>USDT</div>
        </div>
        <div style={{ background:'var(--bg-card)', border:'1px solid var(--border-subtle)', borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
          <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:4 }}>Выведено</div>
          <div style={{ fontSize:18, fontWeight:700, color:'var(--accent-gold)' }}>{walletData?.totalPaid?.toFixed(2) || '0.00'}</div>
          <div style={{ fontSize:10, color:'var(--text-muted)' }}>USDT</div>
        </div>
      </div>

      {/* History */}
      <div style={{ fontSize:14, fontWeight:700, color:'var(--accent-cream)', marginBottom:12 }}>📋 История операций</div>
      {(!walletData?.history || walletData.history.length === 0) ? (
        <div style={{ padding:'20px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>Операций пока нет</div>
      ) : (
        walletData.history.map((h, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'var(--bg-card)', border:'1px solid var(--border-subtle)', borderRadius:10, marginBottom:8 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:600, color: h.type === 'earn' ? 'var(--accent-success)' : 'var(--accent-gold)' }}>
                {h.type === 'earn' ? `✅ +${h.amount} USDT` : `🏧 -${h.amount} USDT`}
              </div>
              <div style={{ fontSize:11, color:'var(--text-muted)', marginTop:2 }}>
                {h.type === 'earn' ? h.title : (h.status === 'completed' ? 'Вывод выполнен' : h.status === 'failed' ? 'Ошибка вывода' : 'В обработке')}
              </div>
            </div>
            <div style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date(h.date).toLocaleDateString('ru-RU')}</div>
          </div>
        ))
      )}

      {/* CryptoBot hint */}
      <div style={{ marginTop:16, padding:'12px 16px', background:'rgba(212,168,83,0.06)', border:'1px solid rgba(212,168,83,0.15)', borderRadius:10, fontSize:12, color:'var(--text-muted)', textAlign:'center' }}>
        💡 Для вывода средств активируйте <a href="https://t.me/CryptoBot" target="_blank" rel="noopener" style={{ color:'var(--accent-gold)' }}>@CryptoBot</a> в Telegram
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', padding: '20px 20px 80px', maxWidth: 520, margin: '0 auto', position: 'relative', zIndex: 1 }} className="animate-fade-in">
      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, background:'var(--bg-card)', borderRadius:12, padding:4, border:'1px solid var(--border-subtle)', marginBottom:18 }}>
        <button onClick={() => setActiveTab('events')} className={`tab-bar-item ${activeTab==='events' ? 'active' : ''}`}>📋 Мероприятия</button>
        <button onClick={() => setActiveTab('profile')} className={`tab-bar-item ${activeTab==='profile' ? 'active' : ''}`} style={{ position:'relative' }}>
          👤 Кабинет
          {(meData?.wallet?.balance ?? 0) > 0 && <span style={{ position:'absolute', top:4, right:8, width:7, height:7, borderRadius:'50%', background:'var(--accent-success)' }} />}
        </button>
      </div>

      {activeTab === 'profile' ? <ProfileView /> : (
      <>
      {/* Шапка */}
      <div style={{ marginBottom: 18 }}>
        {user?.first_name && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>👋 Привет, <b style={{ color: 'var(--accent-cream)' }}>{user.first_name}</b></div>}
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--accent-cream)' }}>Мероприятия</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 5 }}>Выбери мероприятие и зарегистрируйся</div>
      </div>

      {currentEvents.length === 0 && archivedEvents.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🎪</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-muted)' }}>Нет мероприятий</div>
        </div>
      )}

      {/* Список мероприятий */}
      {currentEvents.map(ev => {
        const reg = ev.registration;
        const regStatus = (reg ? reg.status : 'none') as RegStatus;
        const meta = statusMeta[regStatus];
        const isOpen = activeEventId === ev.id;
        const isPast = false;

        return (
          <div key={ev.id} style={{
            background: 'var(--bg-card)', border: '1px solid', borderRadius: 16, padding: '18px 20px', marginBottom: 14, position: 'relative', overflow: 'hidden', opacity: isPast ? 0.7 : 1,
            borderColor: regStatus === 'approved' ? 'rgba(143,188,106,0.3)' : regStatus === 'pending' ? 'rgba(212,168,83,0.25)' : regStatus === 'rejected' ? 'rgba(199,92,92,0.2)' : 'var(--border-subtle)',
          }}>
            {/* Картинка мероприятия */}
            {ev.imageUrl && <img src={ev.imageUrl} alt="" className="event-image" />}

            {/* Paid repost badge */}
            {ev.isPaidRepost && (
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, padding:'8px 12px', background:'linear-gradient(135deg, rgba(212,168,83,0.1), rgba(143,188,106,0.06))', border:'1px solid rgba(212,168,83,0.25)', borderRadius:10 }}>
                <span style={{ fontSize:16 }}>💰</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent-warm)' }}>{ev.repostRewardUsdt} USDT за репост</div>
                  <div style={{ fontSize:11, color:'var(--text-muted)' }}>Осталось: {(ev.repostsNeeded || 0) - (ev.repostsFilled || 0)} из {ev.repostsNeeded}</div>
                </div>
              </div>
            )}

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

      {/* Архив */}
      {archivedEvents.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setArchiveOpen(!archiveOpen)}
            style={{
              width:'100%', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between',
              background:'rgba(200,168,110,0.04)', border:'1px solid rgba(200,168,110,0.12)', borderRadius:12,
              color:'var(--text-muted)', fontSize:14, fontWeight:600, cursor:'pointer', transition:'all 0.2s'
            }}
          >
            <span>📦 Архив ({archivedEvents.length})</span>
            <span style={{ transform: archiveOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform 0.25s ease', fontSize:16, lineHeight:1 }}>▼</span>
          </button>
          {archiveOpen && (
            <div style={{ marginTop: 14 }}>
              {archivedEvents.map(ev => {
                const reg = ev.registration;
                const regStatus = (reg ? reg.status : 'none') as RegStatus;
                const meta = statusMeta[regStatus];
                return (
                  <div key={ev.id} style={{
                    background: 'var(--bg-card)', border: '1px solid', borderRadius: 16, padding: '18px 20px', marginBottom: 14, position: 'relative', overflow: 'hidden', opacity: 0.7,
                    borderColor: regStatus === 'approved' ? 'rgba(143,188,106,0.3)' : regStatus === 'pending' ? 'rgba(212,168,83,0.25)' : regStatus === 'rejected' ? 'rgba(199,92,92,0.2)' : 'var(--border-subtle)',
                  }}>
                    {ev.imageUrl && <img src={ev.imageUrl} alt="" className="event-image" />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.2, flex: 1, paddingRight: 10, color: 'var(--accent-cream)' }}>{ev.title}</div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
                        background: regStatus === 'approved' ? 'rgba(143,188,106,0.12)' : regStatus === 'pending' ? 'rgba(212,168,83,0.12)' : regStatus === 'rejected' ? 'rgba(199,92,92,0.1)' : 'rgba(200,168,110,0.08)',
                        color: meta.color, border: `1px solid ${meta.color}40`,
                      }}>{meta.icon} {meta.label.toUpperCase()}</span>
                    </div>
                    {ev.description && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{renderRichText(ev.description)}</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {ev.date && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📅 {formatDate(ev.date)}</span>}
                      {ev.location && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>📍 {ev.location}</span>}
                    </div>
                    {regStatus === 'approved' && (
                      <div className="approved-banner" style={{ padding: '12px 16px', textAlign: 'center', marginTop: 10 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--accent-success)', letterSpacing: '0.04em' }}>✅ ТЫ В СПИСКЕ УЧАСТНИКОВ</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!initData && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.3)', borderRadius: 10, fontSize: 12, color: 'var(--accent-warning)', textAlign: 'center' }}>
          ⚠️ Открой приложение через Telegram-бота
        </div>
      )}
      </>)}
    </div>
  );
}
