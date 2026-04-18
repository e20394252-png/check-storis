import { getPrisma } from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { notifyRegistrationApproved, notifyRegistrationRejected } from '@/lib/notify';
import PendingButton from '@/components/PendingButton';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; tab?: string }>;
}) {
  const params = await searchParams;
  const adminSecret = process.env.ADMIN_SECRET || 'checkStoris2026';

  if (params.key !== adminSecret) {
    return (
      <div style={{
        minHeight: '100vh', background: '#050510', color: '#e0e8ff',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: 24, textAlign: 'center',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>Доступ запрещён</h1>
        <p style={{ color: '#6870a0', fontSize: 14 }}>
          Введите ключ в URL: <code style={{ color: '#00e5ff' }}>/admin?key=ВАШ_КЛЮЧ</code>
        </p>
      </div>
    );
  }

  const prisma = getPrisma();
  const key = params.key;
  const activeTab = params.tab || 'pending';

  const [allRegistrations, pendingRegs, event] = await Promise.all([
    prisma.registration.findMany({
      include: { user: true, event: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.registration.findMany({
      where: { status: 'PENDING' },
      include: { user: true, event: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.event.findFirst({ where: { isActive: true } }),
  ]);

  const approvedRegs = allRegistrations.filter((r: any) => r.status === 'APPROVED');
  const rejectedRegs = allRegistrations.filter((r: any) => r.status === 'REJECTED');

  // ── Server Actions ─────────────────────────────────────────────────────────

  async function reviewRegistration(formData: FormData) {
    'use server';
    const prismaInner = getPrisma();
    const registrationId = formData.get('registrationId') as string;
    const action = formData.get('action') as 'approve' | 'reject';
    const adminNote = formData.get('adminNote') as string | null;
    const _key = formData.get('_key') as string;

    const reg = await prismaInner.registration.findUnique({
      where: { id: registrationId },
      include: { user: true, event: true },
    });
    if (!reg) redirect(`/admin?key=${_key}&tab=pending`);

    const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
    await prismaInner.registration.update({
      where: { id: registrationId },
      data: { status: newStatus, adminNote: adminNote || null },
    });

    const telegramId = reg!.user?.telegram_id;
    const username = reg!.user?.username;
    const eventTitle = reg!.event?.title || 'Мероприятие';
    const eventDate = reg!.event?.date
      ? new Date(reg!.event.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;
    const eventLocation = reg!.event?.location;

    if (telegramId) {
      if (action === 'approve') {
        notifyRegistrationApproved(telegramId, eventTitle, eventDate, eventLocation, username).catch(console.error);
      } else {
        notifyRegistrationRejected(telegramId, eventTitle, adminNote, username).catch(console.error);
      }
    }

    revalidatePath('/admin');
    redirect(`/admin?key=${_key}&tab=pending`);
  }

  async function updateEvent(formData: FormData) {
    'use server';
    const prismaInner = getPrisma();
    const _key = formData.get('_key') as string;
    const eventId = formData.get('eventId') as string;

    const dateStr = formData.get('date') as string;
    const date = dateStr ? new Date(dateStr) : null;

    if (eventId) {
      await prismaInner.event.update({
        where: { id: eventId },
        data: {
          title: formData.get('title') as string,
          description: (formData.get('description') as string) || null,
          date,
          location: (formData.get('location') as string) || null,
          repostUrl: (formData.get('repostUrl') as string) || null,
        },
      });
    } else {
      await prismaInner.event.create({
        data: {
          title: formData.get('title') as string,
          description: (formData.get('description') as string) || null,
          date,
          location: (formData.get('location') as string) || null,
          repostUrl: (formData.get('repostUrl') as string) || null,
          isActive: true,
        },
      });
    }

    revalidatePath('/admin');
    redirect(`/admin?key=${_key}&tab=event`);
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const bg = '#050510';
  const card = '#0d0d24';
  const cyan = '#00e5ff';
  const purple = '#b400ff';
  const green = '#00ff88';
  const pink = '#ff0080';
  const yellow = '#ffc800';
  const muted = '#6870a0';

  const th = { padding: '12px 16px', textAlign: 'left' as const, fontWeight: 600, color: muted, letterSpacing: '0.04em', fontSize: 11, textTransform: 'uppercase' as const };
  const td = { padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 13 };
  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)', borderRadius: 8, color: '#e0e8ff', fontSize: 14, outline: 'none' };

  const statusColors: Record<string, { color: string; label: string }> = {
    PENDING:  { color: yellow, label: 'На проверке' },
    APPROVED: { color: green,  label: 'Одобрен' },
    REJECTED: { color: pink,   label: 'Отклонён' },
  };

  const tabBtn = (id: string, label: string, count?: number) => (
    <a key={id} href={`/admin?key=${key}&tab=${id}`} style={{
      padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 8,
      background: activeTab === id ? 'rgba(0,229,255,0.1)' : 'transparent',
      border: activeTab === id ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
      color: activeTab === id ? cyan : muted,
      textDecoration: 'none', display: 'inline-flex', gap: 8, alignItems: 'center',
    }}>
      {label}
      {count !== undefined && (
        <span style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '1px 7px', fontSize: 11 }}>{count}</span>
      )}
    </a>
  );

  return (
    <div style={{ minHeight: '100vh', background: bg, color: '#e0e8ff', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '18px 28px', borderBottom: '1px solid rgba(0,229,255,0.12)', background: 'rgba(5,5,20,0.98)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ fontSize: 10, color: cyan, letterSpacing: '0.1em', opacity: 0.6 }}>// CHECK-STORIS_ADMIN</div>
          <h1 style={{ fontSize: 18, fontWeight: 800 }}>Панель <span style={{ color: cyan }}>модератора</span></h1>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: cyan }}>{pendingRegs.length}</div>
            <div style={{ fontSize: 11, color: muted }}>на проверке</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: green }}>{approvedRegs.length}</div>
            <div style={{ fontSize: 11, color: muted }}>одобрено</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '14px 28px', borderBottom: '1px solid rgba(0,229,255,0.08)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tabBtn('stats', '📊 Дашборд')}
        {tabBtn('pending', '🔍 На проверке', pendingRegs.length)}
        {tabBtn('all', '📋 Все заявки', allRegistrations.length)}
        {tabBtn('approved', '✅ Одобренные', approvedRegs.length)}
        {tabBtn('rejected', '❌ Отклонённые', rejectedRegs.length)}
        {tabBtn('event', '⚙️ Мероприятие')}
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* ── STATS ──────────────────────────────────────────────────────── */}
        {activeTab === 'stats' && (() => {
          const stats = [
            { label: 'Всего заявок',    value: allRegistrations.length, color: cyan },
            { label: 'На проверке',     value: pendingRegs.length,      color: yellow },
            { label: 'Одобрено',        value: approvedRegs.length,     color: green },
            { label: 'Отклонено',       value: rejectedRegs.length,     color: pink },
          ];
          return (
            <div>
              <div style={{ fontSize: 10, color: purple, letterSpacing: '0.1em', marginBottom: 20 }}>// DASHBOARD_STATS</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 32 }}>
                {stats.map(s => (
                  <div key={s.label} style={{ background: card, border: '1px solid rgba(0,229,255,0.12)', borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 32, fontWeight: 800, fontFamily: 'monospace', color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Latest pending */}
              <div style={{ fontSize: 10, color: purple, letterSpacing: '0.1em', marginBottom: 14 }}>// ПОСЛЕДНИЕ_НА_ПРОВЕРКЕ</div>
              <div style={{ background: card, border: '1px solid rgba(0,229,255,0.12)', borderRadius: 12, overflow: 'hidden' }}>
                {pendingRegs.length === 0 ? (
                  <div style={{ padding: 32, textAlign: 'center', color: muted }}>🎉 Всё проверено!</div>
                ) : pendingRegs.slice(0, 5).map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{r.user?.first_name || '—'}{r.user?.username ? ` @${r.user.username}` : ''}</div>
                      <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{new Date(r.createdAt).toLocaleString('ru-RU')}</div>
                    </div>
                    <a href={`/admin?key=${key}&tab=pending`} style={{ fontSize: 12, color: cyan, textDecoration: 'none' }}>Проверить →</a>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── PENDING (review cards) ─────────────────────────────────────── */}
        {activeTab === 'pending' && (
          <div>
            <div style={{ fontSize: 10, color: purple, letterSpacing: '0.1em', marginBottom: 20 }}>// НА_ПРОВЕРКЕ ({pendingRegs.length})</div>
            {pendingRegs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: muted }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Всё проверено!</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Новых заявок нет</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {pendingRegs.map((r: any) => (
                  <div key={r.id} style={{ background: card, border: '1px solid rgba(0,229,255,0.15)', borderRadius: 14, overflow: 'hidden' }}>
                    {/* Card header */}
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,229,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>
                          {r.user?.first_name || 'Пользователь'}
                          {r.user?.username && <span style={{ color: muted, fontWeight: 400, fontSize: 13 }}> @{r.user.username}</span>}
                        </div>
                        <div style={{ fontSize: 11, color: muted, marginTop: 3 }}>
                          Подал: {new Date(r.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: yellow, background: 'rgba(255,200,0,0.12)', border: '1px solid rgba(255,200,0,0.35)', borderRadius: 4, padding: '4px 10px', fontWeight: 700 }}>
                        НА ПРОВЕРКЕ
                      </div>
                    </div>

                    {/* Screenshot */}
                    {r.proofUrl && (
                      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(0,229,255,0.08)' }}>
                        <div style={{ fontSize: 10, color: muted, letterSpacing: '0.08em', marginBottom: 10 }}>// СКРИНШОТ_РЕПОСТА</div>
                        <img
                          src={r.proofUrl}
                          alt="Скриншот репоста"
                          style={{ maxWidth: '100%', maxHeight: 500, borderRadius: 10, border: '1px solid rgba(0,229,255,0.15)', objectFit: 'contain', display: 'block' }}
                        />
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ padding: '16px 20px', display: 'flex', gap: 12 }}>
                      <form action={reviewRegistration} style={{ flex: 1 }}>
                        <input type="hidden" name="registrationId" value={r.id} />
                        <input type="hidden" name="action" value="approve" />
                        <input type="hidden" name="_key" value={key} />
                        <PendingButton
                          label="✓ ТО"
                          pendingLabel="Одобряем..."
                          style={{ width: '100%', padding: '13px', fontSize: 14, background: 'linear-gradient(135deg, #00e5ff, #00ff88)', border: 'none', borderRadius: 10, color: '#000', fontWeight: 800 }}
                        />
                      </form>
                      <form action={reviewRegistration} style={{ flex: 1 }}>
                        <input type="hidden" name="registrationId" value={r.id} />
                        <input type="hidden" name="action" value="reject" />
                        <input type="hidden" name="_key" value={key} />
                        <PendingButton
                          label="✗ НЕ ТО"
                          pendingLabel="Отклоняем..."
                          style={{ width: '100%', padding: '13px', fontSize: 14, background: 'rgba(255,0,128,0.1)', border: '1px solid rgba(255,0,128,0.35)', borderRadius: 10, color: pink, fontWeight: 800 }}
                        />
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ALL REGISTRATIONS TABLE ─────────────────────────────────────── */}
        {activeTab === 'all' && (
          <div>
            <div style={{ fontSize: 10, color: purple, letterSpacing: '0.1em', marginBottom: 20 }}>// ВСЕ_ЗАЯВКИ ({allRegistrations.length})</div>
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(0,229,255,0.12)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,229,255,0.03)', borderBottom: '1px solid rgba(0,229,255,0.1)' }}>
                    {['Имя', '@username', 'Дата подачи', 'Статус', 'Мероприятие'].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allRegistrations.length === 0 ? (
                    <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: muted }}>Нет заявок</td></tr>
                  ) : allRegistrations.map((r: any) => {
                    const sc = statusColors[r.status] || { color: muted, label: r.status };
                    return (
                      <tr key={r.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{r.user?.first_name || '—'}</td>
                        <td style={{ ...td, color: muted }}>{r.user?.username ? `@${r.user.username}` : '—'}</td>
                        <td style={{ ...td, color: muted, fontSize: 11 }}>{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
                        <td style={td}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: sc.color }}>{sc.label}</span>
                        </td>
                        <td style={{ ...td, color: muted }}>{r.event?.title || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── APPROVED LIST ───────────────────────────────────────────────── */}
        {activeTab === 'approved' && (
          <div>
            <div style={{ fontSize: 10, color: green, letterSpacing: '0.1em', marginBottom: 20 }}>// ОДОБРЕННЫЕ ({approvedRegs.length})</div>
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(0,255,136,0.15)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,255,136,0.03)', borderBottom: '1px solid rgba(0,255,136,0.1)' }}>
                    {['Имя', '@username', 'Дата одобрения'].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {approvedRegs.length === 0 ? (
                    <tr><td colSpan={3} style={{ padding: 48, textAlign: 'center', color: muted }}>Нет одобренных заявок</td></tr>
                  ) : approvedRegs.map((r: any) => (
                    <tr key={r.id}>
                      <td style={{ ...td, fontWeight: 600, color: green }}>{r.user?.first_name || '—'}</td>
                      <td style={{ ...td, color: muted }}>{r.user?.username ? `@${r.user.username}` : '—'}</td>
                      <td style={{ ...td, color: muted, fontSize: 11 }}>{new Date(r.updatedAt).toLocaleString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── REJECTED LIST ───────────────────────────────────────────────── */}
        {activeTab === 'rejected' && (
          <div>
            <div style={{ fontSize: 10, color: pink, letterSpacing: '0.1em', marginBottom: 20 }}>// ОТКЛОНЁННЫЕ ({rejectedRegs.length})</div>
            <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(255,0,128,0.15)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,0,128,0.03)', borderBottom: '1px solid rgba(255,0,128,0.1)' }}>
                    {['Имя', '@username', 'Причина', 'Дата'].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rejectedRegs.length === 0 ? (
                    <tr><td colSpan={4} style={{ padding: 48, textAlign: 'center', color: muted }}>Нет отклонённых заявок</td></tr>
                  ) : rejectedRegs.map((r: any) => (
                    <tr key={r.id}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.user?.first_name || '—'}</td>
                      <td style={{ ...td, color: muted }}>{r.user?.username ? `@${r.user.username}` : '—'}</td>
                      <td style={{ ...td, color: muted, fontSize: 11 }}>{r.adminNote || '—'}</td>
                      <td style={{ ...td, color: muted, fontSize: 11 }}>{new Date(r.updatedAt).toLocaleString('ru-RU')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── EVENT SETTINGS ─────────────────────────────────────────────── */}
        {activeTab === 'event' && (
          <div>
            <div style={{ fontSize: 10, color: purple, letterSpacing: '0.1em', marginBottom: 20 }}>// НАСТРОЙКИ_МЕРОПРИЯТИЯ</div>
            <div style={{ background: card, border: '1px solid rgba(0,229,255,0.15)', borderRadius: 14, padding: 24 }}>
              <form action={updateEvent} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <input type="hidden" name="_key" value={key} />
                <input type="hidden" name="eventId" value={event?.id || ''} />

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: muted, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>НАЗВАНИЕ МЕРОПРИЯТИЯ *</label>
                  <input name="title" required defaultValue={event?.title || ''} placeholder="Например: Вечеринка April 2026" style={inp} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: muted, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>ОПИСАНИЕ</label>
                  <textarea name="description" rows={3} defaultValue={event?.description || ''} placeholder="Описание мероприятия..." style={{ ...inp, resize: 'vertical' as const }} />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: muted, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>ДАТА</label>
                  <input name="date" type="datetime-local"
                    defaultValue={event?.date ? new Date(event.date).toISOString().slice(0, 16) : ''}
                    style={inp}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 11, color: muted, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>МЕСТО</label>
                  <input name="location" defaultValue={event?.location || ''} placeholder="Адрес или название места" style={inp} />
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 11, color: cyan, letterSpacing: '0.06em', display: 'block', marginBottom: 6 }}>ССЫЛКА НА ПУБЛИКАЦИЮ ДЛЯ РЕПОСТА</label>
                  <input name="repostUrl" defaultValue={event?.repostUrl || ''} placeholder="https://www.instagram.com/p/..." style={inp} />
                  <div style={{ fontSize: 11, color: muted, marginTop: 6 }}>
                    Эта ссылка показывается пользователям в Mini App как кнопка «Открыть публикацию»
                  </div>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <PendingButton
                    label={event ? '💾 Сохранить изменения' : '+ Создать мероприятие'}
                    pendingLabel="Сохраняем..."
                    style={{ padding: '13px 28px', background: 'linear-gradient(135deg, #00e5ff, #b400ff)', border: 'none', borderRadius: 10, color: '#000', fontWeight: 700, fontSize: 14, letterSpacing: '0.04em', cursor: 'pointer' }}
                  />
                </div>
              </form>

              {event && (
                <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.12)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: muted }}>
                    Текущее мероприятие: <b style={{ color: cyan }}>{event.title}</b>
                    {event.date && ` · ${new Date(event.date).toLocaleDateString('ru-RU')}`}
                    {event.location && ` · ${event.location}`}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
