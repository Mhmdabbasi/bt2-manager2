import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertCircle, Archive, ArrowUpLeft, Boxes, CheckCircle2, Download, Eye, LoaderCircle, Network, PackageCheck, Pencil, Plus, Power, Printer, RefreshCw, Save, Settings2, ShieldCheck, Users, X } from 'lucide-react';
import { api, type CardTemplateDocument, type CardTemplateField, type DistributorPackagePolicy } from './api';
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
    <section className="surface table-panel inventory-events"><div className="table-heading"><div><h3>سجل الحركات الأخير</h3><p>كل حركة تسجل كسطر مستقل؛ لا يعاد كتابة التاريخ السابق.</p></div><span className="profile-count">{snapshot?.events.length ?? 0} حركة</span></div>{snapshot?.events.length ? <><div className="table-scroll"><table><thead><tr><th>الوقت</th><th>القسيمة</th><th>الحركة</th><th>من</th><th>إلى</th></tr></thead><tbody>{snapshot.events.slice(eventsPage*eventsPageSize,(eventsPage+1)*eventsPageSize).map((e) => <tr key={e.id}><td>{new Date(e.created_at).toLocaleString('ar')}</td><td><strong>{e.username}</strong></td><td>{movementLabel(e.type)}</td><td>{e.from}</td><td>{e.to}</td></tr>)}</tbody></table></div><TablePagination page={eventsPage} pageSize={eventsPageSize} total={snapshot.events.length} onPage={setEventsPage} onPageSize={(size)=>{setEventsPageSize(size);setEventsPage(0);}} label="حركة" /></> : <div className="table-empty">لا توجد حركات مخزون مسجلة بعد.</div>}</section>
  </>;
}

function movementLabel(type: string) { return ({ issue: 'إصدار', allocate: 'تخصيص', transfer: 'تحويل', return: 'إرجاع', adjustment: 'تسوية' } as Record<string,string>)[type] || type; }


export function UserManagerPage({ connected }: Props) {
  const [snapshot,setSnapshot]=useState<Awaited<ReturnType<typeof api.userManager>>|null>(null);
  const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const load=async()=>{if(!connected)return;setLoading(true);setError('');try{setSnapshot(await api.userManager())}catch(err){setError(err instanceof Error?err.message:'تعذر قراءة لقطة User Manager')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[connected]);
  const sync=async()=>{setBusy(true);setError('');setSuccess('');try{const result=await api.syncUserManager();setSnapshot(result);setSuccess(`تمت مزامنة ${result.profiles.length} ملفاً و${result.limitations.length} قيداً للقراءة فقط.`)}catch(err){setError(err instanceof Error?err.message:'تعذرت المزامنة؛ لم تتغير اللقطة السابقة')}finally{setBusy(false)}};
  return <>
    <div className="page-heading"><div><div className="eyebrow"><Users size={14}/> مزامنة قراءة فقط</div><h1>User Manager</h1><p>قراءة الملفات والقيود والعلاقات فقط. لا تتم قراءة كلمات مرور المستخدمين ولا كتابة بيانات على الراوتر.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={()=>void load()} disabled={!connected||loading}><RefreshCw size={15} className={loading?'spin':''}/> تحديث اللقطة</button><button className="button button-primary" onClick={()=>void sync()} disabled={!connected||busy}><RefreshCw size={15} className={busy?'spin':''}/> مزامنة قراءة فقط</button></div></div>
    {!connected&&<div className="inline-error page-error"><AlertCircle size={16}/>اتصل بالراوتر أولاً. تتطلب المزامنة تثبيت User Manager وتفعيل صلاحية القراءة.</div>}
    {error&&<div className="inline-error page-error"><AlertCircle size={16}/>{error}</div>}{success&&<div className="success-banner"><CheckCircle2 size={17}/>{success}</div>}
    <div className="readonly-banner"><ShieldCheck size={17}/><span><strong>وضع قراءة فقط</strong> · تُستبدل اللقطة محلياً داخل معاملة واحدة بعد اكتمال جميع القراءات؛ الفشل لا يمحو آخر لقطة ناجحة.</span></div>
    <div className="voucher-stats"><div className="mini-stat"><span className="mini-stat-icon blue"><Users size={17}/></span><span><small>الملفات</small><strong>{snapshot?.profiles.length??'—'}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon green"><Boxes size={17}/></span><span><small>القيود</small><strong>{snapshot?.limitations.length??'—'}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon amber"><Network size={17}/></span><span><small>علاقات الملف والقيود</small><strong>{snapshot?.profile_limitations.length??'—'}</strong></span></div></div>
    {snapshot?.major_version&&<div className="readonly-meta"><span>RouterOS v{snapshot.major_version}</span><span>{snapshot.router?.identity||'الراوتر النشط'}</span><span>{snapshot.synced_at?`آخر مزامنة ${new Date(snapshot.synced_at).toLocaleString('ar')}`:'تُعرض آخر لقطة محفوظة'}</span></div>}
    <div className="um-columns"><section className="surface um-list"><div className="surface-heading"><div><h3>ملفات User Manager</h3><p>الإصدار الحالي: {snapshot?.major_version?`v${snapshot.major_version}`:'غير متزامن'}</p></div><span className="profile-count">{snapshot?.profiles.length??0} ملف</span></div>{snapshot?.profiles.length?snapshot.profiles.map((p)=><article className="um-record" key={p.source_id}><div className="package-mark"><Users size={17}/></div><div className="package-copy"><strong>{p.name}</strong><small>{Object.entries(p.properties).filter(([key])=>key!=='name'&&key!=='.id').slice(0,3).map(([k,v])=>`${k}: ${v}`).join(' · ')||'لا توجد خصائص عرض إضافية'}</small></div><span className={`state-badge ${p.present===false?'state-off':'state-on'}`}><i/>{p.present===false?'غائب':'موجود'}</span></article>):<div className="module-empty"><div className="empty-icon"><Users size={18}/></div><strong>{loading?'جارٍ القراءة…':'لا توجد لقطة محفوظة'}</strong><span>ابدأ بمزامنة قراءة فقط من الراوتر النشط.</span></div>}</section>
      <section className="surface um-list"><div className="surface-heading"><div><h3>القيود والعلاقات</h3><p>يحافظ التطبيق على تعدد القيود لكل ملف.</p></div><span className="profile-count">{snapshot?.limitations.length??0} قيد</span></div>{snapshot?.limitations.map((l)=><article className="um-record" key={l.source_id}><div className="package-mark limitation-mark"><Settings2 size={17}/></div><div className="package-copy"><strong>{l.name}</strong><small>{Object.entries(l.properties).filter(([key])=>key!=='name'&&key!=='.id').slice(0,3).map(([k,v])=>`${k}: ${v}`).join(' · ')||'لا توجد خصائص عرض إضافية'}</small></div><span className={`state-badge ${l.present===false?'state-off':'state-on'}`}><i/>{l.present===false?'غائب':'موجود'}</span></article>)}{snapshot?.limitations.length===0&&<div className="module-empty"><span className="empty-icon"><Boxes size={18}/></span><strong>لا توجد قيود</strong><span>قد لا تكون حزمة User Manager مثبتة أو قد تكون القائمة فارغة.</span></div>}
        {!!snapshot?.profile_limitations.length&&<div className="relation-list"><h4>العلاقات المرتبطة</h4>{snapshot.profile_limitations.map((relation,index)=><div className="relation-row" key={`${relation.profile_source_id}-${relation.limitation_source_id}-${index}`}><span>{relation.profile_name||relation.profile_source_id}</span><ArrowUpLeft size={13}/><strong>{relation.limitation_name||relation.limitation_source_id}</strong><small>ترتيب {relation.position+1}</small></div>)}</div>}
      </section></div>
  </>;
}

const initialCard: CardTemplateDocument = {
  width_mm: 51,
  height_mm: 18.8,
  background: '#ffffff',
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
  const gesture=useRef<{id:string;startX:number;startY:number;x:number;y:number;width:number;height:number;scaleX:number;scaleY:number;resize:boolean}|null>(null);

  const load=async()=>{setLoading(true);setError('');try{const [list,packageList,distributorList]=await Promise.all([api.templates(),api.packages(),api.distributors()]);setTemplates(list);setPackages(packageList);setDistributors(distributorList);if(list.length&&!templateID){const first=await api.template(list[0].id);if(first.document){setTemplateID(first.id);setName(first.name);setServiceType(first.service_type);setPackageID(first.package_id);setDistributorID(first.distributor_id);setScope(first.scope);setDocument(first.document as typeof initialCard)}}}catch(err){setError(err instanceof Error?err.message:'تعذر تحميل القوالب')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const openTemplate=async(id:string)=>{if(!id){setTemplateID('');setName('بطاقة جديدة');setServiceType('hotspot');setPackageID('');setDistributorID('');setScope('global');setDocument(initialCard);return}setError('');try{const item=await api.template(id);if(item.document){setTemplateID(item.id);setName(item.name);setServiceType(item.service_type);setPackageID(item.package_id);setDistributorID(item.distributor_id);setScope(item.scope);setDocument(item.document as typeof initialCard)}}catch(err){setError(err instanceof Error?err.message:'تعذر فتح القالب')}};
  const updateField=(id:string,patch:Partial<CardTemplateField>)=>setDocument(current=>({...current,fields:current.fields.map(field=>field.id===id?{...field,...patch}:field)}));
  const save=async(event?:FormEvent)=>{event?.preventDefault();setBusy(true);setError('');setSuccess('');try{const saved=await api.saveTemplate({id:templateID||undefined,name,service_type:serviceType,package_id:packageID||undefined,distributor_id:distributorID||undefined,scope,document});setTemplateID(saved.id);setName(saved.name);setServiceType(saved.service_type);setPackageID(saved.package_id);setDistributorID(saved.distributor_id);setScope(saved.scope);setDocument(saved.document as typeof initialCard);setSuccess(`حُفظ الإصدار ${saved.version}. الإصدارات السابقة تبقى ثابتة.`);await load()}catch(err){setError(err instanceof Error?err.message:'تعذر حفظ القالب')}finally{setBusy(false)}};
  const archiveTemplate=async()=>{if(!templateID||!window.confirm(`سيتم أرشفة «${name}» وإخفاؤه من الاختيارات الجديدة مع إبقاء الدفعات والإصدارات القديمة. هل تريد المتابعة؟`))return;setBusy(true);setError('');try{await api.archiveTemplate(templateID);setTemplateID('');setName('بطاقة جديدة');setServiceType('hotspot');setScope('global');setPackageID('');setDistributorID('');setDocument(initialCard);setSuccess('تمت أرشفة القالب دون حذف الإصدارات المستخدمة سابقاً.');await load()}catch(err){setError(err instanceof Error?err.message:'تعذرت أرشفة القالب')}finally{setBusy(false)}};
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
    <div className="page-heading"><div><div className="eyebrow"><Printer size={14}/> التصميم والطباعة</div><h1>استوديو البطاقات</h1><p>حرّر عناصر البطاقة بقياسات مليمترية، واحفظ نسخاً ثابتة للطباعة.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={()=>window.print()}><Printer size={15}/> طباعة / حفظ PDF</button><button className="button button-primary" onClick={()=>void save()} disabled={busy}><Save size={15}/> حفظ إصدار</button></div></div>
    {error&&<div className="inline-error page-error"><AlertCircle size={16}/>{error}</div>}{success&&<div className="success-banner"><CheckCircle2 size={17}/>{success}</div>}
    <div className="studio-layout">
      <section className="surface studio-editor">
        <div className="surface-heading"><div><h3>إعداد القالب</h3><p>المخرجات السابقة لا تتغير عند حفظ إصدار جديد.</p></div><div className="studio-heading-actions">{templateID&&<button type="button" className="button button-quiet compact-button" onClick={()=>void archiveTemplate()} disabled={busy}><Archive size={14}/> أرشفة القالب</button>}<span className="heading-icon"><Eye size={17}/></span></div></div>
        <form onSubmit={save}>
          <label className="field studio-template-select"><span>قالب محفوظ</span><select value={templateID} onChange={e=>void openTemplate(e.target.value)}><option value="">إنشاء قالب جديد</option>{templates.map(item=><option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label>
          <label className="field"><span>اسم القالب</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required /></label>
          <div className="template-scope-fields"><label className="field"><span>نوع الخدمة</span><select value={serviceType} onChange={e=>{setServiceType(e.target.value as typeof serviceType);setPackageID('');}}><option value="hotspot">HotSpot</option><option value="user_manager">User Manager</option></select></label><label className="field"><span>نطاق القالب</span><select value={scope} onChange={e=>setScope(e.target.value as typeof scope)}><option value="global">عام</option><option value="package">خاص بالباقة</option><option value="distributor">خاص بموزع وباقة</option></select></label><label className="field"><span>الباقة {scope!=='global'?'*':'(اختياري للقالب العام)'}</span><select value={packageID} onChange={e=>setPackageID(e.target.value)} required={scope!=='global'}><option value="">{scope==='global'?'كل الباقات':'اختر باقة'}</option>{packages.filter(item=>item.service_type===serviceType).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{scope==='distributor'&&<label className="field"><span>الموزع <b>*</b></span><select value={distributorID} onChange={e=>setDistributorID(e.target.value)} required><option value="">اختر موزعاً</option>{distributors.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}</div>
          <div className="studio-dimensions"><label className="field"><span>العرض (مم)</span><input type="number" min={20} max={100} step="0.1" value={document.width_mm} onChange={e=>setDocument(current=>({...current,width_mm:Number(e.target.value)}))}/></label><label className="field"><span>الارتفاع (مم)</span><input type="number" min={10} max={60} step="0.1" value={document.height_mm} onChange={e=>setDocument(current=>({...current,height_mm:Number(e.target.value)}))}/></label></div>
          <label className="field background-field"><span>لون الخلفية</span><input type="color" value={document.background} onChange={e=>setDocument(current=>({...current,background:e.target.value}))}/></label>
          <div className="editor-section-heading"><div><strong>عناصر البطاقة</strong><small>{document.fields.length} عناصر · يمكنك تعديل موضع كل عنصر بالمليمتر</small></div><button type="button" className="button button-quiet compact-button" onClick={addField}><Plus size={14}/> عنصر</button></div>
          <div className="field-editor-list">{document.fields.map((field,index)=><div className="field-editor" key={field.id}><div className="field-editor-top"><strong>{field.kind==='text'?`نص ثابت ${index+1}`:`حقل ${field.field||index+1}`}</strong><button type="button" className="disable-link" onClick={()=>deleteField(field.id)}>إزالة</button></div>
              <div className="field-editor-controls"><select aria-label="نوع العنصر" value={field.kind} onChange={e=>updateField(field.id,{kind:e.target.value as CardTemplateField['kind']})}><option value="text">نص ثابت</option><option value="field">حقل متغير</option></select>{field.kind==='field'?<select aria-label="الحقل المتغير" value={field.field} onChange={e=>updateField(field.id,{field:e.target.value as CardTemplateField['field']})}><option value="username">اسم المستخدم</option><option value="password">كلمة المرور</option><option value="package">اسم الباقة</option><option value="validity">الصلاحية</option><option value="date">التاريخ</option><option value="print_date">تاريخ الطباعة</option><option value="qrcode">QR للاسم وكلمة المرور</option></select>:<input aria-label="النص" value={field.text} onChange={e=>updateField(field.id,{text:e.target.value})} placeholder="اكتب النص"/>}</div>
              <div className="field-editor-measures"><label>س X<input type="number" min={0} step="0.5" value={field.x} onChange={e=>updateField(field.id,{x:Number(e.target.value)})}/></label><label>ص Y<input type="number" min={0} step="0.5" value={field.y} onChange={e=>updateField(field.id,{y:Number(e.target.value)})}/></label><label>عرض<input type="number" min={1} step="0.5" value={field.width} onChange={e=>updateField(field.id,{width:Number(e.target.value)})}/></label><label>حجم الخط<input type="number" min={6} max={48} step="1" value={field.font_size} onChange={e=>updateField(field.id,{font_size:Number(e.target.value)})}/></label></div>
            </div>)}</div>
          <button className="button button-primary studio-save" type="submit" disabled={busy||loading}>{busy?<LoaderCircle size={15} className="spin"/>:<Save size={15}/>} حفظ كإصدار جديد</button>
        </form>
      </section>
      <section className="surface studio-preview-panel"><div className="surface-heading"><div><h3>معاينة البطاقة</h3><p>نموذج تجريبي — لا يتضمن بيانات مستخدم حقيقية.</p></div><span className="preview-mm">{document.width_mm} × {document.height_mm} مم</span></div>
        <div className="preview-stage"><div className="printable-card" style={{width:`${document.width_mm}mm`,height:`${document.height_mm}mm`,background:document.background} as CSSProperties}>{document.fields.map(field=><div key={field.id} className="preview-field" onPointerDown={(event)=>startGesture(event,field)} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} style={{left:`${field.x}mm`,top:`${field.y}mm`,width:`${field.width}mm`,height:`${field.height}mm`,fontSize:`${field.font_size}pt`,fontWeight:field.font_weight==='bold'?700:400,textAlign:field.align,color:field.color||'#20383b'} as CSSProperties}>{field.kind==='text'?field.text:field.field==='qrcode'?<QRCodeSVG value={JSON.stringify({username:'BT2K8M4Q',password:'demo-only'})} size={128} style={{width:'100%',height:'100%'}}/>:({username:'BT2K8M4Q',password:'••••••••',package:'باقة تجريبية',validity:'24 ساعة',date:new Date().toLocaleDateString('ar-YE'),print_date:new Date().toLocaleDateString('ar-YE')} as Record<string,string>)[field.field]||''}<span className="resize-handle" title="اسحب لتغيير الحجم" onPointerDown={(event)=>startGesture(event,field,true)} /></div>)}</div></div>
        <div className="preview-tools"><span><CheckCircle2 size={14}/> معاينة بقياسات حقيقية</span><button className="text-button" onClick={()=>window.print()}><Download size={14}/> حفظ / طباعة PDF</button></div>
        <div className="template-history"><strong>الإصدارات المحفوظة</strong>{templates.length?templates.map(item=><button key={item.id} onClick={()=>void openTemplate(item.id)} className={item.id===templateID?'history-active':''}><span>{item.name}</span><small>v{item.version}</small></button>):<small>لا توجد إصدارات بعد</small>}</div>
      </section>
    </div>
  </>;
}
