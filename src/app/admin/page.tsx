'use client';

import { useEffect, useState, useRef } from 'react';
import AdminClient from './AdminClient';

interface OrganizerInfo {
  id: string;
  first_name?: string | null;
  username?: string | null;
  login?: string | null;
  photo_url?: string | null;
  status: string;
  isSuperAdmin: boolean;
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [organizer, setOrganizer] = useState<OrganizerInfo | null>(null);
  const [mode, setMode] = useState<'login' | 'register' | 'telegram'>('login');
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [formError, setFormError] = useState('');
  const [formBusy, setFormBusy] = useState(false);

  // Telegram bot auth
  const [tgState, setTgState] = useState<'idle' | 'waiting' | 'error'>('idle');
  const [loginToken, setLoginToken] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Проверяем сессию
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => {
        if (d.authenticated) setOrganizer(d.organizer);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Polling для Telegram auth
  useEffect(() => {
    if (!loginToken) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/check-token?token=${loginToken}`);
        const data = await res.json();
        if (data.status === 'verified') {
          clearInterval(pollRef.current!);
          setLoginToken('');
          const meRes = await fetch('/api/auth/me');
          const me = await meRes.json();
          if (me.authenticated) setOrganizer(me.organizer);
          else window.location.reload();
        } else if (data.status === 'expired') {
          clearInterval(pollRef.current!);
          setTgState('error');
          setLoginToken('');
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loginToken]);

  const startTelegramLogin = async () => {
    setTgState('waiting');
    try {
      const res = await fetch('/api/auth/start-login', { method: 'POST' });
      const data = await res.json();
      if (data.botLink && data.token) {
        setLoginToken(data.token);
        window.open(data.botLink, '_blank');
      } else {
        setTgState('error');
      }
    } catch {
      setTgState('error');
    }
  };

  const handleLogin = async () => {
    if (!loginInput || !passwordInput) return;
    setFormBusy(true); setFormError('');
    try {
      const res = await fetch('/api/auth/login-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginInput, password: passwordInput }),
      });
      const data = await res.json();
      if (data.success) {
        setOrganizer(data.organizer);
      } else {
        setFormError(data.error || 'Ошибка входа');
      }
    } catch {
      setFormError('Ошибка сети');
    }
    setFormBusy(false);
  };

  const handleRegister = async () => {
    if (!loginInput || !passwordInput) return;
    setFormBusy(true); setFormError('');
    try {
      const res = await fetch('/api/auth/register-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: loginInput, password: passwordInput, firstName: nameInput || loginInput }),
      });
      const data = await res.json();
      if (data.success) {
        setOrganizer(data.organizer);
      } else {
        setFormError(data.error || 'Ошибка регистрации');
      }
    } catch {
      setFormError('Ошибка сети');
    }
    setFormBusy(false);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/telegram', { method: 'DELETE' });
    setOrganizer(null);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(200,168,110,0.2)', borderTopColor: 'var(--accent-gold)', borderRadius: '50%' }} className="spin" />
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Загрузка...</div>
      </div>
    );
  }

  // Не авторизован
  if (!organizer) {
    const inputStyle: React.CSSProperties = {
      width: '100%', padding: '12px 16px', fontSize: 15, borderRadius: 10,
      border: '1px solid rgba(200,168,110,0.25)', background: 'rgba(200,168,110,0.05)',
      color: '#f0e6d6', outline: 'none',
    };

    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>✨</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--accent-cream)' }}>Панель организатора</h1>

        {/* ВХОД ПО ЛОГИНУ/ПАРОЛЮ */}
        {(mode === 'login' || mode === 'register') && (
          <div style={{ width: '100%', maxWidth: 340, marginTop: 24 }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20 }}>
              {mode === 'login' ? 'Войдите в аккаунт организатора' : 'Создайте аккаунт организатора'}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {mode === 'register' && (
                <input
                  type="text" placeholder="Ваше имя" value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  style={inputStyle}
                />
              )}
              <input
                type="text" placeholder="Логин" value={loginInput}
                onChange={e => setLoginInput(e.target.value)}
                style={inputStyle}
              />
              <input
                type="password" placeholder="Пароль" value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : handleRegister())}
                style={inputStyle}
              />

              {formError && (
                <div style={{ padding: '10px 14px', background: 'rgba(199,92,92,0.1)', border: '1px solid rgba(199,92,92,0.3)', borderRadius: 8, fontSize: 13, color: 'var(--accent-error)' }}>
                  {formError}
                </div>
              )}

              <button
                disabled={formBusy || !loginInput || !passwordInput}
                onClick={mode === 'login' ? handleLogin : handleRegister}
                style={{
                  padding: '13px', fontSize: 15, fontWeight: 700, borderRadius: 12, cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--accent-gold), var(--accent-warm))', border: 'none',
                  color: '#1a1410', opacity: formBusy ? 0.6 : 1,
                }}
              >
                {formBusy ? '...' : mode === 'login' ? '🔑 Войти' : '📝 Зарегистрироваться'}
              </button>

              <button
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setFormError(''); }}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer', fontSize: 13, marginTop: 4 }}
              >
                {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
              </button>
            </div>

            {/* Разделитель */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' }}>
              <div style={{ flex: 1, height: 1, background: 'rgba(200,168,110,0.15)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>СУПЕРАДМИН</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(200,168,110,0.15)' }} />
            </div>

            {/* Telegram вход */}
            <button onClick={() => setMode('telegram')} style={{
              width: '100%', padding: '11px', fontSize: 13, fontWeight: 600, borderRadius: 10, cursor: 'pointer',
              background: 'linear-gradient(135deg, #3390ec, #2b7cd3)', border: 'none', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
              Войти через Telegram
            </button>
          </div>
        )}

        {/* TELEGRAM AUTH */}
        {mode === 'telegram' && (
          <div style={{ width: '100%', maxWidth: 340, marginTop: 24 }}>
            {tgState === 'idle' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Вход для суперадмина через Telegram-бота</p>
                <button onClick={startTelegramLogin} style={{
                  padding: '13px', fontSize: 15, fontWeight: 700, borderRadius: 12, cursor: 'pointer',
                  background: 'linear-gradient(135deg, #3390ec, #2b7cd3)', border: 'none', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
                  Открыть бота
                </button>
                <button onClick={() => { setMode('login'); setTgState('idle'); }} style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13
                }}>
                  ← Назад к логину
                </button>
              </div>
            )}

            {tgState === 'waiting' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 36, height: 36, border: '3px solid rgba(200,168,110,0.2)', borderTopColor: 'var(--accent-gold)', borderRadius: '50%' }} className="spin" />
                <div style={{ fontSize: 14, color: 'var(--accent-cream)', fontWeight: 600 }}>Ожидаем подтверждение в боте...</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 320 }}>
                  Перейдите в бот и нажмите <b>Start</b>. <a href="#" onClick={e => { e.preventDefault(); startTelegramLogin(); }} style={{ color: 'var(--accent-gold)' }}>Попробовать ещё раз</a>
                </div>
              </div>
            )}

            {tgState === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ padding: '12px 24px', background: 'rgba(199,92,92,0.1)', border: '1px solid rgba(199,92,92,0.3)', borderRadius: 12, color: 'var(--accent-error)', fontSize: 13 }}>
                  Ссылка устарела или произошла ошибка
                </div>
                <button onClick={() => { setTgState('idle'); }} style={{
                  padding: '10px 24px', fontSize: 13, fontWeight: 600, borderRadius: 10, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
                }}>
                  Попробовать снова
                </button>
                <button onClick={() => { setMode('login'); setTgState('idle'); }} style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13
                }}>
                  ← Назад к логину
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // PENDING
  if (organizer.status === 'PENDING') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>⏳</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: 'var(--accent-cream)' }}>Заявка на рассмотрении</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 8, maxWidth: 400 }}>
          Привет, <b style={{ color: 'var(--accent-gold)' }}>{organizer.first_name || organizer.login || organizer.username}</b>! Ваша заявка отправлена администратору.
        </p>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 32 }}>Мы уведомим вас когда заявка будет одобрена.</p>
        <button onClick={handleLogout} style={{ padding: '10px 24px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
          Выйти
        </button>
      </div>
    );
  }

  // REJECTED
  if (organizer.status === 'REJECTED') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>🚫</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: 'var(--accent-error)' }}>Доступ отклонён</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 32 }}>К сожалению, ваша заявка была отклонена.</p>
        <button onClick={handleLogout} style={{ padding: '10px 24px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: 10, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}>
          Выйти
        </button>
      </div>
    );
  }

  return <AdminClient organizer={organizer} onLogout={handleLogout} />;
}
