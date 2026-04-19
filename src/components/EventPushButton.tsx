'use client';
import { useState } from 'react';

interface Props {
  eventId: string;
  adminKey: string;
}

export default function EventPushButton({ eventId, adminKey }: Props) {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<{ sent?: number; failed?: number; error?: string } | null>(null);

  const handlePush = async () => {
    if (!confirm('Разослать объявление об этом мероприятии всем пользователям бота?')) return;
    setState('sending');
    try {
      const res = await fetch(`/api/admin/events/${eventId}/push?key=${adminKey}`, { method: 'POST' });
      const data = await res.json();
      if (data.error) { setResult({ error: data.error }); setState('error'); }
      else { setResult({ sent: data.sent, failed: data.failed }); setState('done'); }
    } catch (e: any) {
      setResult({ error: e.message }); setState('error');
    }
    setTimeout(() => { setState('idle'); setResult(null); }, 5000);
  };

  return (
    <div>
      <button
        onClick={handlePush}
        disabled={state === 'sending'}
        style={{
          padding: '8px 14px', fontSize: 12, fontWeight: 700, borderRadius: 8,
          background: state === 'done' ? 'rgba(0,255,136,0.12)' : state === 'error' ? 'rgba(255,0,128,0.1)' : 'rgba(180,0,255,0.1)',
          border: `1px solid ${state === 'done' ? 'rgba(0,255,136,0.35)' : state === 'error' ? 'rgba(255,0,128,0.35)' : 'rgba(180,0,255,0.35)'}`,
          color: state === 'done' ? '#00ff88' : state === 'error' ? '#ff0080' : '#b400ff',
          cursor: state === 'sending' ? 'wait' : 'pointer', whiteSpace: 'nowrap',
        }}
      >
        {state === 'sending' ? '📤 Рассылка...' : state === 'done' ? `✅ Отправлено ${result?.sent}` : state === 'error' ? '❌ Ошибка' : '📣 Push-рассылка'}
      </button>
      {state === 'done' && result?.failed ? (
        <div style={{ fontSize: 10, color: '#6870a0', marginTop: 4 }}>не доставлено: {result.failed}</div>
      ) : null}
      {state === 'error' && result?.error ? (
        <div style={{ fontSize: 10, color: '#ff0080', marginTop: 4 }}>{result.error}</div>
      ) : null}
    </div>
  );
}
