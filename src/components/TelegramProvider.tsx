'use client';

import { useEffect, useState, ReactNode } from 'react';

export function TelegramProvider({ children }: { children: ReactNode }) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    import('@twa-dev/sdk').then((WebApp) => {
      WebApp.default.ready();
      WebApp.default.expand();
    });
  }, []);

  if (!isMounted) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg-primary)',
        color: 'var(--text-muted)', fontSize: 14,
      }}>
        Загрузка...
      </div>
    );
  }

  return <>{children}</>;
}
