'use client';

import { useEffect, useState, useRef } from 'react';

function TelegramLoginWidget({ botUsername }: { botUsername: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !botUsername) return;
    ref.current.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '14');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    ref.current.appendChild(script);
  }, [botUsername]);
  return <div ref={ref} />;
}
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
  const [botUsername, setBotUsername] = useState('');
  const [loginError, setLoginError] = useState('');

  // Проверяем сессию при загрузке
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.authenticated) setOrganizer(d.organizer);
        if (d.botUsername) setBotUsername(d.botUsername);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Обработчик Telegram Login Widget
  useEffect(() => {
    (window as any).onTelegramAuth = async (user: any) => {
      setLoginError('');
      try {
        const res = await fetch('/api/auth/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(user),
        });
        const data = await res.json();
        if (data.success) {
          setOrganizer(data.organizer);
        } else {
          setLoginError(data.error || 'Ошибка авторизации');
        }
      } catch {
        setLoginError('Ошибка сети');
      }
    };
  }, []);

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

  // Не авторизован — показываем логин
  if (!organizer) {

    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>✨</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--accent-cream)' }}>Панель организатора</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32, maxWidth: 360 }}>
          Войдите через Telegram чтобы управлять мероприятиями
        </p>

        {botUsername ? (
          <TelegramLoginWidget botUsername={botUsername} />
        ) : (
          <div style={{ padding: '16px 24px', background: 'rgba(199,92,92,0.1)', border: '1px solid rgba(199,92,92,0.3)', borderRadius: 12, color: 'var(--accent-error)', fontSize: 13 }}>
            Установите NEXT_PUBLIC_BOT_USERNAME в переменных окружения
          </div>
        )}

        {loginError && (
          <div style={{ marginTop: 16, padding: '10px 20px', background: 'rgba(199,92,92,0.1)', border: '1px solid rgba(199,92,92,0.3)', borderRadius: 10, color: 'var(--accent-error)', fontSize: 13 }}>
            {loginError}
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
