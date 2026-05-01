'use client';
import { useEffect, useState, useRef } from 'react';

type Org = { id: string; first_name?: string|null; username?: string|null; status: string; isSuperAdmin: boolean };
type Ev = { id: string; title: string; description?: string|null; date?: string|null; location?: string|null; repostUrl?: string|null; imageUrl?: string|null; price?: number|null; discountPrice?: number|null; isActive: boolean; _count?: { registrations: number } };
type Reg = { id: string; status: string; proofUrl?: string|null; storyUrl?: string|null; adminNote?: string|null; createdAt: string; updatedAt: string; user: { first_name?: string|null; username?: string|null }; event: { id?: string; title?: string|null } };
type OrgItem = { id: string; telegram_id: string; first_name?: string|null; username?: string|null; photo_url?: string|null; status: string; isSuperAdmin: boolean; createdAt: string; _count?: { events: number } };

const gold = '#c8a86e'; const warm = '#d4a853'; const cream = '#f5e6c8';
const success = '#8fbc6a'; const error = '#c75c5c'; const muted = '#8a7a66';
const card = '#2a2218'; const bg = '#1a1410';

const inp: React.CSSProperties = { width:'100%', padding:'10px 14px', background:'rgba(200,168,110,0.05)', border:'1px solid rgba(200,168,110,0.18)', borderRadius:8, color:'#f0e6d6', fontSize:14, outline:'none' };

export default function AdminClient({ organizer, onLogout }: { organizer: Org; onLogout: () => void }) {
  const [tab, setTab] = useState('pending');
  const [events, setEvents] = useState<Ev[]>([]);
  const [regs, setRegs] = useState<Reg[]>([]);
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [editEv, setEditEv] = useState<Ev|null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState('');
  const [pushState, setPushState] = useState<Record<string, { status: string; msg?: string }>>({});

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
    if (!confirm('Удалить мероприятие?')) return;
    await fetch('/api/admin/events', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ eventId: id }) });
    await load();
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
    <button onClick={() => setTab(id)} style={{ padding:'9px 18px', fontSize:13, fontWeight:600, borderRadius:8, background: tab===id ? 'rgba(200,168,110,0.12)' : 'transparent', border: tab===id ? '1px solid rgba(200,168,110,0.4)' : '1px solid rgba(255,255,255,0.08)', color: tab===id ? gold : muted, cursor:'pointer', display:'inline-flex', gap:8, alignItems:'center' }}>
      {label}
      {count !== undefined && <span style={{ background:'rgba(255,255,255,0.08)', borderRadius:12, padding:'1px 7px', fontSize:11 }}>{count}</span>}
    </button>
  );

  return (
    <div style={{ minHeight:'100vh', background:bg, color:'#f0e6d6', fontFamily:'Inter,sans-serif' }}>
      {/* Шапка */}
      <div style={{ padding:'18px 28px', borderBottom:'1px solid rgba(200,168,110,0.12)', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
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
          <button onClick={onLogout} style={{ padding:'8px 16px', background:'transparent', border:'1px solid rgba(200,168,110,0.2)', borderRadius:8, color:muted, cursor:'pointer', fontSize:12 }}>Выйти</button>
        </div>
      </div>

      {/* Табы */}
      <div style={{ padding:'14px 28px', borderBottom:'1px solid rgba(200,168,110,0.08)', display:'flex', gap:8, flexWrap:'wrap' }}>
        <TabBtn id="pending" label="🔍 На проверке" count={pending.length} />
        <TabBtn id="approved" label="✅ Одобренные" count={approved.length} />
        <TabBtn id="rejected" label="❌ Отклонённые" count={rejected.length} />
        <TabBtn id="events" label="📅 Мероприятия" count={events.length} />
        {organizer.isSuperAdmin && <TabBtn id="organizers" label="👥 Организаторы" count={pendingOrgs.length} />}
      </div>

      <div style={{ padding:'24px 28px' }}>
        {/* НА ПРОВЕРКЕ */}
        {tab === 'pending' && (
          <div>
            {pending.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:muted }}><div style={{ fontSize:48, marginBottom:12 }}>🎉</div><div style={{ fontSize:16, fontWeight:600 }}>Всё проверено!</div></div>
            ) : pending.map(r => (
              <div key={r.id} style={{ background:card, border:'1px solid rgba(200,168,110,0.15)', borderRadius:14, overflow:'hidden', marginBottom:20 }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid rgba(200,168,110,0.08)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
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
                  <div style={{ padding:'14px 20px', borderBottom:'1px solid rgba(200,168,110,0.08)' }}>
                    <div style={{ fontSize:10, color:muted, marginBottom:10 }}>СКРИНШОТ</div>
                    <img src={r.proofUrl} alt="proof" style={{ maxWidth:'100%', maxHeight:500, borderRadius:10, border:'1px solid rgba(200,168,110,0.15)', objectFit:'contain', display:'block' }} />
                  </div>
                )}
                {r.storyUrl && (
                  <div style={{ padding:'10px 20px', borderBottom:'1px solid rgba(200,168,110,0.08)' }}>
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
        {tab === 'events' && (
          <div>
            {(editEv || creating) ? (
              <EventForm event={editEv} onSave={saveEvent} onCancel={() => { setEditEv(null); setCreating(false); }} saving={busy==='save'} />
            ) : (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                  <div style={{ fontSize:12, color:muted }}>Мероприятия ({events.length})</div>
                  <button onClick={() => setCreating(true)} style={{ padding:'9px 18px', fontSize:13, fontWeight:700, borderRadius:8, background:'linear-gradient(135deg,rgba(200,168,110,0.15),rgba(212,168,83,0.15))', border:'1px solid rgba(200,168,110,0.4)', color:gold, cursor:'pointer' }}>+ Создать</button>
                </div>
                {events.map(ev => (
                  <div key={ev.id} style={{ background:card, border:`1px solid ${ev.isActive ? 'rgba(200,168,110,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius:12, padding:'16px 20px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                        <span style={{ fontWeight:700, fontSize:15 }}>{ev.title}</span>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, background: ev.isActive ? 'rgba(143,188,106,0.12)' : 'rgba(255,255,255,0.05)', color: ev.isActive ? success : muted }}>{ev.isActive ? 'АКТИВНО' : 'СКРЫТО'}</span>
                      </div>
                      <div style={{ fontSize:12, color:muted }}>
                        {ev.date && `📅 ${new Date(ev.date).toLocaleDateString('ru-RU')} · `}
                        {ev.location && `📍 ${ev.location} · `}
                        <span style={{ color:gold }}>заявок: {ev._count?.registrations ?? 0}</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={() => pushEvent(ev.id)} style={{ padding:'8px 14px', fontSize:12, fontWeight:700, borderRadius:8, background: pushState[ev.id]?.status==='confirm' ? 'rgba(212,168,83,0.15)' : pushState[ev.id]?.status==='done' ? 'rgba(143,188,106,0.12)' : pushState[ev.id]?.status==='error' ? 'rgba(199,92,92,0.1)' : 'rgba(200,168,110,0.08)', border: `1px solid ${pushState[ev.id]?.status==='confirm' ? 'rgba(212,168,83,0.5)' : pushState[ev.id]?.status==='done' ? 'rgba(143,188,106,0.35)' : pushState[ev.id]?.status==='error' ? 'rgba(199,92,92,0.35)' : 'rgba(200,168,110,0.25)'}`, color: pushState[ev.id]?.status==='confirm' ? warm : pushState[ev.id]?.status==='done' ? success : pushState[ev.id]?.status==='error' ? error : gold, cursor:'pointer', whiteSpace:'nowrap' }} disabled={pushState[ev.id]?.status==='sending'}>
                        {pushState[ev.id]?.status==='sending' ? '📤...' : pushState[ev.id]?.status==='confirm' ? '❓ Точно?' : pushState[ev.id]?.status==='done' ? `✅ ${pushState[ev.id]?.msg}` : pushState[ev.id]?.status==='error' ? '❌' : '📣'}
                      </button>
                      <button onClick={() => setEditEv(ev)} style={{ padding:'8px 14px', fontSize:12, fontWeight:700, borderRadius:8, background:'rgba(200,168,110,0.08)', border:'1px solid rgba(200,168,110,0.25)', color:gold, cursor:'pointer' }}>✏️</button>
                      <button onClick={() => delEvent(ev.id)} style={{ padding:'8px 12px', fontSize:12, fontWeight:700, borderRadius:8, background:'rgba(199,92,92,0.07)', border:'1px solid rgba(199,92,92,0.2)', color:error, cursor:'pointer' }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ОРГАНИЗАТОРЫ (суперадмин) */}
        {tab === 'organizers' && organizer.isSuperAdmin && (
          <div>
            <div style={{ fontSize:12, color:muted, marginBottom:20 }}>Организаторы ({orgs.length})</div>
            {orgs.map(o => (
              <div key={o.id} style={{ background:card, border:'1px solid rgba(200,168,110,0.12)', borderRadius:12, padding:'16px 20px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center', gap:16 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{o.first_name || '—'}{o.username && <span style={{ color:muted, fontWeight:400, fontSize:13 }}> @{o.username}</span>}{o.isSuperAdmin && <span style={{ fontSize:11, color:warm, marginLeft:8 }}>👑</span>}</div>
                  <div style={{ fontSize:11, color:muted, marginTop:2 }}>Мероприятий: {o._count?.events ?? 0} · {new Date(o.createdAt).toLocaleDateString('ru-RU')}</div>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  {o.status === 'PENDING' ? (
                    <>
                      <button disabled={busy===o.id} onClick={() => reviewOrg(o.id,'approve')} className="warm-btn-approve" style={{ padding:'8px 16px', fontSize:12 }}>✓ Одобрить</button>
                      <button disabled={busy===o.id} onClick={() => reviewOrg(o.id,'reject')} className="warm-btn-reject" style={{ padding:'8px 16px', fontSize:12 }}>✗ Отклонить</button>
                    </>
                  ) : (
                    <span style={{ fontSize:11, fontWeight:700, color: o.status==='APPROVED' ? success : error }}>{o.status==='APPROVED' ? '✅ Одобрен' : '❌ Отклонён'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Таблица заявок
function RegList({ rows, color, empty }: { rows: Reg[]; color: string; empty: string }) {
  if (rows.length === 0) return <div style={{ textAlign:'center', padding:'60px 0', color:muted }}>{empty}</div>;
  return (
    <div style={{ overflowX:'auto', borderRadius:12, border:'1px solid rgba(200,168,110,0.12)' }}>
      <table style={{ width:'100%', borderCollapse:'collapse' }}>
        <thead><tr style={{ background:'rgba(200,168,110,0.03)', borderBottom:'1px solid rgba(200,168,110,0.12)' }}>
          {['Имя','@username','Мероприятие','Дата'].map(h => <th key={h} style={{ padding:'11px 16px', textAlign:'left', fontSize:11, fontWeight:600, color:muted, textTransform:'uppercase' }}>{h}</th>)}
        </tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}><td style={{ padding:'13px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:13, fontWeight:600, color }}>{r.user.first_name||'—'}</td>
          <td style={{ padding:'13px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:13, color:muted }}>{r.user.username ? `@${r.user.username}` : '—'}</td>
          <td style={{ padding:'13px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:12, color:gold }}>{r.event.title||'—'}</td>
          <td style={{ padding:'13px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)', fontSize:11, color:muted }}>{new Date(r.updatedAt).toLocaleString('ru-RU')}</td></tr>
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
  const imgRef = useRef<HTMLInputElement>(null);

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

  const submit = () => onSave({ title, description:desc||null, date:date||null, location:loc||null, repostUrl:url||null, isActive:active, imageUrl:img||null, price: price ? Number(price) : null, discountPrice: discountPrice ? Number(discountPrice) : null });

  return (
    <div style={{ background:card, border:'1px solid rgba(200,168,110,0.15)', borderRadius:14, padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ fontSize:12, color:muted }}>{event ? 'Редактировать' : 'Новое мероприятие'}</div>
        <button onClick={onCancel} style={{ fontSize:12, color:muted, background:'none', border:'none', cursor:'pointer' }}>← Назад</button>
      </div>
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
              <img src={img} alt="preview" style={{ maxWidth:'100%', maxHeight:200, borderRadius:10, border:'1px solid rgba(200,168,110,0.15)', objectFit:'contain', display:'block', marginBottom:8 }} />
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
        <div style={{ gridColumn:'1/-1' }}>
          <button onClick={submit} disabled={saving||!title} className="warm-btn-primary" style={{ padding:'13px 28px', fontSize:14 }}>{saving ? 'Сохраняем...' : event ? '💾 Сохранить' : '+ Создать'}</button>
        </div>
      </div>
    </div>
  );
}
