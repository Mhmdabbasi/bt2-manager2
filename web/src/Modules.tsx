import { useEffect, useState, type FormEvent } from 'react';
import { AlertCircle, Boxes, CheckCircle2, LoaderCircle, PackageCheck, Plus, RefreshCw, Users } from 'lucide-react';
import { api } from './api';

type Props = { connected: boolean };

export function PackagesPage({ connected }: Props) {
  const [packages, setPackages] = useState<Awaited<ReturnType<typeof api.packages>>>([]);
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof api.profiles>>>([]);
  const [name, setName] = useState('');
  const [profile, setProfile] = useState('');
  const [prefix, setPrefix] = useState('BT');
  const [validity, setValidity] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [saved, available] = await Promise.all([api.packages(), connected ? api.profiles() : Promise.resolve([])]);
      setPackages(saved); setProfiles(available);
      if (!profile && available[0]) setProfile(available[0].name);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل الباقات'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [connected]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      await api.createPackage({ name, service_type: 'hotspot', profile_name: profile, username_prefix: prefix.toUpperCase(), validity_label: validity, price_minor: 0, currency: 'YER' });
      setName(''); setValidity(''); setOpen(false); setSuccess('تم حفظ الباقة وربطها بملف HotSpot المحدد.'); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر حفظ الباقة'); }
    finally { setBusy(false); }
  };

  return <>
    <div className="page-heading"><div><div className="eyebrow"><PackageCheck size={14} /> كتالوج الخدمة</div><h1>الباقات</h1><p>كل باقة مرتبطة بملف خدمة فعلي؛ إنشاء المستخدمين المالي والبيع خارج هذا المسار.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> تحديث</button><button className="button button-primary" onClick={() => setOpen((v) => !v)} disabled={!connected}><Plus size={16} /> باقة جديدة</button></div></div>
    {!connected && <div className="inline-error page-error"><AlertCircle size={16} />اتصل بالراوتر أولاً لقراءة ملفات HotSpot وربط الباقات بها.</div>}
    {error && <div className="inline-error page-error"><AlertCircle size={16} />{error}</div>}{success && <div className="success-banner"><CheckCircle2 size={17} />{success}</div>}
    {open && <section className="surface create-user-panel"><div className="surface-heading"><div><h3>تعريف باقة HotSpot</h3><p>بيانات تشغيلية للتوليد وليست نقطة بيع أو تحصيلاً.</p></div></div><form className="module-form" onSubmit={submit}><label className="field"><span>اسم الباقة <b>*</b></span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="مثال: يوم واحد" /></label><label className="field"><span>ملف HotSpot <b>*</b></span><select value={profile} onChange={(e) => setProfile(e.target.value)} required><option value="" disabled>اختر ملفاً من الراوتر</option>{profiles.map((p) => <option key={p.id || p.name} value={p.name}>{p.name}</option>)}</select></label><label className="field"><span>بادئة اسم المستخدم <b>*</b></span><input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} required maxLength={8} dir="ltr" /></label><label className="field"><span>وصف الصلاحية</span><input value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="مثال: 24 ساعة" maxLength={80} /></label><button className="button button-primary" disabled={busy || !profiles.length}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} حفظ الباقة</button></form></section>}
    <section className="module-grid">{loading ? <div className="surface module-empty"><LoaderCircle size={20} className="spin" /> جارٍ تحميل الباقات…</div> : packages.length ? packages.map((item) => <article className="surface package-card" key={item.id}><div className="package-mark"><PackageCheck size={19} /></div><div className="package-copy"><strong>{item.name}</strong><span>HotSpot · {item.profile_name}</span><small>البادئة <bdi>{item.username_prefix}</bdi>{item.validity_label ? ` · ${item.validity_label}` : ''}</small></div><span className={`state-badge ${item.enabled ? 'state-on' : 'state-off'}`}><i />{item.enabled ? 'مفعّلة' : 'متوقفة'}</span></article>) : <div className="surface module-empty"><div className="empty-icon"><PackageCheck size={18} /></div><strong>لا توجد باقات معرفة بعد</strong><span>{connected ? 'أنشئ باقة بعد اختيار ملف HotSpot من الراوتر.' : 'اتصل بالراوتر أولاً لقراءة الملفات المتاحة.'}</span></div>}</section>
  </>;
}

export function DistributorsPage() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.distributors>>>([]);
  const [name, setName] = useState(''); const [contact, setContact] = useState(''); const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const load = async () => { try { setItems(await api.distributors()); setError(''); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل الموزعين'); } };
  useEffect(() => { void load(); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setSuccess(''); try { await api.createDistributor({ name, contact, notes }); setName(''); setContact(''); setNotes(''); setOpen(false); setSuccess('تم تعريف الموزع. لا توجد عمليات بيع أو تحصيل في هذه الوحدة.'); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر حفظ الموزع'); } finally { setBusy(false); } };
  return <>
    <div className="page-heading"><div><div className="eyebrow"><Users size={14} /> شبكة التوزيع</div><h1>الموزعون</h1><p>تعريف الجهات التي ستستلم مخزوناً مخصصاً، دون POS أو معاملات مالية.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => void load()}><RefreshCw size={15} /> تحديث</button><button className="button button-primary" onClick={() => setOpen((v) => !v)}><Plus size={16} /> موزع جديد</button></div></div>
    {error && <div className="inline-error page-error"><AlertCircle size={16} />{error}</div>}{success && <div className="success-banner"><CheckCircle2 size={17} />{success}</div>}
    {open && <section className="surface create-user-panel"><div className="surface-heading"><div><h3>تعريف موزع</h3><p>سجل اسم الجهة ووسيلة التواصل فقط.</p></div></div><form className="module-form" onSubmit={submit}><label className="field"><span>اسم الموزع <b>*</b></span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></label><label className="field"><span>رقم/وسيلة تواصل</span><input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={160} /></label><label className="field field-wide"><span>ملاحظات داخلية</span><input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></label><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} حفظ الموزع</button></form></section>}
    <section className="module-grid">{items.length ? items.map((item) => <article className="surface distributor-card" key={item.id}><div className="distributor-avatar">{item.name.slice(0,1)}</div><div className="package-copy"><strong>{item.name}</strong><span>{item.contact || 'لا توجد وسيلة تواصل'}</span><small>{item.notes || 'لا توجد ملاحظات'}</small></div><span className={`state-badge ${item.active ? 'state-on' : 'state-off'}`}><i />{item.active ? 'نشط' : 'موقوف'}</span></article>) : <div className="surface module-empty"><div className="empty-icon"><Users size={18} /></div><strong>ابدأ بتعريف الموزعين</strong><span>يمكنك تخصيص مخزون لهم بعد إنشاء دفعات HotSpot.</span></div>}</section>
  </>;
}

export function InventoryPage({ connected }: Props) {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof api.inventory>> | null>(null);
  const [vouchers, setVouchers] = useState<Awaited<ReturnType<typeof api.vouchers>>['items']>([]);
  const [distributors, setDistributors] = useState<Awaited<ReturnType<typeof api.distributors>>>([]);
  const [selected, setSelected] = useState<string[]>([]); const [action, setAction] = useState<'allocate'|'transfer'|'return'>('allocate'); const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const load = async () => { try { const [stock, page, owners] = await Promise.all([api.inventory(),api.vouchers(0,200),api.distributors()]); setSnapshot(stock); setVouchers(page.items); setDistributors(owners); setError(''); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل المخزون'); } };
  useEffect(() => { void load(); }, [connected]);
  const candidates = vouchers.filter((v) => v.state === 'active' && (action === 'allocate' ? v.owner === 'المشغّل' : action === 'transfer' ? v.owner !== 'المشغّل' : v.owner !== 'المشغّل'));
  const toggle = (id: string) => setSelected((prev) => prev.includes(id) ? prev.filter((v) => v !== id) : [...prev,id]);
  const submit = async () => { if (!selected.length) return; setBusy(true); setError(''); setSuccess(''); try { const result=await api.inventoryMovement({action,voucher_ids:selected,distributor_id:action==='return' ? undefined : target}); setSuccess(`تم تسجيل ${result.count} حركة مخزون.`); setSelected([]); await load(); } catch(err) { setError(err instanceof Error ? err.message : 'تعذرت حركة المخزون'); } finally { setBusy(false); } };
  return <>
    <div className="page-heading"><div><div className="eyebrow"><Boxes size={14} /> حركة المخزون</div><h1>المخزون والتخصيص</h1><p>سجل حركات إصدار وتخصيص وتحويل وإرجاع؛ لا توجد مبيعات أو تحصيلات مالية.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => void load()}><RefreshCw size={15} /> تحديث</button></div></div>
    {error && <div className="inline-error page-error"><AlertCircle size={16} />{error}</div>}{success && <div className="success-banner"><CheckCircle2 size={17} />{success}</div>}
    <div className="inventory-balance-grid">{snapshot?.balances.map((b) => <div className="surface inventory-balance" key={b.owner_id}><span className="mini-stat-icon green"><Boxes size={16} /></span><span><small>{b.owner_name}</small><strong>{b.count} قسيمة</strong></span></div>)}{!snapshot?.balances.length && <div className="surface inventory-balance"><span className="mini-stat-icon blue"><Boxes size={16} /></span><span><small>إجمالي المخزون</small><strong>{snapshot?.total ?? 0} قسيمة</strong></span></div>}</div>
    <section className="surface allocation-panel"><div className="surface-heading"><div><h3>تخصيص حركة</h3><p>اختر قسائم نشطة وسجّل التحويل في دفتر غير قابل للمحو.</p></div><span className="heading-icon"><Boxes size={17} /></span></div><div className="allocation-controls"><label className="field"><span>نوع الحركة</span><select value={action} onChange={(e) => {setAction(e.target.value as typeof action);setSelected([]);}}><option value="allocate">تخصيص من المخزون المركزي</option><option value="transfer">تحويل بين موزعين</option><option value="return">إرجاع للمخزون المركزي</option></select></label>{action !== 'return' && <label className="field"><span>الموزع المستهدف</span><select value={target} onChange={(e) => setTarget(e.target.value)}><option value="">اختر موزعاً</option>{distributors.filter((d) => d.active).map((d) => <option value={d.id} key={d.id}>{d.name}</option>)}</select></label>}<button className="button button-primary" disabled={busy || !selected.length || (action !== 'return' && !target)} onClick={() => void submit()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Boxes size={15} />} تنفيذ الحركة ({selected.length})</button></div>
      <div className="allocation-list">{candidates.length ? candidates.slice(0,80).map((v) => <label className="allocation-voucher" key={v.id}><input type="checkbox" checked={selected.includes(v.id)} onChange={() => toggle(v.id)} /><span className="voucher-user-name">{v.username}</span><span className="profile-badge">{v.package}</span><small>{v.owner}</small></label>) : <div className="muted-empty">لا توجد قسائم مناسبة لهذه الحركة. أنشئ دفعة أولاً أو غيّر نوع الحركة.</div>}</div>
    </section>
    <section className="surface table-panel inventory-events"><div className="table-heading"><div><h3>سجل الحركات الأخير</h3><p>كل حركة تسجل كسطر مستقل؛ لا يعاد كتابة التاريخ السابق.</p></div><span className="profile-count">{snapshot?.events.length ?? 0} حركة</span></div>{snapshot?.events.length ? <div className="table-scroll"><table><thead><tr><th>الوقت</th><th>القسيمة</th><th>الحركة</th><th>من</th><th>إلى</th></tr></thead><tbody>{snapshot.events.slice(0,30).map((e) => <tr key={e.id}><td>{new Date(e.created_at).toLocaleString('ar')}</td><td><strong>{e.username}</strong></td><td>{movementLabel(e.type)}</td><td>{e.from}</td><td>{e.to}</td></tr>)}</tbody></table></div> : <div className="table-empty">لا توجد حركات مخزون مسجلة بعد.</div>}</section>
  </>;
}

function movementLabel(type: string) { return ({ issue: 'إصدار', allocate: 'تخصيص', transfer: 'تحويل', return: 'إرجاع', adjustment: 'تسوية' } as Record<string,string>)[type] || type; }
