'use client';
import { useEffect, useState, useRef } from 'react';

type Org = { id: string; first_name?: string|null; username?: string|null; status: string; isSuperAdmin: boolean };
type Ev = { id: string; title: string; description?: string|null; date?: string|null; location?: string|null; repostUrl?: string|null; imageUrl?: string|null; price?: number|null; discountPrice?: number|null; isActive: boolean; isPaidRepost?: boolean; repostRewardUsdt?: number|null; repostsNeeded?: number|null; repostsFilled?: number; campaignBudget?: number|null; campaignTotal?: number|null; campaignStatus?: string|null; invoiceUrl?: string|null; _count?: { registrations: number } };
type Reg = { id: string; status: string; proofUrl?: string|null; storyUrl?: string|null; adminNote?: string|null; paidAmount?: number|null; createdAt: string; updatedAt: string; user: { first_name?: string|null; username?: string|null }; event: { id?: string; title?: string|null; isPaidRepost?: boolean; repostRewardUsdt?: number|null } };
type OrgItem = { id: string; telegram_id: string; first_name?: string|null; username?: string|null; login?: string|null; photo_url?: string|null; status: string; isSuperAdmin: boolean; createdAt: string; _count?: { events: number } };

const gold = 'var(--accent-gold)'; const warm = 'var(--accent-warm)'; const cream = 'var(--accent-cream)';
const success = 'var(--accent-success)'; const error = 'var(--accent-error)'; const muted = 'var(--text-muted)';
const card = 'var(--bg-card)'; const bg = 'var(--bg-primary)';

const inp: React.CSSProperties = { width:'100%', padding:'10px 14px', background:'var(--bg-card)', border:'1px solid var(--border-subtle)', borderRadius:8, color:'var(--text-primary)', fontSize:14, outline:'none' };

export default function AdminClient({ organizer, onLogout }: { organizer: Org; onLogout: () => void }) {
  const [tab, setTab] = useState('pending');
  const [events, setEvents] = useState<Ev[]>([]);
  const [regs, setRegs] = useState<Reg[]>([]);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [editEv, setEditEv] = useState<Ev|null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [pushState, setPushState] = useState<Record<string, { status: string; msg?: string }>>({});
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light'|'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem('cs-theme') as 'light'|'dark'|null;
    const initial = saved || 'light';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('cs-theme', next);
  };

  const load = async () => {
    const [eRes, rRes] = await Promise.all([
      fetch('/api/admin/events').then(r=>r.json()),
      fetch('/api/admin/registrations').then(r=>r.json()),
    ]);
    setEvents(eRes.events || []);
    setRegs(rRes.registrations || []);
    if (organizer.isSuperAdmin) {
      const oRes = await fetch('/api/admin/organizers').then(r=>r.json());
      setOrgs(oRes.organizers || []);
    }
  };
  useEffect(() => { load(); }, []);

  const pending = regs.filter(r => r.status === 'PENDING');
  const approved = regs.filter(r => r.status === 'APPROVED');
  const rejected = regs.filter(r => r.status === 'REJECTED');
  const pendingOrgs = orgs.filter(o => o.status === 'PENDING');

  const review = async (id: string, action: string, note?: string) => {
    setBusy(id);
    await fetch('/api/admin/registrations', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ registrationId:id, action, adminNote: note }) });
    await load(); setBusy('');
  };

  const saveEvent = async (form: Record<string,any>) => {
    setBusy('save');
    if (editEv) {
      await fetch('/api/admin/events', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ eventId: editEv.id, ...form }) });
    } else {
      await fetch('/api/admin/events', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    }
    setEditEv(null); setCreating(false); await load(); setBusy('');
  };

  const delEvent = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(prev => prev === id ? null : prev), 4000);
      return;
    }
    setDeleteConfirm(null);
    setBusy(id);
    await fetch('/api/admin/events', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ eventId: id }) });
    await load();
    setBusy('');
  };

  const pushEvent = async (id: string) => {
    const current = pushState[id];
    if (!current || current.status !== 'confirm') {
      setPushState(p => ({ ...p, [id]: { status: 'confirm' } }));
      setTimeout(() => setPushState(p => { if (p[id]?.status === 'confirm') { const n = { ...p }; delete n[id]; return n; } return p; }), 4000);
      return;
    }
    setPushState(p => ({ ...p, [id]: { status: 'sending' } }));
    try {
      const res = await fetch(`/api/admin/events/${id}/push`, { method: 'POST' });
      const data = await res.json();
      if (data.error) setPushState(p => ({ ...p, [id]: { status: 'error', msg: data.error } }));
      else setPushState(p => ({ ...p, [id]: { status: 'done', msg: `Отправлено: ${data.sent}` } }));
    } catch { setPushState(p => ({ ...p, [id]: { status: 'error', msg: 'Ошибка сети' } })); }
    setTimeout(() => setPushState(p => { const n = { ...p }; delete n[id]; return n; }), 5000);
  };

  const reviewOrg = async (id: string, action: string) => {
    setBusy(id);
    await fetch('/api/admin/organizers', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ organizerId: id, action }) });
    await load(); setBusy('');
  };

  const TabBtn = ({ id, label, count }: { id: string; label: string; count?: number }) => (
    <button onClick={() => setTab(id)} style={{ padding:'9px 18px', fontSize:13, fontWeight:600, borderRadius:8, background: tab===id ? 'var(--bg-card)' : 'transparent', border: tab===id ? '1px solid var(--border-glow)' : '1px solid var(--border-subtle)', color: tab===id ? gold : muted, cursor:'pointer', display:'inline-flex', gap:8, alignItems:'center', transition:'all 0.25s' }}>
      {label}
      {count !== undefined && <span style={{ background:'var(--border-subtle)', borderRadius:12, padding:'1px 7px', fontSize:11 }}>{count}</span>}
    </button>
  );

  return (
    <div style={{ minHeight:'100vh', background:bg, color:'var(--text-primary)', fontFamily:'Inter,sans-serif', transition:'background 0.35s ease, color 0.35s ease' }}>
      {/* Шапка */}
      <div style={{ padding:'18px 28px', borderBottom:'1px solid var(--border-subtle)', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:10, color:gold, letterSpacing:'0.1em', opacity:0.6 }}>ПАНЕЛЬ ОРГАНИЗАТОРА</div>
          <h1 style={{ fontSize:18, fontWeight:800 }}>{organizer.first_name || organizer.username} {organizer.isSuperAdmin && <span style={{ fontSize:11, color:warm }}>👑 Суперадмин</span>}</h1>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:16, alignItems:'center' }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:22, fontWeight:800, fontFamily:'monospace', color:warm }}>{pending.length}</div>
            <div style={{ fontSize:11, color:muted }}>на проверке</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:22, fontWeight:800, fontFamily:'monospace', color:success }}>{approved.length}</div>
            <div style={{ fontSize:11, color:muted }}>одобрено</div>
          </div>
          <button onClick={toggleTheme} style={{ padding:'8px 16px', background:'var(--bg-card)', border:'1px solid var(--border-subtle)', borderRadius:8, color:muted, cursor:'pointer', fontSize:16, lineHeight:1, transition:'all 0.25s' }} title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}>{theme === 'light' ? '🌙' : '☀️'}</button>
          {organizer.isSuperAdmin && <MigrateButton />}
          <button onClick={onLogout} style={{ padding:'8px 16px', background:'transparent', border:'1px solid var(--border-subtle)', borderRadius:8, color:muted, cursor:'pointer', fontSize:12 }}>Выйти</button>
        </div>
      </div>

      {/* Табы */}
      <div style={{ padding:'14px 28px', borderBottom:'1px solid var(--border-subtle)', display:'flex', gap:8, flexWrap:'wrap' }}>
        <TabBtn id="pending" label="🔍 На проверке" count={pending.length} />
        <TabBtn id="approved" label="✅ Одобренные" count={approved.length} />
        <TabBtn id="rejected" label="❌ Отклонённые" count={rejected.length} />
        <TabBtn id="events" label="📅 Мероприятия" count={events.length} />
        <TabBtn id="guide" label="💡 Инструкция" />
        {organizer.isSuperAdmin && <TabBtn id="organizers" label="👥 Организаторы" count={pendingOrgs.length} />}
        {organizer.isSuperAdmin && <TabBtn id="cryptobot" label="💳 CryptoBot" />}
      </div>

      <div style={{ padding:'24px 28px' }}>
        {/* НА ПРОВЕРКЕ */}
        {tab === 'pending' && (
          <div>
            {pending.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:muted }}><div style={{ fontSize:48, marginBottom:12 }}>🎉</div><div style={{ fontSize:16, fontWeight:600 }}>Всё проверено!</div></div>
            ) : pending.map(r => (
              <div key={r.id} style={{ background:card, border:'1px solid var(--border-subtle)', borderRadius:14, overflow:'hidden', marginBottom:20 }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border-subtle)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{r.user.first_name || '—'}{r.user.username && <span style={{ color:muted, fontWeight:400, fontSize:13 }}> @{r.user.username}</span>}</div>
                    <div style={{ fontSize:11, color:muted, marginTop:3 }}>
                      {r.event.title && <span style={{ color:gold, marginRight:8 }}>📅 {r.event.title}</span>}
                      {new Date(r.createdAt).toLocaleString('ru-RU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </div>
                  <span className="badge-pending">НА ПРОВЕРКЕ</span>
                </div>
                {r.proofUrl && (
                  <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize:10, color:muted, marginBottom:10 }}>СКРИНШОТ</div>
                    <img src={r.proofUrl} alt="proof" style={{ maxWidth:'100%', maxHeight:500, borderRadius:10, border:'1px solid var(--border-subtle)', objectFit:'contain', display:'block' }} />
                  </div>
                )}
                {r.storyUrl && (
                  <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize:10, color:muted, marginBottom:4 }}>ССЫЛКА НА СТОРИС</div>
                    <a href={r.storyUrl} target="_blank" rel="noopener noreferrer" style={{ color:gold, fontSize:13 }}>{r.storyUrl}</a>
                  </div>
                )}
                <div style={{ padding:'16px 20px', display:'flex', gap:12 }}>
                  <button disabled={busy===r.id} onClick={() => review(r.id, 'approve')} className="warm-btn-approve" style={{ flex:1, padding:'13px', fontSize:14 }}>{busy===r.id ? '...' : '✓ ОДОБРИТЬ'}</button>
                  <button disabled={busy===r.id} onClick={() => review(r.id, 'reject')} className="warm-btn-reject" style={{ flex:1, padding:'13px', fontSize:14 }}>{busy===r.id ? '...' : '✗ ОТКЛОНИТЬ'}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ОДОБРЕННЫЕ */}
        {tab === 'approved' && <RegList rows={approved} color={success} empty="Нет одобренных" />}

        {/* ОТКЛОНЁННЫЕ */}
        {tab === 'rejected' && <RegList rows={rejected} color={error} empty="Нет отклонённых" />}

        {/* МЕРОПРИЯТИЯ */}
        {tab === 'events' && (() => {
          const now = Date.now();
          const DAY = 24 * 60 * 60 * 1000;
          const activeEvents = events.filter(ev => {
            if (!ev.date) return true;
            return now - new Date(ev.date).getTime() < DAY;
          });
          const archivedEvents = events.filter(ev => {
            if (!ev.date) return false;
            return now - new Date(ev.date).getTime() >= DAY;
          });

          const handleCampaignAction = async (evId: string, action: string) => {
            setBusy(evId);
            await fetch('/api/admin/events', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ eventId: evId, action }) });
            await load(); setBusy('');
          };

          const handlePayCampaign = async (evId: string, extraSlots?: number) => {
            setBusy(evId);
            try {
              const res = await fetch('/api/cryptobot/create-invoice', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ eventId: evId, additionalSlots: extraSlots || 0 }) });
              const data = await res.json();
              if (data.invoiceUrl) window.open(data.invoiceUrl, '_blank');
              else alert(data.error || 'Ошибка создания счёта');
            } catch { alert('Ошибка сети'); }
            await load(); setBusy('');
          };

          const campaignStatusLabel = (s?: string|null) => {
            switch(s) {
              case 'draft': return { text: 'ЧЕРНОВИК', color: muted };
              case 'pending_payment': return { text: 'ОЖИДАЕТ ОПЛАТЫ', color: warm };
              case 'active': return { text: 'АКТИВНА', color: success };
              case 'paused': return { text: 'ПРИОСТАНОВЛЕНА', color: warm };
              case 'completed': return { text: 'ЗАВЕРШЕНА', color: '#8a9dbc' };
              default: return null;
            }
          };

          const renderEventCard = (ev: Ev) => (
            <div key={ev.id} style={{ background:card, border:`1px solid ${ev.isActive ? 'var(--border-subtle)' : 'rgba(255,255,255,0.07)'}`, borderRadius:12, padding:'16px 20px', marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontWeight:700, fontSize:15 }}>{ev.title}</span>
                    {ev.isPaidRepost && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, background:'rgba(212,168,83,0.15)', color:warm }}>💰 ПЛАТНЫЙ</span>}
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, background: ev.isActive ? 'rgba(143,188,106,0.12)' : 'rgba(255,255,255,0.05)', color: ev.isActive ? success : muted }}>{ev.isActive ? 'АКТИВНО' : 'СКРЫТО'}</span>
                    {ev.isPaidRepost && ev.campaignStatus && (() => {
                      const cs = campaignStatusLabel(ev.campaignStatus);
                      return cs ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, background:`${cs.color}18`, color:cs.color }}>{cs.text}</span> : null;
                    })()}
                  </div>
                  <div style={{ fontSize:12, color:muted }}>
                    {ev.date && `📅 ${new Date(ev.date).toLocaleDateString('ru-RU')} · `}
                    {ev.location && `📍 ${ev.location} · `}
                    <span style={{ color:gold }}>заявок: {ev._count?.registrations ?? 0}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => pushEvent(ev.id)} style={{ padding:'8px 14px', fontSize:12, fontWeight:700, borderRadius:8, background: pushState[ev.id]?.status==='confirm' ? 'rgba(212,168,83,0.15)' : pushState[ev.id]?.status==='done' ? 'rgba(143,188,106,0.12)' : pushState[ev.id]?.status==='error' ? 'rgba(199,92,92,0.1)' : 'var(--border-subtle)', border: `1px solid ${pushState[ev.id]?.status==='confirm' ? 'rgba(212,168,83,0.5)' : pushState[ev.id]?.status==='done' ? 'rgba(143,188,106,0.35)' : pushState[ev.id]?.status==='error' ? 'rgba(199,92,92,0.35)' : 'rgba(200,168,110,0.25)'}`, color: pushState[ev.id]?.status==='confirm' ? warm : pushState[ev.id]?.status==='done' ? success : pushState[ev.id]?.status==='error' ? error : gold, cursor:'pointer', whiteSpace:'nowrap' }} disabled={pushState[ev.id]?.status==='sending'}>
                    {pushState[ev.id]?.status==='sending' ? '📤...' : pushState[ev.id]?.status==='confirm' ? '❓ Точно?' : pushState[ev.id]?.status==='done' ? `✅ ${pushState[ev.id]?.msg}` : pushState[ev.id]?.status==='error' ? '❌' : '📣'}
                  </button>
                  <button onClick={() => setEditEv(ev)} style={{ padding:'8px 14px', fontSize:12, fontWeight:700, borderRadius:8, background:'var(--border-subtle)', border:'1px solid rgba(200,168,110,0.25)', color:gold, cursor:'pointer' }}>✏️</button>
                  <button onClick={() => delEvent(ev.id)} disabled={busy===ev.id} style={{ padding:'8px 12px', fontSize:12, fontWeight:700, borderRadius:8, background: deleteConfirm===ev.id ? 'rgba(199,92,92,0.2)' : 'rgba(199,92,92,0.07)', border: `1px solid ${deleteConfirm===ev.id ? 'rgba(199,92,92,0.5)' : 'rgba(199,92,92,0.2)'}`, color:error, cursor:'pointer', transition:'all 0.2s', whiteSpace:'nowrap' }}>{busy===ev.id ? '...' : deleteConfirm===ev.id ? '❓ Точно?' : '🗑'}</button>
                </div>
              </div>
              {/* Paid campaign controls */}
              {ev.isPaidRepost && (
                <div style={{ marginTop:12, padding:'12px 16px', background:'rgba(212,168,83,0.05)', border:'1px solid rgba(212,168,83,0.15)', borderRadius:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:8 }}>
                    <div style={{ fontSize:12, color:warm }}>
                      💰 {ev.repostRewardUsdt} USDT за репост · {ev.repostsFilled || 0}/{ev.repostsNeeded || 0} репостов
                    </div>
                    <div style={{ fontSize:11, color:muted }}>
                      Бюджет: {ev.campaignBudget} USDT · Итого: {ev.campaignTotal} USDT
                    </div>
                  </div>
                  {/* Progress bar */}
                  {ev.repostsNeeded && ev.repostsNeeded > 0 && (
                    <div style={{ height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, marginBottom:10, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.min(100, ((ev.repostsFilled || 0) / ev.repostsNeeded) * 100)}%`, background:`linear-gradient(90deg, ${warm}, ${success})`, borderRadius:3, transition:'width 0.3s' }} />
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    {ev.campaignStatus === 'draft' && (
                      <button onClick={() => handlePayCampaign(ev.id)} disabled={busy===ev.id} style={{ padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:8, background:'linear-gradient(135deg, rgba(212,168,83,0.2), var(--border-subtle))', border:'1px solid rgba(212,168,83,0.5)', color:warm, cursor:'pointer' }}>
                        {busy===ev.id ? '...' : '💳 Оплатить кампанию'}
                      </button>
                    )}
                    {ev.campaignStatus === 'pending_payment' && ev.invoiceUrl && (
                      <a href={ev.invoiceUrl} target="_blank" rel="noopener noreferrer" style={{ padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:8, background:'rgba(212,168,83,0.12)', border:'1px solid rgba(212,168,83,0.4)', color:warm, textDecoration:'none' }}>
                        💳 Перейти к оплате
                      </a>
                    )}
                    {ev.campaignStatus === 'active' && (
                      <>
                        <button onClick={() => handleCampaignAction(ev.id, 'pause')} disabled={busy===ev.id} style={{ padding:'7px 14px', fontSize:12, fontWeight:600, borderRadius:8, background:'var(--border-subtle)', border:'1px solid var(--border-subtle)', color:muted, cursor:'pointer' }}>
                          ⏸ Приостановить
                        </button>
                        <button onClick={() => {
                          const slots = prompt('Сколько сторис докупить?');
                          if (slots && Number(slots) > 0) handlePayCampaign(ev.id, Number(slots));
                        }} disabled={busy===ev.id} style={{ padding:'7px 14px', fontSize:12, fontWeight:600, borderRadius:8, background:'rgba(143,188,106,0.08)', border:'1px solid rgba(143,188,106,0.2)', color:success, cursor:'pointer' }}>
                          ➕ Докупить
                        </button>
                      </>
                    )}
                    {ev.campaignStatus === 'paused' && (
                      <button onClick={() => handleCampaignAction(ev.id, 'resume')} disabled={busy===ev.id} style={{ padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:8, background:'rgba(143,188,106,0.12)', border:'1px solid rgba(143,188,106,0.3)', color:success, cursor:'pointer' }}>
                        ▶ Возобновить
                      </button>
                    )}
                    {ev.campaignStatus === 'completed' && (
                      <button onClick={() => {
                        const slots = prompt('Сколько сторис докупить?');
                        if (slots && Number(slots) > 0) handlePayCampaign(ev.id, Number(slots));
                      }} disabled={busy===ev.id} style={{ padding:'7px 14px', fontSize:12, fontWeight:600, borderRadius:8, background:'rgba(143,188,106,0.08)', border:'1px solid rgba(143,188,106,0.2)', color:success, cursor:'pointer' }}>
                        ➕ Докупить ещё
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );

          return (
            <div>
              {(editEv || creating) ? (
                <EventForm event={editEv} onSave={saveEvent} onCancel={() => { setEditEv(null); setCreating(false); }} saving={busy==='save'} />
              ) : (
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                    <div style={{ fontSize:12, color:muted }}>Мероприятия ({activeEvents.length})</div>
                    <button onClick={() => setCreating(true)} style={{ padding:'9px 18px', fontSize:13, fontWeight:700, borderRadius:8, background:'linear-gradient(135deg,var(--border-subtle),rgba(212,168,83,0.15))', border:'1px solid var(--border-glow)', color:gold, cursor:'pointer' }}>+ Создать</button>
                  </div>
                  {activeEvents.length === 0 && (
                    <div style={{ textAlign:'center', padding:'40px 0', color:muted, fontSize:14 }}>Нет актуальных мероприятий</div>
                  )}
                  {activeEvents.map(renderEventCard)}

                  {/* АРХИВ */}
                  {archivedEvents.length > 0 && (
                    <div style={{ marginTop:24 }}>
                      <button
                        onClick={() => setArchiveOpen(!archiveOpen)}
                        style={{
                          width:'100%', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between',
                          background:'rgba(200,168,110,0.04)', border:'1px solid var(--border-subtle)', borderRadius:10,
                          color:muted, fontSize:13, fontWeight:600, cursor:'pointer', transition:'all 0.2s'
                        }}
                      >
                        <span>📦 Архив ({archivedEvents.length})</span>
                        <span style={{ transform: archiveOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform 0.25s ease', fontSize:16, lineHeight:1 }}>▼</span>
                      </button>
                      {archiveOpen && (
                        <div style={{ marginTop:12 }}>
                          {archivedEvents.map(renderEventCard)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ОРГАНИЗАТОРЫ (суперадмин) */}
        {tab === 'organizers' && organizer.isSuperAdmin && (
          <div>
            <div style={{ fontSize:12, color:muted, marginBottom:20 }}>Организаторы ({orgs.length})</div>
            {orgs.map(o => (
              <OrgCard key={o.id} org={o} busy={busy} onReview={reviewOrg} onUpdate={async (id, data) => {
                setBusy(id);
                await fetch('/api/admin/organizers', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ organizerId: id, ...data }) });
                await load(); setBusy('');
              }} />
            ))}
          </div>
        )}

        {/* ИНСТРУКЦИЯ */}
        {tab === 'guide' && <WalletGuide />}

        {/* CRYPTOBOT (суперадмин) */}
        {tab === 'cryptobot' && organizer.isSuperAdmin && <CryptoBotPanel />}
      </div>
    </div>
  );
}

// Таблица заявок
function RegList({ rows, color, empty }: { rows: Reg[]; color: string; empty: string }) {
  if (rows.length === 0) return <div style={{ textAlign:'center', padding:'60px 0', color:muted }}>{empty}</div>;
  return (
    <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid var(--border-subtle)' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr style={{ background:'rgba(200,168,110,0.03)', borderBottom:'1px solid var(--border-subtle)' }}>
          {['Имя','@username','Мероприятие','Дата'].map(h => <th key={h} style={{ padding:'11px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:muted, textTransform:'uppercase' }}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}><td style={{ padding:'13px 16px', borderBottom:'1px solid var(--border-subtle)', fontSize:13, fontWeight:600, color }}>{r.user.first_name||'—'}</td>
          <td style={{ padding:'13px 16px', borderBottom:'1px solid var(--border-subtle)', fontSize:13, color:muted }}>{r.user.username ? `@${r.user.username}` : '—'}</td>
          <td style={{ padding:'13px 16px', borderBottom:'1px solid var(--border-subtle)', fontSize:12, color:gold }}>{r.event.title||'—'}</td>
          <td style={{ padding:'13px 16px', borderBottom:'1px solid var(--border-subtle)', fontSize:11, color:muted }}>{new Date(r.updatedAt).toLocaleString('ru-RU')}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// Форма мероприятия
function EventForm({ event, onSave, onCancel, saving }: { event: Ev|null; onSave: (d:any)=>void; onCancel:()=>void; saving:boolean }) {
  const [title, setTitle] = useState(event?.title || '');
  const [desc, setDesc] = useState(event?.description || '');
  const [date, setDate] = useState(event?.date ? new Date(event.date).toISOString().slice(0,16) : '');
  const [loc, setLoc] = useState(event?.location || '');
  const [url, setUrl] = useState(event?.repostUrl || '');
  const [price, setPrice] = useState(event?.price?.toString() || '');
  const [discountPrice, setDiscountPrice] = useState(event?.discountPrice?.toString() || '');
  const [active, setActive] = useState(event?.isActive !== false);
  const [img, setImg] = useState(event?.imageUrl || '');
  // Paid repost
  const [isPaidRepost, setIsPaidRepost] = useState(event?.isPaidRepost || false);
  const [rewardUsdt, setRewardUsdt] = useState(event?.repostRewardUsdt?.toString() || '');
  const [repostsNeeded, setRepostsNeeded] = useState(event?.repostsNeeded?.toString() || '');
  const imgRef = useRef<HTMLInputElement>(null);
  const [parseUrl, setParseUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');

  const handleParse = async () => {
    if (!parseUrl.trim()) return;
    setParsing(true); setParseError('');
    try {
      const res = await fetch('/api/admin/parse-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: parseUrl.trim() }),
      });
      let data: any;
      try { data = await res.json(); } catch { data = { error: `Сервер вернул ${res.status}` }; }
      if (!res.ok) { setParseError(data.error || `Ошибка ${res.status}`); setParsing(false); return; }
      if (data.title) setTitle(data.title);
      if (data.description) setDesc(data.description);
      if (data.price) setPrice(String(data.price));
      if (data.discountPrice) setDiscountPrice(String(data.discountPrice));
      if (data.date) setDate(data.date.slice(0, 16));
      if (data.location) setLoc(data.location);
      if (data.imageUrl) setImg(data.imageUrl);
      if (!url) setUrl(parseUrl.trim());
    } catch (e: any) { setParseError(e.message || 'Ошибка сети — попробуй ещё раз'); }
    setParsing(false);
  };

  const onImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => setImg(r.result as string);
    r.readAsDataURL(f);
  };

  const wrapText = (tag: string) => {
    const ta = document.getElementById('ev-desc') as HTMLTextAreaElement;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const sel = desc.substring(s, e);
    let wrap = '';
    if (tag === 'b') wrap = `**${sel}**`;
    else if (tag === 'i') wrap = `__${sel}__`;
    else if (tag === 's') wrap = `~~${sel}~~`;
    else if (tag === 'code') wrap = '`' + sel + '`';
    else if (tag === 'link') wrap = `[${sel}](url)`;
    setDesc(desc.substring(0, s) + wrap + desc.substring(e));
  };

  const submit = () => onSave({ title, description:desc||null, date:date||null, location:loc||null, repostUrl:url||null, isActive:active, imageUrl:img||null, price: price ? Number(price) : null, discountPrice: discountPrice ? Number(discountPrice) : null, isPaidRepost, repostRewardUsdt: isPaidRepost && rewardUsdt ? Number(rewardUsdt) : null, repostsNeeded: isPaidRepost && repostsNeeded ? Number(repostsNeeded) : null });

  return (
    <div style={{ background:card, border:'1px solid var(--border-subtle)', borderRadius:14, padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ fontSize:12, color:muted }}>{event ? 'Редактировать' : 'Новое мероприятие'}</div>
        <button onClick={onCancel} style={{ fontSize:12, color:muted, background:'none', border:'none', cursor:'pointer' }}>← Назад</button>
      </div>

      {/* Парсинг ссылки */}
      {!event && (
        <div style={{ marginBottom:20, padding:'16px 18px', background:'rgba(200,168,110,0.04)', border:'1px solid var(--border-subtle)', borderRadius:10 }}>
          <label style={{ fontSize:11, color:gold, display:'block', marginBottom:8, fontWeight:600 }}>🔗 ВСТАВЬ ССЫЛКУ НА ПОСТ — ЗАПОЛНИМ АВТОМАТИЧЕСКИ</label>
          <div style={{ display:'flex', gap:8 }}>
            <input
              value={parseUrl} onChange={e => setParseUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleParse()}
              placeholder="https://t.me/channel/123"
              style={{ ...inp, flex:1 }}
            />
            <button onClick={handleParse} disabled={parsing || !parseUrl.trim()} style={{
              padding:'10px 18px', fontSize:13, fontWeight:700, borderRadius:8, whiteSpace:'nowrap',
              background: parsing ? 'var(--border-subtle)' : 'linear-gradient(135deg,var(--border-subtle),rgba(212,168,83,0.15))',
              border:'1px solid var(--border-glow)', color:gold, cursor: parsing ? 'wait' : 'pointer',
            }}>
              {parsing ? '⏳ Распознаём...' : '✨ Распознать'}
            </button>
          </div>
          {parseError && <div style={{ marginTop:8, fontSize:12, color:error }}>❌ {parseError}</div>}
        </div>
      )}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, color:muted, display:'block', marginBottom:6 }}>НАЗВАНИЕ *</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} style={inp} placeholder="Название мероприятия" />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, color:muted, display:'block', marginBottom:6 }}>ОПИСАНИЕ</label>
          <div className="format-toolbar">
            <button type="button" onClick={()=>wrapText('b')}><b>B</b></button>
            <button type="button" onClick={()=>wrapText('i')}><i>I</i></button>
            <button type="button" onClick={()=>wrapText('s')}><s>S</s></button>
            <button type="button" onClick={()=>wrapText('code')}>{'<>'}</button>
            <button type="button" onClick={()=>wrapText('link')}>🔗</button>
          </div>
          <textarea id="ev-desc" value={desc} onChange={e=>setDesc(e.target.value)} rows={4} style={{ ...inp, resize:'vertical', borderTopLeftRadius:0, borderTopRightRadius:0 }} placeholder="Описание с разметкой: **жирный** __курсив__ ~~зачёркнутый~~" />
        </div>
        <div>
          <label style={{ fontSize:11, color:muted, display:'block', marginBottom:6 }}>ДАТА</label>
          <input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize:11, color:muted, display:'block', marginBottom:6 }}>МЕСТО</label>
          <input value={loc} onChange={e=>setLoc(e.target.value)} style={inp} placeholder="Адрес или название" />
        </div>
        <div>
          <label style={{ fontSize:11, color:gold, display:'block', marginBottom:6 }}>ЦЕНА (₽) *</label>
          <input type="number" value={price} onChange={e=>setPrice(e.target.value)} style={inp} placeholder="5000" required />
        </div>
        <div>
          <label style={{ fontSize:11, color:gold, display:'block', marginBottom:6 }}>ЦЕНА СО СКИДКОЙ (₽) *</label>
          <input type="number" value={discountPrice} onChange={e=>setDiscountPrice(e.target.value)} style={inp} placeholder="3000" required />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, color:gold, display:'block', marginBottom:6 }}>ССЫЛКА НА ПУБЛИКАЦИЮ</label>
          <input value={url} onChange={e=>setUrl(e.target.value)} style={inp} placeholder="https://t.me/..." />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, color:muted, display:'block', marginBottom:6 }}>КАРТИНКА</label>
          <input ref={imgRef} type="file" accept="image/*" onChange={onImg} style={{ display:'none' }} />
          {img ? (
            <div>
              <img src={img} alt="preview" style={{ maxWidth:'100%', maxHeight:200, borderRadius:10, border:'1px solid var(--border-subtle)', objectFit:'contain', display:'block', marginBottom:8 }} />
              <button onClick={()=>setImg('')} style={{ fontSize:12, color:muted, background:'none', border:'none', cursor:'pointer' }}>✕ Удалить</button>
            </div>
          ) : (
            <div className="upload-zone" onClick={()=>imgRef.current?.click()} style={{ padding:'20px', textAlign:'center' }}>
              <div style={{ fontSize:24, marginBottom:4 }}>🖼</div>
              <div style={{ fontSize:12, color:muted }}>Нажми чтобы загрузить</div>
            </div>
          )}
        </div>
        <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:10 }}>
          <label style={{ fontSize:13, display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
            <input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)} style={{ width:16, height:16, accentColor:gold }} />
            Активно (видно пользователям)
          </label>
        </div>
        {/* Paid repost section */}
        <div style={{ gridColumn:'1/-1' }}>
          <div style={{ padding:'16px 18px', background: isPaidRepost ? 'rgba(212,168,83,0.06)' : 'rgba(200,168,110,0.03)', border:`1px solid ${isPaidRepost ? 'rgba(212,168,83,0.25)' : 'var(--border-subtle)'}`, borderRadius:12, transition:'all 0.3s' }}>
            <label style={{ fontSize:14, display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontWeight:600, color: isPaidRepost ? warm : muted }}>
              <input type="checkbox" checked={isPaidRepost} onChange={e=>setIsPaidRepost(e.target.checked)} style={{ width:18, height:18, accentColor:warm }} />
              💰 Платный репост
            </label>
            {isPaidRepost && (
              <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, color:warm, display:'block', marginBottom:6, fontWeight:600 }}>ОПЛАТА ЗА 1 РЕПОСТ (USDT)</label>
                  <input type="number" step="0.01" value={rewardUsdt} onChange={e=>setRewardUsdt(e.target.value)} style={inp} placeholder="5.00" />
                </div>
                <div>
                  <label style={{ fontSize:11, color:warm, display:'block', marginBottom:6, fontWeight:600 }}>КОЛИЧЕСТВО РЕПОСТОВ</label>
                  <input type="number" value={repostsNeeded} onChange={e=>setRepostsNeeded(e.target.value)} style={inp} placeholder="50" />
                </div>
                {rewardUsdt && repostsNeeded && Number(rewardUsdt) > 0 && Number(repostsNeeded) > 0 && (
                  <div style={{ gridColumn:'1/-1', padding:'12px 16px', background:'rgba(212,168,83,0.08)', borderRadius:8, fontSize:13 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ color:muted }}>Бюджет:</span>
                      <span style={{ color:cream, fontWeight:600 }}>{(Number(rewardUsdt) * Number(repostsNeeded)).toFixed(2)} USDT</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ color:muted }}>Комиссия 20%:</span>
                      <span style={{ color:warm }}>{(Number(rewardUsdt) * Number(repostsNeeded) * 0.2).toFixed(2)} USDT</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px solid rgba(212,168,83,0.15)', paddingTop:6, marginTop:4 }}>
                      <span style={{ color:cream, fontWeight:700 }}>Итого к оплате:</span>
                      <span style={{ color:warm, fontWeight:700, fontSize:15 }}>{(Number(rewardUsdt) * Number(repostsNeeded) * 1.2).toFixed(2)} USDT</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <button onClick={submit} disabled={saving||!title} className="warm-btn-primary" style={{ padding:'13px 28px', fontSize:14 }}>{saving ? 'Сохраняем...' : event ? '💾 Сохранить' : '+ Создать'}</button>
        </div>
      </div>
    </div>
  );
}

// Карточка организатора (с логином/паролем)
function OrgCard({ org, busy, onReview, onUpdate }: {
  org: OrgItem; busy: string;
  onReview: (id: string, action: string) => void;
  onUpdate: (id: string, data: { login?: string; password?: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editLogin, setEditLogin] = useState(org.login || '');
  const [editPassword, setEditPassword] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  // Transfer state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferResult, setTransferResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const save = async () => {
    const data: { login?: string; password?: string } = {};
    if (editLogin && editLogin !== org.login) data.login = editLogin;
    if (editPassword) data.password = editPassword;
    if (Object.keys(data).length === 0) { setEditing(false); return; }
    onUpdate(org.id, data);
    setSaveMsg('✅ Сохранено');
    setEditPassword('');
    setEditing(false);
    setTimeout(() => setSaveMsg(''), 3000);
  };

  const doTransfer = async () => {
    const amt = parseFloat(transferAmount);
    if (!amt || amt <= 0) return;
    setTransferBusy(true); setTransferResult(null);
    try {
      const res = await fetch('/api/admin/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizerId: org.id, amount: amt }),
      });
      const data = await res.json();
      if (data.success) {
        setTransferResult({ ok: true, msg: `✅ Переведено ${amt} USDT → ${org.first_name || org.username || 'орг'}` });
        setTransferAmount('');
        setTimeout(() => { setShowTransfer(false); setTransferResult(null); }, 4000);
      } else {
        setTransferResult({ ok: false, msg: `❌ ${data.error}` });
      }
    } catch {
      setTransferResult({ ok: false, msg: '❌ Ошибка сети' });
    }
    setTransferBusy(false);
  };

  const smallInp: React.CSSProperties = { padding:'6px 10px', fontSize:13, borderRadius:6, border:'1px solid var(--border-subtle)', background:'var(--bg-card-hover)', color:'var(--accent-cream)', outline:'none', width: 140 };

  return (
    <div style={{ background: card, border:'1px solid var(--border-subtle)', borderRadius:12, padding:'16px 20px', marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:15 }}>
            {org.first_name || '—'}
            {org.username && <span style={{ color: muted, fontWeight:400, fontSize:13 }}> @{org.username}</span>}
            {org.isSuperAdmin && <span style={{ fontSize:11, color: warm, marginLeft:8 }}>👑</span>}
          </div>
          <div style={{ fontSize:12, color: muted, marginTop:3 }}>
            {org.login ? <>Логин: <b style={{ color: cream }}>{org.login}</b></> : <span style={{ fontStyle:'italic' }}>без логина (Telegram)</span>}
            {' · '} Мероприятий: {org._count?.events ?? 0}
            {' · '}{new Date(org.createdAt).toLocaleDateString('ru-RU')}
          </div>
          {saveMsg && <div style={{ fontSize:11, color: success, marginTop:4 }}>{saveMsg}</div>}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {org.status === 'PENDING' ? (
            <>
              <button disabled={busy===org.id} onClick={() => onReview(org.id,'approve')} className="warm-btn-approve" style={{ padding:'7px 14px', fontSize:12 }}>✓ Одобрить</button>
              <button disabled={busy===org.id} onClick={() => onReview(org.id,'reject')} className="warm-btn-reject" style={{ padding:'7px 14px', fontSize:12 }}>✗ Отклонить</button>
            </>
          ) : (
            <span style={{ fontSize:11, fontWeight:700, color: org.status==='APPROVED' ? success : error }}>{org.status==='APPROVED' ? '✅ Одобрен' : '❌ Отклонён'}</span>
          )}
          {!org.isSuperAdmin && (
            <>
              <button onClick={() => setShowTransfer(!showTransfer)} style={{ padding:'6px 12px', fontSize:11, borderRadius:6, cursor:'pointer', background: showTransfer ? 'rgba(212,168,83,0.12)' : 'transparent', border:'1px solid var(--border-subtle)', color: showTransfer ? warm : muted, fontWeight:600, transition:'all 0.2s' }}>
                💸 Пополнить
              </button>
              <button onClick={() => setEditing(!editing)} style={{ padding:'6px 12px', fontSize:11, borderRadius:6, cursor:'pointer', background:'transparent', border:'1px solid var(--border-subtle)', color: muted }}>
                {editing ? '✕' : '✏️'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Форма перевода USDT */}
      {showTransfer && !org.isSuperAdmin && (
        <div style={{ marginTop:12, padding:'14px 16px', background:'var(--bg-card-hover)', border:'1px solid var(--border-subtle)', borderRadius:10 }}>
          <div style={{ fontSize:12, fontWeight:600, color: warm, marginBottom:10 }}>💸 Перевести USDT из CryptoBot → {org.first_name || org.username || 'организатор'}</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <input
              type="number" step="0.01" min="0.01" placeholder="Сумма USDT"
              value={transferAmount} onChange={e => setTransferAmount(e.target.value)}
              style={{ ...smallInp, width:130 }}
            />
            <button
              disabled={transferBusy || !transferAmount || parseFloat(transferAmount) <= 0}
              onClick={doTransfer}
              style={{
                padding:'7px 16px', fontSize:12, fontWeight:700, borderRadius:6, cursor:'pointer',
                background: 'rgba(143,188,106,0.15)', border:'1px solid rgba(143,188,106,0.3)',
                color: success, opacity: transferBusy ? 0.6 : 1,
              }}
            >
              {transferBusy ? '⏳ Отправка...' : '✅ Перевести'}
            </button>
            <button onClick={() => { setShowTransfer(false); setTransferResult(null); }} style={{ padding:'6px 10px', fontSize:11, borderRadius:6, cursor:'pointer', background:'transparent', border:'1px solid var(--border-subtle)', color: muted }}>
              ✕
            </button>
          </div>
          {transferResult && (
            <div style={{
              marginTop:10, padding:'8px 14px', borderRadius:8, fontSize:12,
              background: transferResult.ok ? 'rgba(143,188,106,0.08)' : 'rgba(199,92,92,0.08)',
              border: `1px solid ${transferResult.ok ? 'rgba(143,188,106,0.25)' : 'rgba(199,92,92,0.25)'}`,
              color: transferResult.ok ? success : error,
            }}>
              {transferResult.msg}
            </div>
          )}
        </div>
      )}

      {editing && (
        <div style={{ marginTop:12, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          <input value={editLogin} onChange={e => setEditLogin(e.target.value)} placeholder="Логин" style={smallInp} />
          <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Новый пароль" style={smallInp} />
          <button disabled={busy===org.id} onClick={save} style={{ padding:'6px 14px', fontSize:12, borderRadius:6, cursor:'pointer', background:'rgba(143,188,106,0.15)', border:'1px solid rgba(143,188,106,0.3)', color: success, fontWeight:600 }}>
            Сохранить
          </button>
        </div>
      )}
    </div>
  );
}

// CryptoBot управление
function CryptoBotPanel() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  // Deposit state
  const [depositAmount, setDepositAmount] = useState('');
  const [depositBusy, setDepositBusy] = useState(false);
  const [depositResult, setDepositResult] = useState<{ ok: boolean; msg: string; url?: string } | null>(null);
  const [appBalance, setAppBalance] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/cryptobot/setup-webhook')
      .then(r => r.json())
      .then(d => { setStatus(d); if (d.balance !== undefined) setAppBalance(d.balance); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const testWebhook = async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await fetch('/api/cryptobot/setup-webhook', { method: 'POST' });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    }
    setTesting(false);
  };

  const copyUrl = () => {
    if (status?.webhookUrl) {
      navigator.clipboard.writeText(status.webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) return <div style={{ textAlign:'center', padding:'40px 0', color:muted }}>Загрузка...</div>;

  return (
    <div>
      <div style={{ fontSize:12, color:muted, marginBottom:20 }}>💳 CryptoBot интеграция</div>

      {/* Connection status */}
      <div style={{ background:card, border:'1px solid var(--border-subtle)', borderRadius:14, padding:'20px 24px', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <div style={{
            width:12, height:12, borderRadius:'50%',
            background: status?.connected ? success : error,
            boxShadow: `0 0 8px ${status?.connected ? success : error}40`,
          }} />
          <div style={{ fontWeight:700, fontSize:15 }}>
            {status?.connected ? 'Подключено' : 'Не подключено'}
          </div>
          <span style={{
            fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, marginLeft:'auto',
            background: status?.testnet ? 'rgba(212,168,83,0.15)' : 'rgba(143,188,106,0.12)',
            color: status?.testnet ? warm : success,
          }}>
            {status?.testnet ? 'TESTNET' : 'MAINNET'}
          </span>
        </div>

        {status?.connected && status?.app && (
          <div style={{ fontSize:13, color:muted, lineHeight:1.8 }}>
            <div>📱 Приложение: <span style={{ color:cream }}>{status.app.name}</span></div>
            <div>🆔 App ID: <span style={{ color:cream }}>{status.app.app_id}</span></div>
          </div>
        )}

        {!status?.connected && (
          <div style={{ fontSize:13, color:error, marginTop:8 }}>
            {status?.error || 'Добавьте CRYPTOBOT_TOKEN в переменные окружения Railway'}
          </div>
        )}
      </div>

      {/* Balance & Deposit */}
      {status?.connected && (
        <div style={{ background:card, border:'1px solid var(--border-subtle)', borderRadius:14, padding:'20px 24px', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>💰 Баланс приложения</div>
            <button onClick={async () => {
              try {
                const res = await fetch('/api/cryptobot/setup-webhook');
                const d = await res.json();
                if (d.balance !== undefined) setAppBalance(d.balance);
              } catch {}
            }} style={{ padding:'5px 12px', fontSize:11, borderRadius:6, cursor:'pointer', background:'transparent', border:'1px solid var(--border-subtle)', color:muted }}>
              🔄 Обновить
            </button>
          </div>

          <div style={{ fontSize:28, fontWeight:800, fontFamily:'monospace', color: cream, marginBottom:8 }}>
            {appBalance !== null ? `${appBalance} USDT` : '— USDT'}
          </div>
          <div style={{ fontSize:11, color:muted, marginBottom:16 }}>
            Этот баланс используется для переводов организаторам
          </div>

          <div style={{ borderTop:'1px solid var(--border-subtle)', paddingTop:14 }}>
            <div style={{ fontSize:13, fontWeight:600, color:warm, marginBottom:10 }}>💸 Пополнить баланс приложения</div>
            <div style={{ fontSize:11, color:muted, marginBottom:10, lineHeight:1.6 }}>
              Создаст инвойс, который вы оплатите из личного CryptoBot кошелька. Деньги придут на баланс приложения.
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              <input
                type="number" step="0.01" min="0.01" placeholder="Сумма USDT"
                value={depositAmount} onChange={e => setDepositAmount(e.target.value)}
                style={{ padding:'8px 12px', fontSize:13, borderRadius:6, border:'1px solid var(--border-subtle)', background:'var(--bg-card-hover)', color:cream, outline:'none', width:130 }}
              />
              <button
                disabled={depositBusy || !depositAmount || parseFloat(depositAmount) <= 0}
                onClick={async () => {
                  const amt = parseFloat(depositAmount);
                  if (!amt || amt <= 0) return;
                  setDepositBusy(true); setDepositResult(null);
                  try {
                    const res = await fetch('/api/admin/deposit', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ amount: amt }),
                    });
                    const data = await res.json();
                    if (data.success) {
                      setDepositResult({ ok: true, msg: `Инвойс на ${amt} USDT создан! Нажмите для оплаты:`, url: data.invoiceUrl });
                      setDepositAmount('');
                    } else {
                      setDepositResult({ ok: false, msg: `❌ ${data.error}` });
                    }
                  } catch {
                    setDepositResult({ ok: false, msg: '❌ Ошибка сети' });
                  }
                  setDepositBusy(false);
                }}
                style={{
                  padding:'8px 18px', fontSize:12, fontWeight:700, borderRadius:6, cursor:'pointer',
                  background:'rgba(143,188,106,0.15)', border:'1px solid rgba(143,188,106,0.3)',
                  color:success, opacity: depositBusy ? 0.6 : 1,
                }}
              >
                {depositBusy ? '⏳...' : '📄 Создать инвойс'}
              </button>
            </div>

            {depositResult && (
              <div style={{
                marginTop:10, padding:'10px 14px', borderRadius:8, fontSize:12,
                background: depositResult.ok ? 'rgba(143,188,106,0.08)' : 'rgba(199,92,92,0.08)',
                border: `1px solid ${depositResult.ok ? 'rgba(143,188,106,0.25)' : 'rgba(199,92,92,0.25)'}`,
                color: depositResult.ok ? success : error,
              }}>
                {depositResult.msg}
                {depositResult.url && (
                  <div style={{ marginTop:8 }}>
                    <a href={depositResult.url} target="_blank" rel="noopener" style={{
                      display:'inline-block', padding:'8px 20px', fontSize:13, fontWeight:700,
                      borderRadius:8, background:'rgba(212,168,83,0.15)', border:'1px solid rgba(212,168,83,0.3)',
                      color:warm, textDecoration:'none',
                    }}>
                      💳 Оплатить {parseFloat(depositAmount) || ''} USDT
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Webhook URL */}
      <div style={{ background:card, border:'1px solid var(--border-subtle)', borderRadius:14, padding:'20px 24px', marginBottom:16 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>🔗 Webhook URL</div>
        <div style={{ fontSize:12, color:muted, marginBottom:14, lineHeight:1.6 }}>
          Скопируйте URL и вставьте в настройках приложения в{' '}
          <a href={status?.testnet ? 'https://t.me/CryptoTestnetBot' : 'https://t.me/CryptoBot'} target="_blank" rel="noopener" style={{ color:gold }}>
            @{status?.testnet ? 'CryptoTestnetBot' : 'CryptoBot'}
          </a>
        </div>

        {status?.webhookUrl ? (
          <>
            <div style={{ display:'flex', gap:8, alignItems:'stretch' }}>
              <div style={{
                flex:1, padding:'12px 16px', background:'rgba(200,168,110,0.06)', border:'1px solid var(--border-subtle)',
                borderRadius:8, fontSize:13, color:cream, fontFamily:'monospace', wordBreak:'break-all', lineHeight:1.5,
              }}>
                {status.webhookUrl}
              </div>
              <button onClick={copyUrl} style={{
                padding:'12px 18px', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap',
                background: copied ? 'rgba(143,188,106,0.15)' : 'rgba(200,168,110,0.1)',
                border: `1px solid ${copied ? 'rgba(143,188,106,0.4)' : 'var(--border-glow)'}`,
                color: copied ? success : gold, transition:'all 0.2s',
              }}>
                {copied ? '✅' : '📋 Копировать'}
              </button>
            </div>

            <div style={{ marginTop:14 }}>
              <button onClick={testWebhook} disabled={testing} style={{
                padding:'10px 20px', fontSize:13, fontWeight:600, borderRadius:8, cursor:'pointer',
                background:'var(--border-subtle)', border:'1px solid var(--border-subtle)', color:muted,
                opacity: testing ? 0.6 : 1,
              }}>
                {testing ? '⏳ Проверяем...' : '🧪 Проверить URL'}
              </button>
            </div>

            {testResult && (
              <div style={{
                marginTop:12, padding:'10px 14px', borderRadius:8, fontSize:12,
                background: testResult.success ? 'rgba(143,188,106,0.08)' : 'rgba(199,92,92,0.08)',
                border: `1px solid ${testResult.success ? 'rgba(143,188,106,0.25)' : 'rgba(199,92,92,0.25)'}`,
                color: testResult.success ? success : error,
              }}>
                {testResult.success ? `✅ ${testResult.message}` : `❌ ${testResult.error}`}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize:13, color:error }}>URL не определён. Проверьте переменные окружения.</div>
        )}
      </div>

      {/* Instructions */}
      <div style={{ background:card, border:'1px solid var(--border-subtle)', borderRadius:14, padding:'20px 24px' }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>📋 Как настроить Webhook</div>
        <div style={{ fontSize:13, color:muted, lineHeight:2 }}>
          <div style={{ marginBottom:4 }}>
            <span style={{ fontWeight:600, color:cream }}>1.</span> Откройте{' '}
            <a href={status?.testnet ? 'https://t.me/CryptoTestnetBot' : 'https://t.me/CryptoBot'} target="_blank" rel="noopener" style={{ color:gold, textDecoration:'underline' }}>
              @{status?.testnet ? 'CryptoTestnetBot' : 'CryptoBot'}
            </a>
          </div>
          <div style={{ marginBottom:4 }}>
            <span style={{ fontWeight:600, color:cream }}>2.</span> Отправьте <code style={{ background:'rgba(200,168,110,0.1)', padding:'2px 6px', borderRadius:4, color:cream }}>/pay</code>
          </div>
          <div style={{ marginBottom:4 }}>
            <span style={{ fontWeight:600, color:cream }}>3.</span> Выберите приложение «{status?.app?.name || '...'}»
          </div>
          <div style={{ marginBottom:4 }}>
            <span style={{ fontWeight:600, color:cream }}>4.</span> Нажмите <b style={{ color:cream }}>Webhooks</b>
          </div>
          <div style={{ marginBottom:4 }}>
            <span style={{ fontWeight:600, color:cream }}>5.</span> Вставьте URL (кнопка «📋 Копировать» выше)
          </div>
          <div>
            <span style={{ fontWeight:600, color:cream }}>6.</span> Нажмите «🧪 Проверить URL» для подтверждения
          </div>
        </div>
      </div>
    </div>
  );
}

// Инструкция по пополнению кошелька
function WalletGuide() {
  const sectionStyle: React.CSSProperties = { background:card, border:'1px solid var(--border-subtle)', borderRadius:14, padding:'20px 24px', marginBottom:16 };
  const stepStyle: React.CSSProperties = { marginBottom:6, lineHeight:1.8 };
  const linkStyle: React.CSSProperties = { color:gold, textDecoration:'underline' };
  const codeStyle: React.CSSProperties = { background:'var(--border-subtle)', padding:'2px 8px', borderRadius:4, color:cream, fontSize:12 };
  const badgeStyle: React.CSSProperties = { display:'inline-block', fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:6, marginBottom:14 };

  return (
    <div>
      <div style={{ fontSize:12, color:muted, marginBottom:20 }}>💡 Как оплатить мероприятие с платным репостом</div>

      {/* Шаг 1 — Создать кошелёк */}
      <div style={sectionStyle}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>1️⃣ Создайте крипто-кошелёк</div>
        <div style={{ ...badgeStyle, background:'rgba(143,188,106,0.12)', color:success }}>БЕСПЛАТНО</div>
        <div style={{ fontSize:13, color:muted, lineHeight:1.9 }}>
          <div style={stepStyle}>
            <span style={{ fontWeight:600, color:cream }}>1.</span> Откройте{' '}
            <a href="https://t.me/send?start=r-6yfu9" target="_blank" rel="noopener" style={linkStyle}>@send (Crypto Bot)</a>
            {' '}в Telegram
          </div>
          <div style={stepStyle}>
            <span style={{ fontWeight:600, color:cream }}>2.</span> Нажмите <b style={{ color:cream }}>Start</b> — кошелёк создаётся автоматически
          </div>
          <div style={stepStyle}>
            <span style={{ fontWeight:600, color:cream }}>3.</span> Готово! Теперь у вас есть кошелёк USDT (TRC-20)
          </div>
        </div>
      </div>

      {/* Шаг 2 — Пополнить */}
      <div style={sectionStyle}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>2️⃣ Пополните кошелёк USDT</div>
        <div style={{ ...badgeStyle, background:'rgba(212,168,83,0.12)', color:warm }}>ВЫБЕРИТЕ СПОСОБ</div>

        {/* Способ А — Анакондос */}
        <div style={{ background:'var(--bg-card-hover)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'16px 18px', marginBottom:12 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:8, color:cream }}>🅰️ Через Anakondos (обмен P2P)</div>
          <div style={{ fontSize:13, color:muted, lineHeight:1.9 }}>
            <div style={stepStyle}>
              <span style={{ fontWeight:600, color:cream }}>1.</span> Откройте{' '}
              <a href="https://t.me/anakondos_bot?start=jrWvxN" target="_blank" rel="noopener" style={linkStyle}>@anakondos_bot</a>
            </div>
            <div style={stepStyle}>
              <span style={{ fontWeight:600, color:cream }}>2.</span> Выберите <b style={{ color:cream }}>Купить USDT</b> → укажите сумму
            </div>
            <div style={stepStyle}>
              <span style={{ fontWeight:600, color:cream }}>3.</span> Оплатите по реквизитам (карта / СБП)
            </div>
            <div style={stepStyle}>
              <span style={{ fontWeight:600, color:cream }}>4.</span> USDT придут в ваш{' '}
              <a href="https://t.me/send?start=r-6yfu9" target="_blank" rel="noopener" style={linkStyle}>Crypto Bot</a> кошелёк
            </div>
          </div>
          <div style={{ fontSize:11, color:muted, marginTop:8, padding:'8px 12px', background:'var(--border-subtle)', borderRadius:8 }}>
            💡 Также можно использовать{' '}
            <a href="https://Anakondos.com" target="_blank" rel="noopener" style={linkStyle}>Anakondos.com</a>
          </div>
        </div>

        {/* Способ Б — Картой РФ */}
        <div style={{ background:'var(--bg-card-hover)', border:'1px solid var(--border-subtle)', borderRadius:10, padding:'16px 18px' }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:8, color:cream }}>🅱️ Картой РФ (ручной перевод)</div>
          <div style={{ fontSize:13, color:muted, lineHeight:1.9 }}>
            <div style={stepStyle}>
              <span style={{ fontWeight:600, color:cream }}>1.</span> Перейдите по ссылке:{' '}
              <a href="https://app.leadteh.ru/w/fPwZk" target="_blank" rel="noopener" style={linkStyle}>Оплата картой</a>
            </div>
            <div style={stepStyle}>
              <span style={{ fontWeight:600, color:cream }}>2.</span> Введите сумму и оплатите банковской картой
            </div>
            <div style={stepStyle}>
              <span style={{ fontWeight:600, color:cream }}>3.</span> Отправьте квитанцию об оплате{' '}
              <a href="https://t.me/andrewsochy" target="_blank" rel="noopener" style={linkStyle}>@andrewsochy</a> в Telegram
            </div>
            <div style={stepStyle}>
              <span style={{ fontWeight:600, color:cream }}>4.</span> Мы пополним ваш Crypto Bot кошелёк вручную
            </div>
          </div>
          <div style={{ fontSize:12, marginTop:10, padding:'10px 14px', background:'rgba(212,168,83,0.08)', border:'1px solid rgba(212,168,83,0.2)', borderRadius:8, color:warm }}>
            ⚠️ Комиссия за перевод картой: <b>10%</b> (например, оплата 1100₽ → на кошелёк ~1000₽ в USDT)
          </div>
        </div>
      </div>

      {/* Шаг 3 — Оплатить */}
      <div style={sectionStyle}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>3️⃣ Оплатите мероприятие</div>
        <div style={{ fontSize:13, color:muted, lineHeight:1.9 }}>
          <div style={stepStyle}>
            <span style={{ fontWeight:600, color:cream }}>1.</span> Создайте мероприятие с галочкой <b style={{ color:cream }}>💰 Платный репост</b>
          </div>
          <div style={stepStyle}>
            <span style={{ fontWeight:600, color:cream }}>2.</span> Укажите стоимость за репост и количество репостов
          </div>
          <div style={stepStyle}>
            <span style={{ fontWeight:600, color:cream }}>3.</span> Система посчитает бюджет + 20% комиссия сервиса
          </div>
          <div style={stepStyle}>
            <span style={{ fontWeight:600, color:cream }}>4.</span> Нажмите <b style={{ color:cream }}>💳 Перейти к оплате</b> — откроется Crypto Bot
          </div>
          <div style={stepStyle}>
            <span style={{ fontWeight:600, color:cream }}>5.</span> Подтвердите оплату → мероприятие активируется автоматически!
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div style={sectionStyle}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:12 }}>❓ Частые вопросы</div>
        <div style={{ fontSize:13, color:muted, lineHeight:1.8 }}>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontWeight:600, color:cream, marginBottom:2 }}>Что такое USDT?</div>
            Стейблкоин привязанный к доллару США (1 USDT ≈ 1$). Используется для моментальных переводов без банков.
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontWeight:600, color:cream, marginBottom:2 }}>Безопасно ли это?</div>
            Да. Crypto Bot — официальный сервис от команды Telegram с миллионами пользователей.
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontWeight:600, color:cream, marginBottom:2 }}>Куда уходят деньги при оплате мероприятия?</div>
            Бюджет замораживается и выплачивается пользователям после одобрения их репостов. 20% — комиссия сервиса.
          </div>
          <div>
            <div style={{ fontWeight:600, color:cream, marginBottom:2 }}>Остаток переносится?</div>
            Да, неиспользованный бюджет остаётся на следующее мероприятие.
          </div>
        </div>
      </div>
    </div>
  );
}


// Кнопка миграции БД (суперадмин)
function MigrateButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await fetch('/api/admin/migrate');
      const data = await res.json();
      if (data.success) {
        setResult('✅');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setResult('❌');
      }
    } catch {
      setResult('❌');
    }
    setBusy(false);
  };

  return (
    <button
      onClick={run} disabled={busy}
      style={{ padding:'8px 16px', background:'transparent', border:'1px solid var(--border-subtle)', borderRadius:8, color: result === '✅' ? success : result === '❌' ? error : muted, cursor:'pointer', fontSize:12, opacity: busy ? 0.5 : 1, transition:'all 0.2s' }}
      title="Миграция базы данных (prisma db push)"
    >
      {busy ? '⏳' : result || '🔧 DB'}
    </button>
  );
}
