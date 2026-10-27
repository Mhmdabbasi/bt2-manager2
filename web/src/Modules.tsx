import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { AlertCircle, ArrowUpLeft, Boxes, CheckCircle2, Download, Eye, LoaderCircle, Network, PackageCheck, Plus, Printer, RefreshCw, Save, Settings2, ShieldCheck, Users } from 'lucide-react';
import { api, type CardTemplateDocument, type CardTemplateField } from './api';

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
  const [templateID,setTemplateID]=useState('');
  const [name,setName]=useState('بطاقة جديدة');
  const [document,setDocument]=useState(initialCard);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [loading,setLoading]=useState(true);

  const load=async()=>{setLoading(true);setError('');try{const list=await api.templates();setTemplates(list);if(list.length&&!templateID){const first=await api.template(list[0].id);if(first.document){setTemplateID(first.id);setName(first.name);setDocument(first.document as typeof initialCard)}}}catch(err){setError(err instanceof Error?err.message:'تعذر تحميل القوالب')}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);
  const openTemplate=async(id:string)=>{if(!id){setTemplateID('');setName('بطاقة جديدة');setDocument(initialCard);return}setError('');try{const item=await api.template(id);if(item.document){setTemplateID(item.id);setName(item.name);setDocument(item.document as typeof initialCard)}}catch(err){setError(err instanceof Error?err.message:'تعذر فتح القالب')}};
  const updateField=(id:string,patch:Partial<CardTemplateField>)=>setDocument(current=>({...current,fields:current.fields.map(field=>field.id===id?{...field,...patch}:field)}));
  const save=async(event?:FormEvent)=>{event?.preventDefault();setBusy(true);setError('');setSuccess('');try{const saved=await api.saveTemplate({id:templateID||undefined,name,document});setTemplateID(saved.id);setName(saved.name);setDocument(saved.document as typeof initialCard);setSuccess(`حُفظ الإصدار ${saved.version}. الإصدارات السابقة تبقى ثابتة.`);await load()}catch(err){setError(err instanceof Error?err.message:'تعذر حفظ القالب')}finally{setBusy(false)}};
  const addField=()=>{const id=`field-${Date.now()}`;const field:CardTemplateField={id,kind:'field',field:'validity',text:'',x:2,y:2,width:47,height:4,font_size:8,font_weight:'normal',align:'center',color:'#45605e'};setDocument(current=>({...current,fields:[...current.fields,field]}))};
  const deleteField=(id:string)=>setDocument(current=>({...current,fields:current.fields.filter(field=>field.id!==id)}));

  return <>
    <div className="page-heading"><div><div className="eyebrow"><Printer size={14}/> التصميم والطباعة</div><h1>استوديو البطاقات</h1><p>حرّر عناصر البطاقة بقياسات مليمترية، واحفظ نسخاً ثابتة للطباعة.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={()=>window.print()}><Printer size={15}/> طباعة / حفظ PDF</button><button className="button button-primary" onClick={()=>void save()} disabled={busy}><Save size={15}/> حفظ إصدار</button></div></div>
    {error&&<div className="inline-error page-error"><AlertCircle size={16}/>{error}</div>}{success&&<div className="success-banner"><CheckCircle2 size={17}/>{success}</div>}
    <div className="studio-layout">
      <section className="surface studio-editor">
        <div className="surface-heading"><div><h3>إعداد القالب</h3><p>المخرجات السابقة لا تتغير عند حفظ إصدار جديد.</p></div><span className="heading-icon"><Eye size={17}/></span></div>
        <form onSubmit={save}>
          <label className="field studio-template-select"><span>قالب محفوظ</span><select value={templateID} onChange={e=>void openTemplate(e.target.value)}><option value="">إنشاء قالب جديد</option>{templates.map(item=><option key={item.id} value={item.id}>{item.name} · v{item.version}</option>)}</select></label>
          <label className="field"><span>اسم القالب</span><input value={name} onChange={e=>setName(e.target.value)} maxLength={100} required /></label>
          <div className="studio-dimensions"><label className="field"><span>العرض (مم)</span><input type="number" min={20} max={100} step="0.1" value={document.width_mm} onChange={e=>setDocument(current=>({...current,width_mm:Number(e.target.value)}))}/></label><label className="field"><span>الارتفاع (مم)</span><input type="number" min={10} max={60} step="0.1" value={document.height_mm} onChange={e=>setDocument(current=>({...current,height_mm:Number(e.target.value)}))}/></label></div>
          <label className="field background-field"><span>لون الخلفية</span><input type="color" value={document.background} onChange={e=>setDocument(current=>({...current,background:e.target.value}))}/></label>
          <div className="editor-section-heading"><div><strong>عناصر البطاقة</strong><small>{document.fields.length} عناصر · يمكنك تعديل موضع كل عنصر بالمليمتر</small></div><button type="button" className="button button-quiet compact-button" onClick={addField}><Plus size={14}/> عنصر</button></div>
          <div className="field-editor-list">{document.fields.map((field,index)=><div className="field-editor" key={field.id}><div className="field-editor-top"><strong>{field.kind==='text'?`نص ثابت ${index+1}`:`حقل ${field.field||index+1}`}</strong><button type="button" className="disable-link" onClick={()=>deleteField(field.id)}>إزالة</button></div>
              <div className="field-editor-controls"><select aria-label="نوع العنصر" value={field.kind} onChange={e=>updateField(field.id,{kind:e.target.value as CardTemplateField['kind']})}><option value="text">نص ثابت</option><option value="field">حقل متغير</option></select>{field.kind==='field'?<select aria-label="الحقل المتغير" value={field.field} onChange={e=>updateField(field.id,{field:e.target.value as CardTemplateField['field']})}><option value="username">اسم المستخدم</option><option value="password">كلمة المرور</option><option value="package">اسم الباقة</option><option value="validity">الصلاحية</option></select>:<input aria-label="النص" value={field.text} onChange={e=>updateField(field.id,{text:e.target.value})} placeholder="اكتب النص"/>}</div>
              <div className="field-editor-measures"><label>س X<input type="number" min={0} step="0.5" value={field.x} onChange={e=>updateField(field.id,{x:Number(e.target.value)})}/></label><label>ص Y<input type="number" min={0} step="0.5" value={field.y} onChange={e=>updateField(field.id,{y:Number(e.target.value)})}/></label><label>عرض<input type="number" min={1} step="0.5" value={field.width} onChange={e=>updateField(field.id,{width:Number(e.target.value)})}/></label><label>حجم الخط<input type="number" min={6} max={48} step="1" value={field.font_size} onChange={e=>updateField(field.id,{font_size:Number(e.target.value)})}/></label></div>
            </div>)}</div>
          <button className="button button-primary studio-save" type="submit" disabled={busy||loading}>{busy?<LoaderCircle size={15} className="spin"/>:<Save size={15}/>} حفظ كإصدار جديد</button>
        </form>
      </section>
      <section className="surface studio-preview-panel"><div className="surface-heading"><div><h3>معاينة البطاقة</h3><p>نموذج تجريبي — لا يتضمن بيانات مستخدم حقيقية.</p></div><span className="preview-mm">{document.width_mm} × {document.height_mm} مم</span></div>
        <div className="preview-stage"><div className="printable-card" style={{width:`${document.width_mm}mm`,height:`${document.height_mm}mm`,background:document.background} as CSSProperties}>{document.fields.map(field=><div key={field.id} className="preview-field" style={{left:`${field.x}mm`,top:`${field.y}mm`,width:`${field.width}mm`,height:`${field.height}mm`,fontSize:`${field.font_size}pt`,fontWeight:field.font_weight==='bold'?700:400,textAlign:field.align,color:field.color||'#20383b'} as CSSProperties}>{field.kind==='text'?field.text:({username:'BT2K8M4Q',password:'••••••••',package:'باقة تجريبية',validity:'24 ساعة'} as Record<string,string>)[field.field]||''}</div>)}</div></div>
        <div className="preview-tools"><span><CheckCircle2 size={14}/> معاينة بقياسات حقيقية</span><button className="text-button" onClick={()=>window.print()}><Download size={14}/> حفظ / طباعة PDF</button></div>
        <div className="template-history"><strong>الإصدارات المحفوظة</strong>{templates.length?templates.map(item=><button key={item.id} onClick={()=>void openTemplate(item.id)} className={item.id===templateID?'history-active':''}><span>{item.name}</span><small>v{item.version}</small></button>):<small>لا توجد إصدارات بعد</small>}</div>
      </section>
    </div>
  </>;
}
