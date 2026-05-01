'use client';

import { useEffect, useState, useRef } from 'react';
import AdminClient from './AdminClient';

interface OrganizerInfo {
  id: string;
  first_name?: string | null;
  username?: string | null;
  photo_url?: string | null;
  status: string;
  isSuperAdmin: boolean;
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [organizer, setOrganizer] = useState<OrganizerInfo | null>(null);
  const [loginState, setLoginState] = useState<'idle' | 'waiting' | 'error'>('idle');
  const [loginToken, setLoginToken] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Проверяем сессию при загрузке
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.authenticated) setOrganizer(d.organizer);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Polling для проверки токена
  useEffect(() => {
    if (!loginToken) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/check-token?token=${loginToken}`);
        const data = await res.json();
        if (data.status === 'verified') {
          // Сессия создана на сервере, перезагружаем чтобы подхватить
          clearInterval(pollRef.current!);
          setLoginToken('');
          // Перезапрашиваем /me
          const meRes = await fetch('/api/auth/me');
          const me = await meRes.json();
          if (me.authenticated) setOrganizer(me.organizer);
          else window.location.reload();
        } else if (data.status === 'expired') {
          clearInterval(pollRef.current!);
          setLoginState('error');
          setLoginToken('');
        }
      } catch { /* ignore */ }
    }, 2000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loginToken]);

  const startLogin = async () => {
    setLoginState('waiting');
    try {
      const res = await fetch('/api/auth/start-login', { method: 'POST' });
      const data = await res.json();
      if (data.botLink && data.token) {
        setLoginToken(data.token);
        window.open(data.botLink, '_blank');
      } else {
        setLoginState('error');
      }
    } catch {
      setLoginState('error');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/telegram', { method: 'DELETE' });
    setOrganizer(null);
  };

  // Загрузка
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(200,168,110,0.2)', borderTopColor: 'var(--accent-gold)', borderRadius: '50%' }} className="spin" />
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
      </div>
    );
  }

  // Не авторизован — показываем логин через бота
  if (!organizer) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>✨</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--accent-cream)' }}>Панель организатора</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32, maxWidth: 360 }}>
          Войдите через Telegram-бота чтобы управлять мероприятиями
        </p>

        {loginState === 'idle' && (
          <button onClick={startLogin} style={{
            padding: '14px 36px', fontSize: 16, fontWeight: 700, borderRadius: 14, cursor: 'pointer',
            background: 'linear-gradient(135deg, #3390ec, #2b7cd3)', border: 'none', color: '#fff',
            display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 20px rgba(51,144,236,0.3)',
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseOver={e => { (e.target as any).style.transform = 'scale(1.03)'; }}
          onMouseOut={e => { (e.target as any).style.transform = 'scale(1)'; }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
            Войти через Telegram
          </button>
        )}

        {loginState === 'waiting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(200,168,110,0.2)', borderTopColor: 'var(--accent-gold)', borderRadius: '50%' }} className="spin" />
            <div style={{ fontSize: 14, color: 'var(--accent-cream)', fontWeight: 600 }}>Ожидаем подтверждение в боте...</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 320 }}>
              Откройте бота в Telegram и нажмите <b>Start</b>. Если окно не открылось — <a href="#" onClick={e => { e.preventDefault(); startLogin(); }} style={{ color: 'var(--accent-gold)' }}>попробуйте ещё раз</a>
            </div>
          </div>
        )}

        {loginState === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: '12px 24px', background: 'rgba(199,92,92,0.1)', border: '1px solid rgba(199,92,92,0.3)', borderRadius: 12, color: 'var(--accent-error)', fontSize: 13 }}>
              Ссылка устарела или произошла ошибка
            </div>
            <button onClick={() => { setLoginState('idle'); }} style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 600, borderRadius: 10, cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
            }}>
              Попробовать снова
            </button>
          </div>
        )}
      </div>
    );
  }

  // Ожидает аппрува
  if (organizer.status === 'PENDING') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>⏳</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: 'var(--accent-cream)' }}>Заявка на рассмотрении</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 8, maxWidth: 400 }}>
          Привет, <b style={{ color: 'var(--accent-gold)' }}>{organizer.first_name || organizer.username}</b>! Ваша заявка на доступ к панели организатора отправлена администратору.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 32 }}>
          Мы уведомим вас когда заявка будет одобрена.
        </p>
        <button onClick={handleLogout} style={{ padding: '10px 24px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
          Выйти
        </button>
      </div>
    );
  }

  // Отклонён
  if (organizer.status === 'REJECTED') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>🚫</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: 'var(--accent-error)' }}>Доступ отклонён</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>
          К сожалению, ваша заявка была отклонена.
        </p>
        <button onClick={handleLogout} style={{ padding: '10px 24px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
          Выйти
        </button>
      </div>
    );
  }

  // Авторизован и одобрен
  return <AdminClient organizer={organizer} onLogout={handleLogout} />;
}
