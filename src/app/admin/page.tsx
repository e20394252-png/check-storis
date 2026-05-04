'use client';

import { useEffect, useState } from 'react';
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
  const [loginState, setLoginState] = useState<'idle' | 'waiting' | 'code' | 'error'>('idle');
  const [telegramIdInput, setTelegramIdInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [loginError, setLoginError] = useState('');

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

  // Не авторизован — показываем логин через код
  if (!organizer) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>✨</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--accent-cream)' }}>Панель организатора</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32, maxWidth: 360 }}>
          Введите ваш Telegram ID для получения кода авторизации
        </p>

        {loginState === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
            <input
              type="text"
              placeholder="Ваш Telegram ID (число)"
              value={telegramIdInput}
              onChange={e => setTelegramIdInput(e.target.value.replace(/\D/g, ''))}
              style={{
                padding: '14px 18px', fontSize: 16, borderRadius: 12, border: '1px solid rgba(200,168,110,0.3)',
                background: 'rgba(200,168,110,0.05)', color: '#f0e6d6', textAlign: 'center', outline: 'none',
              }}
            />
            <button onClick={async () => {
              if (!telegramIdInput) return;
              setLoginState('waiting');
              try {
                const res = await fetch('/api/auth/send-code', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ telegramId: telegramIdInput }),
                });
                const data = await res.json();
                if (data.success) {
                  setLoginState('code');
                } else {
                  setLoginError(data.error || 'Ошибка');
                  setLoginState('error');
                }
              } catch {
                setLoginError('Ошибка сети');
                setLoginState('error');
              }
            }} style={{
              padding: '14px 36px', fontSize: 16, fontWeight: 700, borderRadius: 14, cursor: 'pointer',
              background: 'linear-gradient(135deg, #3390ec, #2b7cd3)', border: 'none', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 4px 20px rgba(51,144,236,0.3)',
            }}>
              📨 Получить код в Telegram
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Узнать свой ID: напишите <a href="https://t.me/userinfobot" target="_blank" style={{ color: 'var(--accent-gold)' }}>@userinfobot</a> в Telegram
            </div>
          </div>
        )}

        {loginState === 'waiting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(200,168,110,0.2)', borderTopColor: 'var(--accent-gold)', borderRadius: '50%' }} className="spin" />
            <div style={{ fontSize: 14, color: 'var(--accent-cream)', fontWeight: 600 }}>Отправляем код...</div>
          </div>
        )}

        {loginState === 'code' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 320 }}>
            <div style={{ fontSize: 14, color: 'var(--accent-cream)', fontWeight: 600, marginBottom: 4 }}>
              ✅ Код отправлен в Telegram!
            </div>
            <input
              type="text"
              placeholder="Введите 6-значный код"
              value={codeInput}
              onChange={e => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{
                padding: '14px 18px', fontSize: 24, fontWeight: 700, borderRadius: 12, letterSpacing: '0.3em',
                border: '1px solid rgba(200,168,110,0.3)', background: 'rgba(200,168,110,0.05)',
                color: '#f0e6d6', textAlign: 'center', outline: 'none',
              }}
            />
            <button onClick={async () => {
              if (codeInput.length !== 6) return;
              try {
                const res = await fetch('/api/auth/send-code', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ code: codeInput }),
                });
                const data = await res.json();
                if (data.success) {
                  setOrganizer(data.organizer);
                } else {
                  setLoginError(data.error || 'Неверный код');
                  setLoginState('error');
                }
              } catch {
                setLoginError('Ошибка сети');
                setLoginState('error');
              }
            }} style={{
              padding: '14px 36px', fontSize: 16, fontWeight: 700, borderRadius: 14, cursor: 'pointer',
              background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-warm))', border: 'none',
              color: '#1a1410', boxShadow: '0 4px 20px rgba(200,168,110,0.3)',
            }}>
              🔑 Войти
            </button>
            <button onClick={() => { setLoginState('idle'); setCodeInput(''); }} style={{
              background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
            }}>
              ← Назад
            </button>
          </div>
        )}

        {loginState === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: '12px 24px', background: 'rgba(199,92,92,0.1)', border: '1px solid rgba(199,92,92,0.3)', borderRadius: 12, color: 'var(--accent-error)', fontSize: 13 }}>
              {loginError}
            </div>
            <button onClick={() => { setLoginState('idle'); setCodeInput(''); setLoginError(''); }} style={{
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
