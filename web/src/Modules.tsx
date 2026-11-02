import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertCircle, Archive, ArrowUpLeft, Boxes, CheckCircle2, Clock3, Copy, Download, Eye, LoaderCircle, Network, PackageCheck, Pencil, Plus, Power, Printer, RefreshCw, Router, Save, Search, Settings2, ShieldCheck, Users, Wifi, X } from 'lucide-react';
import { api, type CardTemplateDocument, type CardTemplateField, type DistributorPackagePolicy, type UserManagerSession } from './api';
import { TablePagination } from './TablePagination';

type Props = { connected: boolean };

export function PackagesPage({ connected }: Props) {
  const [packages, setPackages] = useState<Awaited<ReturnType<typeof api.packages>>>([]);
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof api.profiles>>>([]);
  const [userManagerProfiles, setUserManagerProfiles] = useState<Awaited<ReturnType<typeof api.userManager>>['profiles']>([]);
  const [serviceType, setServiceType] = useState<'hotspot' | 'user_manager'>('hotspot');
  const [name, setName] = useState('');
  const [profile, setProfile] = useState('');
  const [retailPrice, setRetailPrice] = useState('0');
  const [distributorPrice, setDistributorPrice] = useState('0');
  const [prefix, setPrefix] = useState('BT');
  const [validity, setValidity] = useState('');
  const [open, setOpen] = useState(false);
  const [editingID, setEditingID] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [saved, available] = await Promise.all([api.packages(), connected ? api.profiles() : Promise.resolve([])]);
      setPackages(saved); setProfiles(available);
      let managerProfiles: Awaited<ReturnType<typeof api.userManager>>['profiles'] = [];
      if (connected) {
        try { managerProfiles = (await api.userManager()).profiles; } catch { managerProfiles = []; }
      }
      setUserManagerProfiles(managerProfiles);
      const choices = serviceType === 'hotspot' ? available.map((item) => item.name) : managerProfiles.map((item) => item.name);
      if (!choices.includes(profile)) setProfile(choices[0] ?? '');
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل الباقات أو ملفات الخدمة'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [connected, serviceType]);
  const profileChoices = serviceType === 'hotspot' ? profiles.map((item) => ({ name: item.name, details: `${item.address_pool || '—'} · ${item.session_timeout || 'بدون حد زمني'} · ${item.shared_users || 'مستخدم واحد'}` })) : userManagerProfiles.map((item) => ({ name: item.name, details: Object.entries(item.properties).filter(([key]) => key !== 'name' && key !== '.id').slice(0, 5).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'لا توجد خصائص إضافية في اللقطة المحفوظة' }));
  const selectedProfileDetails = profileChoices.find((item) => item.name === profile)?.details ?? '';

  const packageBody = () => ({ name, service_type: serviceType, profile_name: profile, username_prefix: prefix.toUpperCase(), validity_label: validity, price_minor: Math.round(Number(retailPrice) * 100), distributor_price_minor: Math.round(Number(distributorPrice) * 100), currency: 'YER' });
  const beginEdit = (item: Awaited<ReturnType<typeof api.packages>>[number]) => {
    setEditingID(item.id); setName(item.name); setServiceType(item.service_type); setProfile(item.profile_name); setPrefix(item.username_prefix); setValidity(item.validity_label); setRetailPrice((item.price_minor / 100).toFixed(2)); setDistributorPrice((item.distributor_price_minor / 100).toFixed(2)); setOpen(true);
  };
  const stopPackage = async (item: Awaited<ReturnType<typeof api.packages>>[number]) => {
    if (!window.confirm(`سيتم إيقاف الباقة «${item.name}» ومنع توليد دفعات جديدة بها. هل تريد المتابعة؟`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await api.disablePackage(item.id); setSuccess(`تم إيقاف الباقة «${item.name}».`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذر إيقاف الباقة'); }
    finally { setBusy(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      if (editingID) await api.updatePackage(editingID, packageBody()); else await api.createPackage(packageBody());
      const action = editingID ? 'تحديث' : 'حفظ';
      setName(''); setValidity(''); setRetailPrice('0'); setDistributorPrice('0'); setEditingID(''); setOpen(false); setSuccess(`تم ${action} الباقة وربطها بملف ${serviceType === 'hotspot' ? 'HotSpot' : 'User Manager'} المحدد.`); await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر حفظ الباقة'); }
    finally { setBusy(false); }
  };

  return <>
    <div className="page-heading"><div><div className="eyebrow"><PackageCheck size={14} /> كتالوج الخدمة</div><h1>الباقات</h1><p>كل باقة مرتبطة بملف خدمة فعلي؛ إنشاء المستخدمين المالي والبيع خارج هذا المسار.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> تحديث</button><button className="button button-primary" onClick={() => { const next = !open; setOpen(next); if (next) { setEditingID(''); setName(''); setValidity(''); setRetailPrice('0'); setDistributorPrice('0'); } }} disabled={!connected}><Plus size={16} /> باقة جديدة</button></div></div>
    {!connected && <div className="inline-error page-error"><AlertCircle size={16} />اتصل بالراوتر أولاً لقراءة ملفات HotSpot وربط الباقات بها.</div>}
    {error && <div className="inline-error page-error"><AlertCircle size={16} />{error}</div>}{success && <div className="success-banner"><CheckCircle2 size={17} />{success}</div>}
    {open && <section className="surface create-user-panel"><div className="surface-heading"><div><h3>{editingID ? 'تعديل باقة' : 'تعريف باقة'} {serviceType === 'hotspot' ? 'HotSpot' : 'User Manager'}</h3><p>بيانات تشغيلية للتوليد وليست نقطة بيع أو تحصيلاً.</p></div><button className="icon-button" type="button" aria-label="إغلاق" onClick={() => {setOpen(false);setEditingID('');}}><X size={17}/></button></div><form className="module-form" onSubmit={submit}><label className="field"><span>اسم الباقة <b>*</b></span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="مثال: يوم واحد" /></label><label className="field"><span>نوع الخدمة <b>*</b></span><select value={serviceType} onChange={(e) => { setServiceType(e.target.value as typeof serviceType); setProfile(''); }}><option value="hotspot">HotSpot</option><option value="user_manager">User Manager</option></select></label><label className="field"><span>ملف {serviceType === 'hotspot' ? 'HotSpot' : 'User Manager'} <b>*</b></span><select value={profile} onChange={(e) => setProfile(e.target.value)} required><option value="" disabled>{serviceType === 'hotspot' ? 'اختر ملفاً من الراوتر' : 'اختر ملفاً من آخر لقطة User Manager'}</option>{profileChoices.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select></label><label className="field"><span>بادئة اسم المستخدم <b>*</b></span><input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} required maxLength={8} dir="ltr" /></label><label className="field"><span>وصف الصلاحية</span><input value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="مثال: 24 ساعة" maxLength={80} /></label><label className="field"><span>سعر المستخدم النهائي (YER) <b>*</b></span><input value={retailPrice} onChange={(e) => setRetailPrice(e.target.value)} type="number" min="0" step="0.01" required /></label><label className="field"><span>سعر الموزع (YER) <b>*</b></span><input value={distributorPrice} onChange={(e) => setDistributorPrice(e.target.value)} type="number" min="0" step="0.01" max={retailPrice} required /></label><div className="price-margin-note field-wide">هامش الموزع المحسوب: {Math.max(0, Number(retailPrice || 0) - Number(distributorPrice || 0)).toLocaleString('ar')} YER — معلومة تسعير فقط وليست بيعاً أو تحصيلاً.</div>{selectedProfileDetails && <details className="field-wide package-advanced"><summary>خصائص وحدود الملف المختار</summary><p>{selectedProfileDetails}</p><small>المعروض من الراوتر/آخر لقطة فقط؛ هذه الشاشة لا تعدّل إعداد الملف على الراوتر.</small></details>}<button className="button button-primary" disabled={busy || !profileChoices.length || (serviceType === 'user_manager' && !userManagerProfiles.length)}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} {editingID ? 'حفظ التعديلات' : 'حفظ الباقة'}</button></form></section>}
    <section className="module-grid">{loading ? <div className="surface module-empty"><LoaderCircle size={20} className="spin" /> جارٍ تحميل الباقات…</div> : packages.length ? packages.map((item) => <article className="surface package-card" key={item.id}><div className="package-mark"><PackageCheck size={19} /></div><div className="package-copy"><strong>{item.name}</strong><span>{item.service_type === 'hotspot' ? 'HotSpot' : 'User Manager'} · {item.profile_name}</span><small>البادئة <bdi>{item.username_prefix}</bdi>{item.validity_label ? ` · ${item.validity_label}` : ''}</small><small>سعر المستخدم: {(item.price_minor/100).toLocaleString('ar')} · الموزع: {(item.distributor_price_minor/100).toLocaleString('ar')} · هامش: {((item.price_minor-item.distributor_price_minor)/100).toLocaleString('ar')} {item.currency}</small></div><div className="package-card-actions"><button className="icon-button" title="تعديل الباقة" aria-label="تعديل الباقة" onClick={()=>beginEdit(item)} disabled={!connected}><Pencil size={15}/></button>{item.enabled&&<button className="icon-button package-stop" title="إيقاف الباقة" aria-label="إيقاف الباقة" onClick={()=>void stopPackage(item)} disabled={busy}><Power size={15}/></button>}<span className={`state-badge ${item.enabled ? 'state-on' : 'state-off'}`}><i />{item.enabled ? 'مفعّلة' : 'متوقفة'}</span></div></article>) : <div className="surface module-empty"><div className="empty-icon"><PackageCheck size={18} /></div><strong>لا توجد باقات معرفة بعد</strong><span>{connected ? 'أنشئ باقة بعد اختيار ملف HotSpot من الراوتر.' : 'اتصل بالراوتر أولاً لقراءة الملفات المتاحة.'}</span></div>}</section>
  </>;
}

export function DistributorsPage() {
  const [items, setItems] = useState<Awaited<ReturnType<typeof api.distributors>>>([]);
  const [name, setName] = useState(''); const [contact, setContact] = useState(''); const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [policy, setPolicy] = useState<DistributorPackagePolicy | null>(null); const [policyBusy, setPolicyBusy] = useState(false);
  const load = async () => { try { setItems(await api.distributors()); setError(''); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل الموزعين'); } };
  const openPolicy = async (id: string) => { setError(''); setPolicyBusy(true); try { setPolicy(await api.distributorPackagePolicy(id)); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر قراءة سياسة الباقات'); } finally { setPolicyBusy(false); } };
  const savePolicy = async () => { if (!policy) return; setPolicyBusy(true); setError(''); setSuccess(''); try { setPolicy(await api.saveDistributorPackagePolicy(policy.distributor_id, { all_packages_enabled: policy.all_packages_enabled, packages: policy.packages })); setSuccess('تم حفظ الباقات المتاحة وبادئات هذا الموزع.'); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر حفظ سياسة الموزع'); } finally { setPolicyBusy(false); } };
  const toggleDistributor = async (item: Awaited<ReturnType<typeof api.distributors>>[number]) => { const active = !item.active; if (!window.confirm(`سيتم ${active ? 'تفعيل' : 'إيقاف'} الموزع «${item.name}». لن تتغير حركات المخزون السابقة. هل تريد المتابعة؟`)) return; setPolicyBusy(true); setError(''); setSuccess(''); try { await api.updateDistributor(item.id, { name:item.name, contact:item.contact, notes:item.notes, active }); setSuccess(`تم ${active?'تفعيل':'إيقاف'} الموزع «${item.name}».`); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحديث حالة الموزع'); } finally { setPolicyBusy(false); } };
  useEffect(() => { void load(); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setSuccess(''); try { await api.createDistributor({ name, contact, notes }); setName(''); setContact(''); setNotes(''); setOpen(false); setSuccess('تم تعريف الموزع. لا توجد عمليات بيع أو تحصيل في هذه الوحدة.'); await load(); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر حفظ الموزع'); } finally { setBusy(false); } };
  return <>
    <div className="page-heading"><div><div className="eyebrow"><Users size={14} /> شبكة التوزيع</div><h1>الموزعون</h1><p>تعريف الجهات التي ستستلم مخزوناً مخصصاً، دون POS أو معاملات مالية.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => void load()}><RefreshCw size={15} /> تحديث</button><button className="button button-primary" onClick={() => setOpen((v) => !v)}><Plus size={16} /> موزع جديد</button></div></div>
    {error && <div className="inline-error page-error"><AlertCircle size={16} />{error}</div>}{success && <div className="success-banner"><CheckCircle2 size={17} />{success}</div>}
    {open && <section className="surface create-user-panel"><div className="surface-heading"><div><h3>تعريف موزع</h3><p>سجل اسم الجهة ووسيلة التواصل فقط.</p></div></div><form className="module-form" onSubmit={submit}><label className="field"><span>اسم الموزع <b>*</b></span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></label><label className="field"><span>رقم/وسيلة تواصل</span><input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={160} /></label><label className="field field-wide"><span>ملاحظات داخلية</span><input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></label><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} حفظ الموزع</button></form></section>}
    {policy && <section className="surface distributor-policy"><div className="surface-heading"><div><h3>سياسة الباقات: {items.find((item) => item.id === policy.distributor_id)?.name}</h3><p>البادئة الفارغة تعني استخدام بادئة الباقة العامة.</p></div><button className="button button-quiet compact-button" onClick={() => setPolicy(null)}>إغلاق</button></div><label className="policy-all"><input type="checkbox" checked={policy.all_packages_enabled} onChange={(event) => setPolicy((current) => current ? ({...current,all_packages_enabled:event.target.checked,packages:current.packages.map((item)=>({...item,allowed:event.target.checked}))}) : current)} /><span>إتاحة كل الباقات افتراضياً</span><small>مفعّلة افتراضياً للموزعين الجدد؛ أزل الاختيار لتحديد قائمة سماح.</small></label><div className="policy-package-list">{policy.packages.map((pkg) => <div className="policy-package-row" key={pkg.package_id}><label><input type="checkbox" checked={pkg.allowed} disabled={!pkg.package_enabled} onChange={(event) => setPolicy((current) => current ? ({...current,packages:current.packages.map((item)=>item.package_id===pkg.package_id?{...item,allowed:event.target.checked}:item)}) : current)} /><span>{pkg.name}</span><small>{pkg.service_type==='hotspot'?'HotSpot':'User Manager'}{!pkg.package_enabled?' · متوقفة':''}</small></label><input className="policy-prefix" aria-label={`بادئة ${pkg.name}`} placeholder="البادئة العامة" maxLength={8} value={pkg.username_prefix_override} onChange={(event) => setPolicy((current) => current ? ({...current,packages:current.packages.map((item)=>item.package_id===pkg.package_id?{...item,username_prefix_override:event.target.value.toUpperCase()}:item)}) : current)} /></div>)}</div><button className="button button-primary" onClick={() => void savePolicy()} disabled={policyBusy}>{policyBusy?<LoaderCircle size={15} className="spin"/>:<CheckCircle2 size={15}/>} حفظ سياسة الموزع</button></section>}
    {policyBusy && !policy && <div className="table-empty"><LoaderCircle size={18} className="spin"/> جارٍ تحميل إعدادات الباقات…</div>}
    <section className="module-grid">{items.length ? items.map((item) => <article className="surface distributor-card" key={item.id}><div className="distributor-avatar">{item.name.slice(0,1)}</div><div className="package-copy"><strong>{item.name}</strong><span>{item.contact || 'لا توجد وسيلة تواصل'}</span><small>{item.notes || 'لا توجد ملاحظات'}</small><small>{item.all_packages_enabled?'كل الباقات متاحة افتراضياً':'توجد قائمة باقات مخصصة'}</small></div><span className={`state-badge ${item.active ? 'state-on' : 'state-off'}`}><i />{item.active ? 'نشط' : 'موقوف'}</span><button className="icon-button" title={item.active?'إيقاف الموزع':'تفعيل الموزع'} aria-label={item.active?'إيقاف الموزع':'تفعيل الموزع'} onClick={()=>void toggleDistributor(item)} disabled={policyBusy}>{item.active?<Power size={15}/>:<CheckCircle2 size={15}/>}</button><button className="button button-quiet compact-button" onClick={()=>void openPolicy(item.id)}><Settings2 size={14}/> إعداد الباقات</button></article>) : <div className="surface module-empty"><div className="empty-icon"><Users size={18} /></div><strong>ابدأ بتعريف الموزعين</strong><span>يمكنك تخصيص مخزون لهم بعد إنشاء دفعات HotSpot.</span></div>}</section>
  </>;
}

export function InventoryPage({ connected }: Props) {
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof api.inventory>> | null>(null);
  const [vouchers, setVouchers] = useState<Awaited<ReturnType<typeof api.vouchers>>['items']>([]);
  const [distributors, setDistributors] = useState<Awaited<ReturnType<typeof api.distributors>>>([]);
  const [selected, setSelected] = useState<string[]>([]); const [action, setAction] = useState<'allocate'|'transfer'|'return'>('allocate'); const [target, setTarget] = useState('');
  const [eventsPage, setEventsPage] = useState(0); const [eventsPageSize, setEventsPageSize] = useState(20);
  const [eventsSearch, setEventsSearch] = useState(''); const [eventsQuery, setEventsQuery] = useState('');
  const [eventType, setEventType] = useState('all');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const inventoryRequestRef=useRef(0);
  const loadStock = async () => { const requestID=++inventoryRequestRef.current; try { const stock=await api.inventory(eventsPage*eventsPageSize,eventsPageSize,eventsQuery,eventType); if(requestID!==inventoryRequestRef.current)return; setSnapshot(stock); setError(''); if(eventsPage>0&&eventsPage*eventsPageSize>=stock.events_total)setEventsPage(Math.max(0,Math.ceil(stock.events_total/eventsPageSize)-1)); } catch (err) { if(requestID===inventoryRequestRef.current)setError(err instanceof Error ? err.message : 'تعذر تحميل سجل المخزون'); } };
  const loadOptions = async () => { try { const [page,owners]=await Promise.all([api.vouchers(0,200),api.distributors()]); setVouchers(page.items); setDistributors(owners); } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات التخصيص'); } };
  const load = async () => { await Promise.all([loadStock(),loadOptions()]); };
  useEffect(() => { if(!connected){inventoryRequestRef.current++;setSnapshot(null);return;} void loadStock(); }, [connected,eventsPage,eventsPageSize,eventsQuery,eventType]);
  useEffect(() => { if(!connected){setVouchers([]);setDistributors([]);return;} void loadOptions(); }, [connected]);
  useEffect(() => { const timer=window.setTimeout(()=>{setEventsPage(0);setEventsQuery(eventsSearch.trim());},250);return()=>window.clearTimeout(timer); }, [eventsSearch]);
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
    <section className="surface table-panel inventory-events">
      <div className="table-heading">
        <div><h3>سجل حركات المخزون</h3><p>كل حركة تسجل كسطر مستقل؛ يمكن البحث والتصفية دون تعديل التاريخ السابق.</p></div>
        <div className="inventory-event-filters">
          <label className="search-box"><Search size={15}/><input value={eventsSearch} onChange={(event)=>setEventsSearch(event.target.value)} placeholder="بحث بالقسيمة أو الملاحظة أو الموزع" /></label>
          <select aria-label="تصفية حسب نوع الحركة" value={eventType} onChange={(event)=>{setEventType(event.target.value);setEventsPage(0);}}>
            <option value="all">كل الحركات</option><option value="issue">إصدار</option><option value="allocate">تخصيص</option><option value="transfer">تحويل</option><option value="return">إرجاع</option><option value="adjustment">تسوية</option>
          </select>
          <span className="profile-count">{snapshot?.events_total??0} حركة</span>
        </div>
      </div>
      {snapshot?.events.length ? <><div className="table-scroll"><table><thead><tr><th>الوقت</th><th>القسيمة</th><th>الحركة</th><th>من</th><th>إلى</th><th>ملاحظة</th></tr></thead><tbody>{snapshot.events.map((event)=> <tr key={event.id}><td>{new Date(event.created_at).toLocaleString('ar')}</td><td><strong>{event.username}</strong></td><td>{movementLabel(event.type)}</td><td>{event.from}</td><td>{event.to}</td><td>{event.note||'—'}</td></tr>)}</tbody></table></div><TablePagination page={eventsPage} pageSize={eventsPageSize} total={snapshot.events_total} onPage={setEventsPage} onPageSize={(size)=>{setEventsPageSize(size);setEventsPage(0);}} label="حركة" /></> : <div className="table-empty">{eventsQuery||eventType!=='all'?'لا توجد حركات تطابق البحث أو التصفية.':'لا توجد حركات مخزون مسجلة بعد.'}</div>}
    </section>
  </>;
}

function movementLabel(type: string) { return ({ issue: 'إصدار', allocate: 'تخصيص', transfer: 'تحويل', return: 'إرجاع', adjustment: 'تسوية' } as Record<string,string>)[type] || type; }


export function UserManagerPage({ connected }: Props) {
  const [snapshot,setSnapshot]=useState<Awaited<ReturnType<typeof api.userManager>>|null>(null);
  const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const load=async()=>{if(!connected)return;setLoading(true);setError('');try{setSnapshot(await api.userManager())}catch(err){setError(err instanceof Error?err.message:'تعذر قراءة لقطة User Manager')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[connected]);
  const sync=async()=>{setBusy(true);setError('');setSuccess('');try{const result=await api.syncUserManager();setSnapshot(result);setSuccess(result.warnings?.length?`اكتملت القراءة مع ${result.warnings.length} تحذيراً؛ عُرضت الملفات والقيود، وتُركت العلاقات غير المؤكدة دون تخمين.`:`اكتملت القراءة من الراوتر: ${result.profiles.length} ملفاً، ${result.limitations.length} قيداً، ${result.profile_limitations.length} علاقة.`)}catch(err){setError(err instanceof Error?err.message:'تعذرت القراءة من الراوتر؛ بقيت آخر لقطة ناجحة دون تغيير.')}finally{setBusy(false)}};
  const profileLinks=snapshot?.profile_limitations.filter((relation)=>relation.present!==false)??[];
  return <>
    <div className="page-heading"><div><div className="eyebrow"><Users size={14}/> مزامنة قراءة فقط</div><h1>User Manager</h1><p>قراءة الملفات والقيود والعلاقات فقط. لا تتم قراءة كلمات مرور المستخدمين ولا كتابة بيانات على الراوتر.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={()=>void load()} disabled={!connected||loading||busy}><RefreshCw size={15} className={loading?'spin':''}/> تحميل اللقطة المحفوظة</button><button className="button button-primary" onClick={()=>void sync()} disabled={!connected||busy||loading}><RefreshCw size={15} className={busy?'spin':''}/> قراءة من الراوتر الآن</button></div></div>
    {!connected&&<div className="inline-error page-error"><AlertCircle size={16}/>اتصل بالراوتر أولاً. تتطلب المزامنة تثبيت User Manager وتفعيل صلاحية القراءة.</div>}
    {error&&<div className="inline-error page-error"><AlertCircle size={16}/>{error}</div>}{success&&<div className="success-banner"><CheckCircle2 size={17}/>{success}</div>}
    <div className="readonly-banner"><ShieldCheck size={17}/><span><strong>وضع قراءة فقط</strong> · تُستبدل اللقطة محلياً داخل معاملة واحدة بعد اكتمال جميع القراءات؛ الفشل لا يمحو آخر لقطة ناجحة.</span></div>
    {!!snapshot?.warnings?.length&&<div className="um-snapshot-notice um-sync-warnings"><AlertCircle size={15}/><div><strong>تحذيرات من بيانات الراوتر</strong><ul>{snapshot.warnings.map((warning,index)=><li key={`${index}-${warning}`}>{warning}</li>)}</ul></div></div>}
    {snapshot&&!snapshot.synced_at&&<div className="um-snapshot-notice"><AlertCircle size={15}/><span>لا توجد لقطة ناجحة محفوظة لهذا الراوتر بعد. زر «تحميل اللقطة المحفوظة» لا يتصل بالراوتر؛ استخدم «قراءة من الراوتر الآن» لجلب Profiles والقيود والعلاقات.</span></div>}
    <div className="voucher-stats"><div className="mini-stat"><span className="mini-stat-icon blue"><Users size={17}/></span><span><small>الملفات</small><strong>{snapshot?.profiles.length??'—'}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon green"><Boxes size={17}/></span><span><small>القيود</small><strong>{snapshot?.limitations.length??'—'}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon amber"><Network size={17}/></span><span><small>علاقات الملف والقيود</small><strong>{snapshot?profileLinks.length:'—'}</strong></span></div></div>
    {snapshot?.major_version&&<div className="readonly-meta"><span>RouterOS v{snapshot.major_version}</span><span>{snapshot.router?.identity||'الراوتر النشط'}</span><span>{snapshot.synced_at?`آخر مزامنة ${new Date(snapshot.synced_at).toLocaleString('ar')}`:'تُعرض آخر لقطة محفوظة'}</span></div>}
    <div className="um-columns"><section className="surface um-list"><div className="surface-heading"><div><h3>ملفات User Manager</h3><p>الإصدار الحالي: {snapshot?.major_version?`v${snapshot.major_version}`:'غير متزامن'}</p></div><span className="profile-count">{snapshot?.profiles.length??0} ملف</span></div>{snapshot?.profiles.length?snapshot.profiles.map((p)=><article className="um-record" key={p.source_id}><div className="package-mark"><Users size={17}/></div><div className="package-copy"><strong>{p.name}</strong><small>{Object.entries(p.properties).filter(([key])=>key!=='name'&&key!=='.id').slice(0,3).map(([k,v])=>`${k}: ${v}`).join(' · ')||'لا توجد خصائص عرض إضافية'}</small><small className={profileLinks.some((relation)=>relation.profile_source_id===p.source_id)?'profile-link-ok':'profile-link-warning'}>{profileLinks.some((relation)=>relation.profile_source_id===p.source_id)?'مرتبط بتحديد واحد أو أكثر':'تنبيه: لا توجد علاقة Limitation صالحة لهذا الملف'}</small></div><span className={`state-badge ${p.present===false?'state-off':'state-on'}`}><i/>{p.present===false?'غائب':'موجود'}</span></article>):<div className="module-empty"><div className="empty-icon"><Users size={18}/></div><strong>{loading?'جارٍ القراءة…':snapshot?.synced_at?'اكتملت القراءة ولم يُرجع الراوتر أي ملفات':'لا توجد لقطة ناجحة بعد'}</strong><span>{snapshot?.synced_at?'تأكد من اتصال الراوتر وإصدار RouterOS وتثبيت حزمة User Manager. إذا كانت الملفات موجودة على الجهاز، جرّب تحديث القراءة للاطلاع على رسالة الخطأ التفصيلية.':'ابدأ بقراءة User Manager من الراوتر النشط؛ إعادة تحميل اللقطة المحلية لا تجلب بيانات جديدة.'}</span></div>}</section>
      <section className="surface um-list"><div className="surface-heading"><div><h3>القيود والعلاقات</h3><p>يحافظ التطبيق على تعدد القيود لكل ملف.</p></div><span className="profile-count">{snapshot?.limitations.length??0} قيد</span></div>{snapshot?.limitations.map((l)=><article className="um-record" key={l.source_id}><div className="package-mark limitation-mark"><Settings2 size={17}/></div><div className="package-copy"><strong>{l.name}</strong><small>{Object.entries(l.properties).filter(([key])=>key!=='name'&&key!=='.id').slice(0,3).map(([k,v])=>`${k}: ${v}`).join(' · ')||'لا توجد خصائص عرض إضافية'}</small></div><span className={`state-badge ${l.present===false?'state-off':'state-on'}`}><i/>{l.present===false?'غائب':'موجود'}</span></article>)}{snapshot?.limitations.length===0&&<div className="module-empty"><span className="empty-icon"><Boxes size={18}/></span><strong>{snapshot.synced_at?'اكتملت القراءة دون قيود':'لا توجد لقطة محفوظة'}</strong><span>{snapshot.synced_at?'تحقق من إعداد الملفات والقيود على الراوتر؛ لا تُنشأ قيود تخمينية.':'ابدأ بقراءة البيانات من الراوتر النشط.'}</span></div>}
        {!!profileLinks.length&&<div className="relation-list"><h4>العلاقات المرتبطة</h4>{profileLinks.map((relation,index)=><div className="relation-row" key={`${relation.profile_source_id}-${relation.limitation_source_id}-${index}`}><span>{relation.profile_name||relation.profile_source_id}</span><ArrowUpLeft size={13}/><strong>{relation.limitation_name||relation.limitation_source_id}</strong><small>ترتيب {relation.position+1}</small></div>)}</div>}
      </section></div>
  </>;
}

type UserFilter = 'all' | 'sessions' | 'profile-active' | 'expired' | 'disabled' | 'linked' | 'unlinked';

export function UserManagerUsersPage({ connected }: Props) {
  const [directory, setDirectory] = useState<Awaited<ReturnType<typeof api.userManagerUsers>> | null>(null);
  const [sessionSnapshot, setSessionSnapshot] = useState<Awaited<ReturnType<typeof api.userManagerSessions>> | null>(null);
  const [profileSnapshot, setProfileSnapshot] = useState<Awaited<ReturnType<typeof api.userManager>> | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [distributor, setDistributor] = useState('all');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sessionWarning, setSessionWarning] = useState('');

  const load = async () => {
    if (!connected) { setDirectory(null); setSessionSnapshot(null); setProfileSnapshot(null); setError(''); return; }
    setLoading(true); setError(''); setSessionWarning('');
    const [usersResult, sessionsResult, profilesResult] = await Promise.allSettled([api.userManagerUsers(), api.userManagerSessions(), api.userManager()]);
    if (usersResult.status === 'fulfilled') setDirectory(usersResult.value);
    else { setDirectory(null); setError(usersResult.reason instanceof Error ? usersResult.reason.message : 'تعذرت قراءة مستخدمي User Manager'); }
    if (sessionsResult.status === 'fulfilled') { setSessionSnapshot(sessionsResult.value); setSessionWarning(sessionsResult.value.warning || ''); }
    else { setSessionSnapshot(null); setSessionWarning(sessionsResult.reason instanceof Error ? sessionsResult.reason.message : 'تعذرت قراءة جلسات User Manager؛ أعداد الجلسات غير متاحة.'); }
    if (profilesResult.status === 'fulfilled') setProfileSnapshot(profilesResult.value);
    else setProfileSnapshot(null);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [connected]);

  const users = directory?.users ?? [];
  const profiles = directory?.user_profiles ?? [];
  const activeSessions = sessionSnapshot?.sessions.filter((item) => item.active) ?? [];
  const activeCountFor = (name: string, known: string | undefined, customer?: string): number | null => {
    const parsed = Number(known);
    if (known !== undefined && known !== '' && Number.isFinite(parsed)) return parsed;
    if (!sessionSnapshot) return null;
    const sameNameUsers = users.filter((item) => item.name === name);
    return activeSessions.filter((item) => item.user === name && (customer === undefined && sameNameUsers.length === 1 ? true : (item.customer || undefined) === customer)).length;
  };
  const assignmentsFor = (name: string, customer?: string) => {
    const sameNameUsers = users.filter((item) => item.name === name);
    return profiles.filter((item) => item.user === name && (customer === undefined && sameNameUsers.length === 1 ? true : (item.customer || undefined) === customer));
  };
  const activeAssignmentFor = (name: string, customer?: string) => assignmentsFor(name, customer).find((item) => normalizedProfileState(item.state) === 'running-active' && !isRouterDatePast(item.end_time))
    ?? assignmentsFor(name, customer).find((item) => normalizedProfileState(item.state) === 'running' && !isRouterDatePast(item.end_time));
  const isExpiredUser = (name: string, customer?: string) => {
    const assigned = assignmentsFor(name, customer);
    const hasCurrent = assigned.some((item) => ['running-active', 'running'].includes(normalizedProfileState(item.state)) && !isRouterDatePast(item.end_time));
    return !hasCurrent && assigned.some((item) => normalizedProfileState(item.state) === 'used' || isRouterDatePast(item.end_time));
  };
  const hasValidProfile = (user: typeof users[number]) => !!activeAssignmentFor(user.name, user.customer) || (!!user.actual_profile && !isExpiredUser(user.name, user.customer));
  const profileNameFor = (user: typeof users[number]) => user.actual_profile || activeAssignmentFor(user.name, user.customer)?.profile || assignmentsFor(user.name, user.customer)[0]?.profile || '';
  const relationsForProfile = (name: string) => {
    const profile = profileSnapshot?.profiles.find((item) => item.name === name && item.present !== false);
    return profileSnapshot?.profile_limitations.filter((item) => item.present !== false && (item.profile_name === name || item.profile_source_id === profile?.source_id)) ?? [];
  };
  const quotaForProfile = (name: string) => {
    const relations = relationsForProfile(name);
    const limitations = profileSnapshot?.limitations ?? [];
    return relations.map((relation) => {
      const limitation = limitations.find((item) => item.present !== false && (item.source_id === relation.limitation_source_id || item.name === relation.limitation_name));
      const properties = limitation?.properties ?? {};
      const selected = ['transfer-limit', 'download-limit', 'upload-limit', 'uptime-limit'].filter((key) => properties[key]);
      return selected.length ? `${limitation?.name ?? relation.limitation_name}: ${selected.map((key) => `${key} ${properties[key]}`).join(' · ')}` : (limitation?.name ?? relation.limitation_name ?? 'قيد مرتبط');
    }).filter(Boolean).join(' / ');
  };
  const localDistributors = [...new Set(users.map((user) => user.local_origin?.distributor_name).filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, 'ar'));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredUsers = users.filter((user) => {
    const assignedProfile = profileNameFor(user);
    const activeCount = activeCountFor(user.name, user.active_sessions, user.customer);
    const expired = isExpiredUser(user.name, user.customer);
    const hasActiveProfile = hasValidProfile(user);
    const linked = !!user.local_origin;
    const statusMatches = filter === 'all'
      || (filter === 'sessions' && activeCount !== null && activeCount > 0)
      || (filter === 'profile-active' && hasActiveProfile && !expired && !user.disabled)
      || (filter === 'expired' && expired)
      || (filter === 'disabled' && user.disabled)
      || (filter === 'linked' && linked)
      || (filter === 'unlinked' && !linked);
    const originMatches = distributor === 'all' || (distributor === '__unlinked' ? !linked : user.local_origin?.distributor_name === distributor);
    const searchMatches = !normalizedQuery || [user.name, user.comment, user.group, user.caller_id, user.actual_profile, assignedProfile, user.local_origin?.package_name, user.local_origin?.batch_id, user.local_origin?.distributor_name]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    return statusMatches && originMatches && searchMatches;
  }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const pageUsers = filteredUsers.slice(page * pageSize, (page + 1) * pageSize);
  const counts = {
    total: users.length,
    active: users.filter((user) => { const count = activeCountFor(user.name, user.active_sessions, user.customer); return count !== null && count > 0; }).length,
    disabled: users.filter((user) => user.disabled).length,
    expired: users.filter((user) => isExpiredUser(user.name, user.customer)).length,
  };
  const changeFilter = (value: UserFilter) => { setFilter(value); setPage(0); };
  const userState = (user: typeof users[number]) => {
    const count = activeCountFor(user.name, user.active_sessions, user.customer);
    return user.disabled ? 'معطّل' : count === null ? 'النشاط غير متاح' : count > 0 ? 'له جلسة نشطة' : 'مفعّل';
  };
  const usageText = (user: typeof users[number]) => [user.download_used ? `تنزيل ${formatSessionBytes(user.download_used)}` : '', user.upload_used ? `رفع ${formatSessionBytes(user.upload_used)}` : '', user.uptime_used ? `وقت ${user.uptime_used}` : ''].filter(Boolean).join(' · ') || 'غير متاح من هذا الإصدار';

  return <>
    <div className="page-heading">
      <div><div className="eyebrow"><Users size={14}/> دليل الحسابات</div><h1>مستخدمو User Manager</h1><p>قائمة قراءة فقط للمستخدمين وملفاتهم، مع إظهار بيانات الاستخدام والارتباط المحلي عند توفرها.</p></div>
      <div className="heading-actions"><button className="button button-quiet" onClick={() => void load()} disabled={!connected || loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/> تحديث القائمة</button></div>
    </div>
    {!connected && <div className="inline-error page-error"><AlertCircle size={16}/>اتصل بالراوتر لقراءة دليل المستخدمين. لا تنفذ هذه الصفحة أي كتابة إلى User Manager.</div>}
    {error && <div className="inline-error page-error"><AlertCircle size={16}/>{error}</div>}
    {sessionWarning && <div className="um-snapshot-notice"><AlertCircle size={15}/><span>{sessionWarning} {sessionSnapshot ? 'قد تكون بعض حقول بيانات الجلسات غير متاحة.' : 'سيظل عرض الحسابات متاحاً لكن مرشح النشاط قد يكون جزئياً.'}</span></div>}
    {directory?.profile_assignments_warning && <div className="um-snapshot-notice"><AlertCircle size={15}/><span>{directory.profile_assignments_warning}</span></div>}
    {directory?.local_origin_mapping_warning && <div className="um-snapshot-notice"><AlertCircle size={15}/><span>{directory.local_origin_mapping_warning}</span></div>}
    <div className="readonly-banner"><ShieldCheck size={17}/><span><strong>قراءة فقط — إجراءات UM مؤجلة</strong> · كلمات المرور ومفاتيح OTP لا تُقرأ. تعطيل المستخدم وإنهاء جلسة UM وإضافة/تجديد باقة ستظل محظورة حتى اجتياز اختبار RouterOS 6 و7 على راوتر فعلي.</span></div>
    <div className="voucher-stats">
      <div className="mini-stat"><span className="mini-stat-icon blue"><Users size={17}/></span><span><small>الحسابات المقروءة</small><strong>{directory ? counts.total : '—'}</strong></span></div>
      <div className="mini-stat"><span className="mini-stat-icon green"><Wifi size={17}/></span><span><small>لها جلسة نشطة</small><strong>{directory ? counts.active : '—'}</strong></span></div>
      <div className="mini-stat"><span className="mini-stat-icon amber"><Power size={17}/></span><span><small>معطّلة</small><strong>{directory ? counts.disabled : '—'}</strong></span></div>
      <div className="mini-stat"><span className="mini-stat-icon blue"><Clock3 size={17}/></span><span><small>ملف منتهي/مستهلك</small><strong>{directory ? counts.expired : '—'}</strong></span></div>
    </div>
    {directory && <div className="readonly-meta"><span>RouterOS {directory.major_version}</span><span>{directory.profile_assignments_available ? `${profiles.length} إسناد ملف` : 'إسنادات الملفات غير متاحة'}</span><span>{sessionSnapshot ? `${sessionSnapshot.sessions.length} جلسة UM مقروءة` : 'بيانات الجلسات غير متاحة'}</span><span>{profileSnapshot?.synced_at ? `قيود الملفات من مزامنة ${new Date(profileSnapshot.synced_at).toLocaleString('ar')}` : 'لا توجد لقطة محلية لحدود الملفات'}</span></div>}
    <section className="surface um-browser">
      <div className="um-browser-toolbar">
        <div className="um-tabs" role="group" aria-label="مرشحات المستخدمين">
          {([['all','الكل'],['sessions','جلسات نشطة'],['profile-active','ملف فعّال'],['expired','منتهي'],['disabled','معطّل'],['linked','مرتبط محلياً'],['unlinked','غير مرتبط']] as [UserFilter,string][]).map(([value,label]) => <button type="button" key={value} className={`um-tab ${filter === value ? 'um-tab-active' : ''}`} aria-pressed={filter === value} onClick={() => changeFilter(value)}><span>{label}</span></button>)}
        </div>
        <label className="um-search"><Search size={16}/><input aria-label="البحث في المستخدمين" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="اسم، ملف، معرّف، موزّع…" /></label>
        <label className="um-search origin-filter"><span>التوزيع</span><select aria-label="تصفية حسب آخر موزّع مسجل محلياً" value={distributor} disabled={!directory?.local_origin_mapping_available} onChange={(event) => { setDistributor(event.target.value); setPage(0); }}><option value="all">{directory?.local_origin_mapping_available ? 'كل السجلات' : 'بيانات التوزيع غير متاحة'}</option><option value="__unlinked">لا يوجد تخصيص مطابق</option>{localDistributors.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      </div>
      {!directory && <div className="module-empty"><div className="empty-icon"><Users size={18}/></div><strong>{loading ? 'جارٍ قراءة المستخدمين…' : 'لا توجد قائمة محمّلة'}</strong><span>تُقرأ حسابات الراوتر مباشرة دون حفظ كلمات المرور محلياً.</span></div>}
      {directory && <><div className="table-scroll"><table className="um-users-table"><thead><tr><th>المستخدم</th><th>الحالة</th><th>الملف / القيد</th><th>الاستخدام الذي أعاده الراوتر</th><th>المعرّف المرسل</th><th>التوزيع المحلي</th></tr></thead><tbody>
        {pageUsers.map((user) => {
          const profileName = profileNameFor(user);
          const assignment = activeAssignmentFor(user.name, user.customer) ?? assignmentsFor(user.name, user.customer)[0];
          const quota = quotaForProfile(profileName);
          const activeSessionsCount = activeCountFor(user.name, user.active_sessions, user.customer);
          const profileState = assignment?.state || (user.actual_profile ? 'الملف الفعلي' : 'غير متاح');
          return <tr key={user.source_id}>
            <td><strong>{user.name}</strong><small className="table-subline">{user.customer ? `عميل ${user.customer} · ` : ''}{user.comment || user.group || '—'}{user.shared_users ? ` · حد الجلسات ${user.shared_users}` : ''}</small></td>
            <td><span className={`state-badge ${user.disabled ? 'state-off' : (activeSessionsCount === null ? 'state-warn' : activeSessionsCount > 0 ? 'state-on' : 'state-warn')}`}><i/>{userState(user)}</span><small className="table-subline">{activeSessionsCount === null ? 'عدد الجلسات غير متاح' : `${activeSessionsCount} جلسة نشطة`}</small></td>
            <td>{profileName || 'غير متاح'}<small className="table-subline">{profileState}{assignment?.end_time ? ` · حتى ${assignment.end_time}` : ''}</small>{quota && <small className="table-subline">{quota}</small>}</td>
            <td>{usageText(user)}</td>
            <td dir="ltr">{user.caller_id || 'غير متاح'}{user.last_seen && <small className="table-subline" dir="auto">آخر ظهور: {user.last_seen}</small>}</td>
            <td>{user.local_origin ? <><strong>{user.local_origin.package_name}</strong><small className="table-subline">دفعة {user.local_origin.batch_id.slice(0, 8)}{user.local_origin.distributor_name ? ` · آخر تخصيص: ${user.local_origin.distributor_name}` : ''}</small></> : directory.local_origin_mapping_available ? 'لا يوجد تطابق محلي' : 'بيانات التوزيع غير متاحة'}</td>
          </tr>;
        })}
      </tbody></table></div>
      {!filteredUsers.length && <div className="table-empty">لا توجد حسابات تطابق المرشحات الحالية.</div>}
      <TablePagination page={page} pageSize={pageSize} total={filteredUsers.length} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(0); }} label="مستخدم" />
      </>}
      {loading && directory && <div className="um-loading"><LoaderCircle size={14} className="spin"/> جارٍ تحديث القائمة…</div>}
    </section>
  </>;
}

function normalizedProfileState(value?: string) {
  return (value ?? '').trim().toLocaleLowerCase().replace(/[ _]+/g, '-');
}

function isRouterDatePast(value?: string) {
  if (!value) return false;
  const normalized = value.trim();
  let timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    const match = normalized.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
    if (match) {
      const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
      timestamp = new Date(Number(match[3]), months[match[1].toLowerCase()], Number(match[2]), Number(match[4]), Number(match[5]), Number(match[6] || 0)).getTime();
    }
  }
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

type UnifiedSession = {
  key: string; service: 'hotspot' | 'user_manager'; user: string; customer?: string; active: boolean; status: string;
  started?: string; ended?: string; scheduledEnd?: string; uptime?: string; upload?: string; download?: string;
  address?: string; identifier?: string; nas?: string; sourceID: string; profile?: string; localPackage?: string;
};

type SessionFilter = 'all' | 'active' | 'closed' | 'expired';

export function SessionsPage({ connected }: Props) {
  const [hotspot, setHotspot] = useState<Awaited<ReturnType<typeof api.hotspotSessions>>>([]);
  const [hotspotUsers, setHotspotUsers] = useState<Awaited<ReturnType<typeof api.users>>>([]);
  const [userManager, setUserManager] = useState<UserManagerSession[]>([]);
  const [userDirectory, setUserDirectory] = useState<Awaited<ReturnType<typeof api.userManagerUsers>> | null>(null);
  const [service, setService] = useState<'all' | 'hotspot' | 'user_manager'>('all');
  const [statusFilter, setStatusFilter] = useState<SessionFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [terminating, setTerminating] = useState('');
  const [hotspotError, setHotspotError] = useState('');
  const [managerError, setManagerError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!connected) { setHotspot([]); setHotspotUsers([]); setUserManager([]); setUserDirectory(null); setHotspotError(''); setManagerError(''); return; }
    setLoading(true); setHotspotError(''); setManagerError('');
    const [hotspotResult, hotspotUsersResult, managerResult, directoryResult] = await Promise.allSettled([api.hotspotSessions(), api.users(), api.userManagerSessions(), api.userManagerUsers()]);
    if (hotspotResult.status === 'fulfilled') setHotspot(hotspotResult.value);
    else { setHotspot([]); setHotspotError(hotspotResult.reason instanceof Error ? hotspotResult.reason.message : 'تعذر قراءة جلسات HotSpot'); }
    if (hotspotUsersResult.status === 'fulfilled') setHotspotUsers(hotspotUsersResult.value);
    else setHotspotUsers([]);
    if (managerResult.status === 'fulfilled') { setUserManager(managerResult.value.sessions); setManagerError(managerResult.value.warning || ''); }
    else { setUserManager([]); setManagerError(managerResult.reason instanceof Error ? managerResult.reason.message : 'تعذر قراءة جلسات User Manager'); }
    if (directoryResult.status === 'fulfilled') setUserDirectory(directoryResult.value);
    else { setUserDirectory(null); setManagerError((current) => [current, 'تعذر قراءة ملفات مستخدمي UM'].filter(Boolean).join(' · ')); }
    setLoading(false);
  };
  useEffect(() => { void load(); }, [connected]);

  const rows = useMemo<UnifiedSession[]>(() => [
    ...hotspot.map((item) => ({ key: `hotspot:${item.id}`, service: 'hotspot' as const, user: item.user, active: true, status: 'active', uptime: item.uptime, upload: item.bytes_in, download: item.bytes_out, address: item.address, identifier: item.mac, nas: item.server ? `HotSpot ${item.server}` : 'HotSpot', sourceID: item.id, profile: hotspotUsers.find((user) => user.name === item.user)?.profile })),
    ...userManager.map((item) => {
      const user = userDirectory?.users.find((candidate) => candidate.name === item.user && (candidate.customer || undefined) === (item.customer || undefined));
      const assignments = userDirectory?.user_profiles.filter((assignment) => assignment.user === item.user && (assignment.customer || undefined) === (item.customer || undefined)) ?? [];
      const assigned = assignments.find((assignment) => normalizedProfileState(assignment.state) === 'running-active') ?? assignments.find((assignment) => normalizedProfileState(assignment.state) === 'running');
      return { key: `user_manager:${item.source_id}`, service: 'user_manager' as const, user: item.user, customer: item.customer, active: item.active, status: item.status || (item.active ? 'active' : 'ended'), started: item.started, ended: item.ended, scheduledEnd: item.scheduled_end, uptime: item.uptime, upload: item.upload, download: item.download, address: item.user_address, identifier: item.calling_station_id, nas: [item.nas_identifier, item.nas_address, item.nas_port_id].filter(Boolean).join(' · '), sourceID: item.source_id, profile: user?.actual_profile || assigned?.profile || assignments[0]?.profile, localPackage: user?.local_origin?.package_name };
    }),
  ], [hotspot, hotspotUsers, userManager, userDirectory]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = rows.filter((item) => {
    const expired = normalizedProfileState(item.status).includes('expired');
    const statusMatches = statusFilter === 'all' || (statusFilter === 'active' && item.active) || (statusFilter === 'closed' && !item.active) || (statusFilter === 'expired' && expired);
    const serviceMatches = service === 'all' || service === item.service;
    const queryMatches = !normalizedQuery || [item.user, item.status, item.address, item.identifier, item.nas, item.sourceID].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    return statusMatches && serviceMatches && queryMatches;
  });
  const shown = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const activeTotal = rows.filter((item) => item.active).length;
  const endSession = async (session: UnifiedSession) => {
    if (session.service !== 'hotspot' || !session.active) return;
    if (!window.confirm(`سيتم قطع اتصال المستخدم «${session.user}» الآن. هل تريد إنهاء جلسة HotSpot النشطة؟`)) return;
    setTerminating(session.key); setMessage('');
    try { await api.terminateHotspotSession(session.sourceID); setMessage(`تم إرسال طلب إنهاء جلسة ${session.user}؛ حدّث القائمة للتحقق من زوالها.`); await load(); }
    catch (err) { setMessage(err instanceof Error ? err.message : 'تعذر إنهاء جلسة HotSpot'); }
    finally { setTerminating(''); }
  };

  return <>
    <div className="page-heading"><div><div className="eyebrow"><Clock3 size={14}/> مراقبة الاتصال</div><h1>الجلسات</h1><p>عرض موحّد لجلسات HotSpot الحية وسجل User Manager الذي يرسله الراوتر.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => void load()} disabled={!connected || loading}><RefreshCw size={15} className={loading ? 'spin' : ''}/> تحديث الجلسات</button></div></div>
    {!connected && <div className="inline-error page-error"><AlertCircle size={16}/>اتصل بالراوتر لقراءة الجلسات.</div>}
    {message && <div className={message.startsWith('تم إرسال') ? 'success-banner' : 'inline-error page-error'}><CheckCircle2 size={16}/>{message}</div>}
    <div className="readonly-banner"><ShieldCheck size={17}/><span>تعتمد سجلات جلسات User Manager على تفعيل Accounting على NAS. HotSpot يعرض الاتصالات النشطة فقط؛ يمكن قطع الجلسة النشطة من عمود الإجراء، ولا تتوفر هنا قائمة تاريخية للجلسات المنتهية. إنهاء جلسة UM غير مفعّل حتى اجتياز اختبار التوافق على RouterOS 6 و7.</span></div>
    {(hotspotError || managerError) && <div className="um-snapshot-notice"><AlertCircle size={15}/><span>{[hotspotError && `HotSpot: ${hotspotError}`, managerError && `User Manager: ${managerError}`].filter(Boolean).join(' · ')}</span></div>}
    <div className="voucher-stats"><div className="mini-stat"><span className="mini-stat-icon green"><Wifi size={17}/></span><span><small>جلسات نشطة</small><strong>{connected && !hotspotError && !managerError ? activeTotal : '—'}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon blue"><Router size={17}/></span><span><small>HotSpot النشطة</small><strong>{hotspotError ? '—' : hotspot.length}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon amber"><Users size={17}/></span><span><small>سجلات UM</small><strong>{managerError ? '—' : userManager.length}</strong></span></div></div>
    <section className="surface um-browser">
      <div className="um-browser-toolbar"><div className="um-tabs" role="group" aria-label="مصدر الجلسة">{([['all','الكل'],['hotspot','HotSpot'],['user_manager','User Manager']] as ['all'|'hotspot'|'user_manager',string][]).map(([value,label]) => <button type="button" className={`um-tab ${service === value ? 'um-tab-active' : ''}`} key={value} aria-pressed={service === value} onClick={() => { setService(value); setPage(0); }}><span>{label}</span></button>)}</div><label className="um-search"><Search size={16}/><input aria-label="البحث في الجلسات" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="مستخدم، MAC، IP، NAS…" /></label><label className="um-search origin-filter"><span>الحالة</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as SessionFilter); setPage(0); }}><option value="all">كل الحالات</option><option value="active">نشطة</option><option value="closed">منتهية</option><option value="expired">منتهية الصلاحية</option></select></label></div>
      {!connected && <div className="module-empty"><strong>لا يوجد راوتر متصل</strong><span>تُقرأ الجلسات مباشرةً ولا تُخزّن نسخة محلية.</span></div>}
      {connected && <><div className="table-scroll"><table><thead><tr><th>المستخدم</th><th>الخدمة / الحالة</th><th>البدء / الانتهاء</th><th>المدة</th><th>رفع / تنزيل</th><th>معرّف العميل</th><th>IP / NAS / منفذ</th><th>الإجراء</th></tr></thead><tbody>
        {shown.map((item) => <tr key={item.key}><td><strong>{item.user || 'غير متاح'}</strong>{item.profile && <small className="table-subline">الملف: {item.profile}{item.localPackage ? ` · الباقة: ${item.localPackage}` : ''}</small>}<small className="table-subline" dir="ltr">{item.sourceID}</small></td><td>{item.service === 'hotspot' ? 'HotSpot' : 'User Manager'}<small className="table-subline"><span className={`state-badge ${item.active ? 'state-on' : 'state-off'}`}><i/>{sessionStatusLabel(item.status, item.active)}</span></small></td><td>{item.started || 'غير متاح'}<small className="table-subline">{item.ended ? `انتهت ${item.ended}` : item.scheduledEnd ? `انتهاء/حد مجدول ${item.scheduledEnd}` : item.active ? 'قيد الاتصال' : 'وقت الانتهاء غير متاح'}</small></td><td>{item.uptime || 'غير متاح'}</td><td>{item.upload || item.download ? `${formatSessionBytes(item.upload)} / ${formatSessionBytes(item.download)}` : 'غير متاح'}</td><td dir="ltr">{item.identifier || 'غير متاح'}<small className="table-subline" dir="auto">{item.service === 'hotspot' ? 'MAC إن أعاده الراوتر' : 'Calling-Station-ID؛ قد لا يكون MAC'}</small></td><td dir="ltr">{item.address || 'غير متاح'}<small className="table-subline" dir="auto">{item.nas || 'NAS/المنفذ غير متاح'}</small></td><td>{item.service === 'hotspot' && item.active ? <button className="button button-quiet compact-button" onClick={() => void endSession(item)} disabled={terminating === item.key} title="قطع اتصال جلسة HotSpot النشطة">{terminating === item.key ? <LoaderCircle size={14} className="spin"/> : <Power size={14}/>} قطع الاتصال</button> : item.service === 'user_manager' && item.active ? <button className="button button-quiet compact-button" disabled title="معطّل حتى اجتياز بوابة توافق RouterOS 6 و7"><Power size={14}/> مؤجل</button> : '—'}</td></tr>)}
      </tbody></table></div>
      {!filtered.length && <div className="table-empty">لا توجد جلسات تطابق المرشحات الحالية. إذا كانت جلسات UM متوقعة، تحقق من تفعيل Accounting على NAS.</div>}
      <TablePagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(0); }} label="جلسة" />
      </>}
      {loading && <div className="um-loading"><LoaderCircle size={14} className="spin"/> جارٍ تحديث الجلسات…</div>}
    </section>
  </>;
}

function sessionStatusLabel(status: string, active: boolean) {
  if (active) return 'نشطة';
  if (normalizedProfileState(status).includes('expired')) return 'منتهية الصلاحية';
  return status ? `منتهية · ${status}` : 'منتهية';
}

function formatSessionBytes(value?: string) {
  if (!value) return '—';
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return value;
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let amount = bytes / 1024; let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toFixed(amount >= 100 ? 0 : 1)} ${units[unit]}`;
}

const A4_WIDTH_MM = 204;
const A4_HEIGHT_MM = 291;
const pageLayouts = [
  { columns: 3, rows: 10, label: '30 بطاقة · 3 أعمدة × 10 صفوف' },
  { columns: 3, rows: 15, label: '45 بطاقة · 3 أعمدة × 15 صفاً' },
  { columns: 3, rows: 9, label: '27 بطاقة · 3 أعمدة × 9 صفوف' },
  { columns: 4, rows: 15, label: '60 بطاقة · 4 أعمدة × 15 صفاً' },
  { columns: 3, rows: 20, label: '60 بطاقة · 3 أعمدة × 20 صفاً' },
];

const initialCard: CardTemplateDocument = {
  width_mm: 51,
  height_mm: 19.4,
  background: '#ffffff',
  background_mode: 'color',
  background_fit: 'cover',
  page_columns: 4,
  page_rows: 15,
  fields: [
    { id: 'title', kind: 'text' as const, field: '' as const, text: 'بطاقة إنترنت', x: 2, y: 1.2, width: 47, height: 4, font_size: 9, font_weight: 'bold', align: 'center' as const, color: '#167b70' },
    { id: 'user', kind: 'field' as const, field: 'username' as const, text: '', x: 2, y: 6.4, width: 47, height: 5, font_size: 12, font_weight: 'bold', align: 'center' as const, color: '#20383b' },
    { id: 'pass', kind: 'field' as const, field: 'password' as const, text: '', x: 2, y: 12.2, width: 47, height: 4, font_size: 9, font_weight: 'normal', align: 'center' as const, color: '#667c7d' },
  ],
};

export function StudioPage() {
  const [templates,setTemplates]=useState<Awaited<ReturnType<typeof api.templates>>>([]);
  const [packages,setPackages]=useState<Awaited<ReturnType<typeof api.packages>>>([]);
  const [distributors,setDistributors]=useState<Awaited<ReturnType<typeof api.distributors>>>([]);
  const [templateID,setTemplateID]=useState('');
  const [serviceType,setServiceType]=useState<'hotspot'|'user_manager'>('hotspot');
  const [packageID,setPackageID]=useState('');
  const [distributorID,setDistributorID]=useState('');
  const [scope,setScope]=useState<'global'|'package'|'distributor'>('global');
  const [name,setName]=useState('بطاقة جديدة');
  const [document,setDocument]=useState(initialCard);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [loading,setLoading]=useState(true);
  const [backgroundBusy,setBackgroundBusy]=useState(false);
  const [previewQuantity,setPreviewQuantity]=useState('60');
  const gesture=useRef<{id:string;startX:number;startY:number;x:number;y:number;width:number;height:number;scaleX:number;scaleY:number;resize:boolean}|null>(null);

  const load=async()=>{setLoading(true);setError('');try{const [list,packageList,distributorList]=await Promise.all([api.templates(),api.packages(),api.distributors()]);setTemplates(list);setPackages(packageList);setDistributors(distributorList);if(list.length&&!templateID){const first=await api.template(list[0].id);if(first.document){setTemplateID(first.id);setName(first.name);setServiceType(first.service_type);setPackageID(first.package_id);setDistributorID(first.distributor_id);setScope(first.scope);setDocument(first.document as typeof initialCard)}}}catch(err){setError(err instanceof Error?err.message:'تعذر تحميل القوالب')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const openTemplate=async(id:string)=>{if(!id){setTemplateID('');setName('بطاقة جديدة');setServiceType('hotspot');setPackageID('');setDistributorID('');setScope('global');setDocument(initialCard);return}setError('');try{const item=await api.template(id);if(item.document){setTemplateID(item.id);setName(item.name);setServiceType(item.service_type);setPackageID(item.package_id);setDistributorID(item.distributor_id);setScope(item.scope);setDocument(item.document as typeof initialCard)}}catch(err){setError(err instanceof Error?err.message:'تعذر فتح القالب')}};
  const updateField=(id:string,patch:Partial<CardTemplateField>)=>setDocument(current=>({...current,fields:current.fields.map(field=>field.id===id?{...field,...patch}:field)}));
  const gridColumns=document.page_columns??Math.max(1,Math.min(10,Math.floor(A4_WIDTH_MM/document.width_mm)));
  const gridRows=document.page_rows??Math.max(1,Math.min(29,Math.floor(A4_HEIGHT_MM/document.height_mm)));
  const activePreset=document.page_columns&&document.page_rows?pageLayouts.find(item=>item.columns===document.page_columns&&item.rows===document.page_rows):undefined;
  const sampleQuantity=Math.max(0,Math.min(5000,Number(previewQuantity)||0));
  const pageCapacity=gridColumns*gridRows;
  const estimatedPages=sampleQuantity?Math.ceil(sampleQuantity/pageCapacity):0;
  const finalPageCount=sampleQuantity?sampleQuantity-(estimatedPages-1)*pageCapacity:0;
  const selectedPackage=packages.find(item=>item.id===packageID);
  const updateGrid=(columns:number,rows:number)=>setDocument(current=>{const width=Number((A4_WIDTH_MM/columns).toFixed(2)),height=Number((A4_HEIGHT_MM/rows).toFixed(2)),scaleX=width/current.width_mm,scaleY=height/current.height_mm;return {...current,page_columns:columns,page_rows:rows,width_mm:width,height_mm:height,fields:current.fields.map(field=>{const x=Number((field.x*scaleX).toFixed(2)),y=Number((field.y*scaleY).toFixed(2));return {...field,x,y,width:Number(Math.min(width-x,Math.max(.5,field.width*scaleX)).toFixed(2)),height:Number(Math.min(height-y,Math.max(.5,field.height*scaleY)).toFixed(2)),font_size:Math.max(6,Math.min(48,Math.round(field.font_size*Math.min(scaleX,scaleY))))};})};});
  const uploadBackground=async(file?:File)=>{
    if(!file)return;
    if(!['image/png','image/jpeg'].includes(file.type)){setError('اختر صورة بصيغة PNG أو JPEG.');return;}
    if(file.size>20*1024*1024){setError('حجم الصورة الأصلية يجب ألا يتجاوز 20 ميغابايت.');return;}
    setBackgroundBusy(true);setError('');setSuccess('');
    try{
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      const canvas=window.document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('تعذر تجهيز الصورة في هذا المتصفح.');
      context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const image=canvas.toDataURL('image/jpeg',0.86);
      if(image.length>4*1024*1024)throw new Error('الصورة المضغوطة أكبر من الحد المسموح (3 ميغابايت). اختر صورة أصغر.');
      setDocument(current=>({...current,background_mode:'image',background_image:image}));setSuccess('تم تجهيز الصورة وحفظها ضمن تصميم القالب عند حفظ الإصدار.');
    }catch(err){setError(err instanceof Error?err.message:'تعذر تحميل صورة الخلفية.');}
    finally{setBackgroundBusy(false);}
  };
  const save=async(event?:FormEvent)=>{event?.preventDefault();setBusy(true);setError('');setSuccess('');try{const saved=await api.saveTemplate({id:templateID||undefined,name,service_type:serviceType,package_id:packageID||undefined,distributor_id:distributorID||undefined,scope,document});setTemplateID(saved.id);setName(saved.name);setServiceType(saved.service_type);setPackageID(saved.package_id);setDistributorID(saved.distributor_id);setScope(saved.scope);setDocument(saved.document as typeof initialCard);setSuccess(`حُفظ الإصدار ${saved.version}. الإصدارات السابقة تبقى ثابتة.`);await load()}catch(err){setError(err instanceof Error?err.message:'تعذر حفظ القالب')}finally{setBusy(false)}};
  const archiveTemplate=async()=>{if(!templateID||!window.confirm(`سيتم أرشفة «${name}» وإخفاؤه من الاختيارات الجديدة مع إبقاء الدفعات والإصدارات القديمة. هل تريد المتابعة؟`))return;setBusy(true);setError('');try{await api.archiveTemplate(templateID);setTemplateID('');setName('بطاقة جديدة');setServiceType('hotspot');setScope('global');setPackageID('');setDistributorID('');setDocument(initialCard);setSuccess('تمت أرشفة القالب دون حذف الإصدارات المستخدمة سابقاً.');await load()}catch(err){setError(err instanceof Error?err.message:'تعذرت أرشفة القالب')}finally{setBusy(false)}};
  const duplicateTemplate=async()=>{if(!templateID)return;const duplicateName=`${name.trim()||'قالب'} - نسخة`.slice(0,100);setBusy(true);setError('');setSuccess('');try{const copy=await api.saveTemplate({name:duplicateName,service_type:serviceType,package_id:packageID||undefined,distributor_id:distributorID||undefined,scope,document});setTemplateID(copy.id);setName(copy.name);setServiceType(copy.service_type);setPackageID(copy.package_id);setDistributorID(copy.distributor_id);setScope(copy.scope);setDocument(copy.document as typeof initialCard);setSuccess('أُنشئ قالب مستقل عن الأصل؛ تعديل النسخة لن يغيّر الإصدارات السابقة.');await load()}catch(err){setError(err instanceof Error?err.message:'تعذر نسخ القالب؛ تحقق من عدم تكرار الاسم.')}finally{setBusy(false)}};
  const addField=()=>{const id=`field-${Date.now()}`;const field:CardTemplateField={id,kind:'field',field:'validity',text:'',x:2,y:2,width:47,height:4,font_size:8,font_weight:'normal',align:'center',color:'#45605e'};setDocument(current=>({...current,fields:[...current.fields,field]}))};
  const deleteField=(id:string)=>setDocument(current=>({...current,fields:current.fields.filter(field=>field.id!==id)}));
  const startGesture=(event:PointerEvent<HTMLElement>,field:CardTemplateField,resize=false)=>{
    event.preventDefault();event.stopPropagation();
    const card=event.currentTarget.closest('.printable-card') as HTMLElement|null;if(!card)return;
    const rect=card.getBoundingClientRect();
    gesture.current={id:field.id,startX:event.clientX,startY:event.clientY,x:field.x,y:field.y,width:field.width,height:field.height,scaleX:rect.width/document.width_mm,scaleY:rect.height/document.height_mm,resize};
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveGesture=(event:PointerEvent<HTMLDivElement>)=>{
    const drag=gesture.current;if(!drag)return;
    const dx=(event.clientX-drag.startX)/drag.scaleX,dy=(event.clientY-drag.startY)/drag.scaleY;
    setDocument(current=>({...current,fields:current.fields.map(field=>{
      if(field.id!==drag.id)return field;
      if(drag.resize)return {...field,width:Math.max(1,Math.min(current.width_mm-field.x,drag.width+dx)),height:Math.max(1,Math.min(current.height_mm-field.y,drag.height+dy))};
      return {...field,x:Math.max(0,Math.min(current.width_mm-field.width,drag.x+dx)),y:Math.max(0,Math.min(current.height_mm-field.height,drag.y+dy))};
    })}));
  };
  const endGesture=()=>{gesture.current=null;};

  return <>
    <div className="page-heading"><div><div className="eyebrow"><Printer size={14}/> التصميم والطباعة</div><h1>استوديو البطاقات</h1><p>حرّر عناصر البطاقة بقياسات مليمترية، واحفظ نسخاً ثابتة للطباعة.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={()=>window.print()}><Printer size={15}/> طباعة / حفظ PDF</button><button className="button button-primary" onClick={()=>void save()} disabled={busy||backgroundBusy||(document.background_mode==='image'&&!document.background_image)}><Save size={15}/> حفظ إصدار</button></div></div>
    {error&&<div className="inline-error page-error"><AlertCircle size={16}/>{error}</div>}{success&&<div className="success-banner"><CheckCircle2 size={17}/>{success}</div>}
    <div className="studio-layout">
      <section className="surface studio-editor">
        <div className="surface-heading"><div><h3>إعداد القالب</h3><p>المخرجات السابقة لا تتغير عند حفظ إصدار جديد.</p></div><div className="studio-heading-actions">{templateID&&<><button type="button" className="button button-quiet compact-button" onClick={()=>void duplicateTemplate()} disabled={busy}><Copy size={14}/> نسخ القالب</button><button type="button" className="button button-quiet compact-button" onClick={()=>void archiveTemplate()} disabled={busy}><Archive size={14}/> أرشفة القالب</button></>}<span className="heading-icon"><Eye size={17}/></span></div></div>
        <form onSubmit={save}>
          <label className="field studio-template-select"><span>قالب محفوظ</span><select value={templateID} onChange={e=>void openTemplate(e.target.value)}><option value="">إنشاء قالب جديد</option>{templates.map(item=><option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label>
          <label className="field"><span>اسم القالب</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required /></label>
          <div className="template-scope-fields"><label className="field"><span>نوع الخدمة</span><select value={serviceType} onChange={e=>{setServiceType(e.target.value as typeof serviceType);setPackageID('');}}><option value="hotspot">HotSpot</option><option value="user_manager">User Manager</option></select></label><label className="field"><span>نطاق القالب</span><select value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="global">عام</option><option value="package">خاص بالباقة</option><option value="distributor">خاص بموزع وباقة</option></select></label><label className="field"><span>الباقة {scope!=='global'?'*':'(اختياري للقالب العام)'}</span><select value={packageID} onChange={e=>setPackageID(e.target.value)} required={scope!=='global'}><option value="">{scope==='global'?'كل الباقات':'اختر باقة'}</option>{packages.filter(item=>item.service_type===serviceType).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{scope==='distributor'&&<label className="field"><span>الموزع <b>*</b></span><select value={distributorID} onChange={e=>setDistributorID(e.target.value)} required><option value="">اختر موزعاً</option>{distributors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>
          <label className="field studio-layout-choice"><span>توزيع البطاقة على ورقة A4</span><select value={activePreset?`${activePreset.columns}x${activePreset.rows}`:'custom'} onChange={e=>{const chosen=pageLayouts.find(item=>`${item.columns}x${item.rows}`===e.target.value);if(chosen)updateGrid(chosen.columns,chosen.rows);}}><option value="custom">مقاس مخصص حسب الأعمدة والصفوف</option>{pageLayouts.map(item=><option key={`${item.columns}x${item.rows}`} value={`${item.columns}x${item.rows}`}>{item.label}</option>)}</select></label>
          <div className="studio-dimensions"><label className="field"><span>عدد الأعمدة</span><input type="number" min={1} max={10} step={1} value={gridColumns} onChange={e=>{const value=Number(e.target.value);if(value>=1&&value<=10)updateGrid(value,gridRows);}}/></label><label className="field"><span>عدد الصفوف</span><input type="number" min={1} max={29} step={1} value={gridRows} onChange={e=>{const value=Number(e.target.value);if(value>=1&&value<=29)updateGrid(gridColumns,value);}}/></label></div>
          <div className="studio-size-note">مساحة الطباعة A4 بعد الهوامش: 204 × 291 مم · مقاس البطاقة الناتج: <bdi>{document.width_mm} × {document.height_mm} مم</bdi> · {pageCapacity} بطاقة كحد أقصى في الصفحة.</div><section className="template-output-summary"><div className="template-output-summary-heading"><strong>ملخص إخراج القالب</strong><small>تقدير تخطيطي للطباعة فقط؛ لا ينشئ دفعة أو حركة مالية.</small></div><label className="field"><span>عدد البطاقات المتوقع</span><input type="number" min={1} max={5000} step={1} value={previewQuantity} onChange={event=>setPreviewQuantity(event.target.value)}/></label><div className="template-output-metrics"><div><small>السعة في الصفحة</small><strong>{pageCapacity} بطاقة</strong></div><div><small>الصفحات التقديرية</small><strong>{estimatedPages||'—'}</strong></div><div><small>البطاقات في الصفحة الأخيرة</small><strong>{finalPageCount||'—'}</strong></div>{selectedPackage&&<><div><small>قيمة التسعير المرجعية</small><strong>{(selectedPackage.price_minor*sampleQuantity/100).toLocaleString('ar-YE',{minimumFractionDigits:2,maximumFractionDigits:2})} YER</strong></div><div><small>الهامش النظري</small><strong>{((selectedPackage.price_minor-selectedPackage.distributor_price_minor)*sampleQuantity/100).toLocaleString('ar-YE',{minimumFractionDigits:2,maximumFractionDigits:2})} YER</strong></div></>}</div><p>مجموع التسعير والهامش معلومات تخطيط فقط، وليسا مبيعات أو تحصيلاً. التخطيط لا يحسب هوامش طابعة أو ورق.</p></section>
          <div className="field background-field"><span className="field-label-text">خلفية البطاقة</span><div className="background-mode-tabs"><button type="button" className={document.background_mode!=='image'?'selected':''} onClick={()=>setDocument(current=>({...current,background_mode:'color'}))}>لون</button><button type="button" className={document.background_mode==='image'?'selected':''} onClick={()=>setDocument(current=>({...current,background_mode:'image'}))}>صورة</button></div>{document.background_mode==='image'?<div className="background-upload"><label className="button button-quiet compact-button"><input type="file" accept="image/png,image/jpeg" onChange={e=>void uploadBackground(e.target.files?.[0])} disabled={backgroundBusy}/>{backgroundBusy?<LoaderCircle size={14} className="spin"/>:<Plus size={14}/>} اختيار صورة من الجهاز</label>{document.background_image?<><img className="background-thumb" src={document.background_image} alt="معاينة خلفية البطاقة"/><label className="background-fit-select"><span>ملاءمة الصورة</span><select value={document.background_fit??'cover'} onChange={e=>setDocument(current=>({...current,background_fit:e.target.value as 'cover'|'contain'|'fill'}))}><option value="cover">ملء مع قص الزائد</option><option value="contain">إظهار كاملة مع احتمال وجود فراغات</option><option value="fill">تمديد دون قص أو فراغ (قد تتغير النسب)</option></select></label><button type="button" className="disable-link" onClick={()=>setDocument(current=>({...current,background_image:undefined,background_mode:'color'}))}>إزالة الصورة</button></>:<small>PNG أو JPEG · تضغط الصورة تلقائياً · الحد الأقصى 3 ميغابايت بعد الضغط.</small>}</div>:<input type="color" value={document.background} onChange={e=>setDocument(current=>({...current,background:e.target.value}))}/>}</div>
          <div className="editor-section-heading"><div><strong>عناصر البطاقة</strong><small>{document.fields.length} عناصر · يمكنك تعديل موضع كل عنصر بالمليمتر</small></div><button type="button" className="button button-quiet compact-button" onClick={addField}><Plus size={14}/> عنصر</button></div>
          <div className="field-editor-list">{document.fields.map((field,index)=><div className="field-editor" key={field.id}><div className="field-editor-top"><strong>{field.kind==='text'?`نص ثابت ${index+1}`:`حقل ${field.field||index+1}`}</strong><button type="button" className="disable-link" onClick={()=>deleteField(field.id)}>إزالة</button></div>
              <div className="field-editor-controls"><select aria-label="نوع العنصر" value={field.kind} onChange={e=>updateField(field.id,{kind:e.target.value as CardTemplateField['kind']})}><option value="text">نص ثابت</option><option value="field">حقل متغير</option></select>{field.kind==='field'?<select aria-label="الحقل المتغير" value={field.field} onChange={e=>updateField(field.id,{field:e.target.value as CardTemplateField['field']})}><option value="username">اسم المستخدم</option><option value="password">كلمة المرور</option><option value="package">اسم الباقة</option><option value="validity">الصلاحية</option><option value="date">التاريخ</option><option value="print_date">تاريخ الطباعة</option><option value="qrcode">QR للاسم وكلمة المرور</option></select>:<input aria-label="النص" value={field.text} onChange={e=>updateField(field.id,{text:e.target.value})} placeholder="اكتب النص"/>}</div>
              <div className="field-editor-measures"><label>س X<input type="number" min={0} step="0.5" value={field.x} onChange={e=>updateField(field.id,{x:Number(e.target.value)})}/></label><label>ص Y<input type="number" min={0} step="0.5" value={field.y} onChange={e=>updateField(field.id,{y:Number(e.target.value)})}/></label><label>عرض<input type="number" min={1} step="0.5" value={field.width} onChange={e=>updateField(field.id,{width:Number(e.target.value)})}/></label><label>حجم الخط<input type="number" min={6} max={48} step="1" value={field.font_size} onChange={e=>updateField(field.id,{font_size:Number(e.target.value)})}/></label></div>
            </div>)}</div>
          <button className="button button-primary studio-save" type="submit" disabled={busy||loading||backgroundBusy||(document.background_mode==='image'&&!document.background_image)}>{busy?<LoaderCircle size={15} className="spin"/>:<Save size={15}/>} حفظ كإصدار جديد</button>
        </form>
      </section>
      <section className="surface studio-preview-panel"><div className="surface-heading"><div><h3>معاينة البطاقة</h3><p>نموذج تجريبي — لا يتضمن بيانات مستخدم حقيقية.</p></div><span className="preview-mm">{document.width_mm} × {document.height_mm} مم</span></div>
        <div className="preview-stage"><div className="printable-card" style={{width:`${document.width_mm}mm`,height:`${document.height_mm}mm`,backgroundColor:document.background} as CSSProperties}>{document.background_mode==='image'&&document.background_image&&<img className="card-preview-image" src={document.background_image} alt="" style={{objectFit:document.background_fit??'cover'}}/>}{document.fields.map(field=><div key={field.id} className="preview-field" onPointerDown={(event)=>startGesture(event,field)} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} style={{left:`${field.x}mm`,top:`${field.y}mm`,width:`${field.width}mm`,height:`${field.height}mm`,fontSize:`${field.font_size}pt`,fontWeight:field.font_weight==='bold'?700:400,textAlign:field.align,color:field.color||'#20383b'} as CSSProperties}>{field.kind==='text'?field.text:field.field==='qrcode'?<QRCodeSVG value={JSON.stringify({username:'BT2K8M4Q',password:'demo-only'})} size={128} style={{width:'100%',height:'100%'}}/>:({username:'BT2K8M4Q',password:'••••••••',package:'باقة تجريبية',validity:'24 ساعة',date:new Date().toLocaleDateString('ar-YE'),print_date:new Date().toLocaleDateString('ar-YE')} as Record<string,string>)[field.field]||''}<span className="resize-handle" title="اسحب لتغيير الحجم" onPointerDown={(event)=>startGesture(event,field,true)} /></div>)}</div></div>
        <div className="preview-tools"><span><CheckCircle2 size={14}/> معاينة بقياسات حقيقية</span><button className="text-button" onClick={()=>window.print()}><Download size={14}/> حفظ / طباعة PDF</button></div>
        <div className="template-history"><strong>الإصدارات المحفوظة</strong>{templates.length?templates.map(item=><button key={item.id} onClick={()=>void openTemplate(item.id)} className={item.id===templateID?'history-active':''}><span>{item.name}</span><small>v{item.version}</small></button>):<small>لا توجد إصدارات بعد</small>}</div>
      </section>
    </div>
  </>;
}
