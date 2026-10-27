import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, AlertCircle, ArrowUpLeft, Boxes, CheckCircle2, Database,
  ChevronDown, CircleHelp, Clock3, Eye, FilePlus2, Gauge, HardDrive, LayoutDashboard,
  LoaderCircle, LockKeyhole, LogOut, Menu, Network, PackageCheck, Plus, Printer,
  RefreshCw, Router, Search, Settings2, ShieldCheck, Signal, Sparkles, UserRound, Users,
  Wifi, WifiOff, X, Zap,
} from 'lucide-react';
import { api, type HotspotProfile, type HotspotUser, type RouterInfo, type RouterRecord } from './api';
import { DistributorsPage, InventoryPage, PackagesPage, StudioPage, UserManagerPage } from './Modules';
import { BackupPage } from './BackupPage';
import { VoucherPrintSheet } from './VoucherPrintSheet';

type Page = 'overview' | 'routers' | 'packages' | 'vouchers' | 'usermanager' | 'studio' | 'distributors' | 'inventory' | 'backup';

const pageTitles: Record<Page, { title: string; eyebrow: string }> = {
  overview: { title: 'نظرة عامة', eyebrow: 'لوحة التحكم' },
  routers: { title: 'اتصال الراوتر', eyebrow: 'إدارة الشبكة' },
  packages: { title: 'الباقات', eyebrow: 'كتالوج الخدمة' },
  vouchers: { title: 'القسائم والمستخدمون', eyebrow: 'HotSpot' },
  usermanager: { title: 'User Manager', eyebrow: 'مزامنة قراءة فقط' },
  studio: { title: 'استوديو البطاقات', eyebrow: 'التصميم والطباعة' },
  distributors: { title: 'الموزعون', eyebrow: 'شبكة التوزيع' },
  inventory: { title: 'المخزون والتخصيص', eyebrow: 'حركة المخزون' },
  backup: { title: 'النسخ الاحتياطي', eyebrow: 'حماية البيانات' },
};

function App() {
  const [page, setPage] = useState<Page>('overview');
  const [router, setRouter] = useState<RouterInfo | null>(null);
  const [savedRouters, setSavedRouters] = useState<RouterRecord[]>([]);
  const [backendReady, setBackendReady] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState('');

  const refresh = async () => {
    try {
      const [health, active, saved] = await Promise.all([api.health(), api.activeRouter(), api.routers()]);
      setBackendReady(health.status === 'ok');
      setRouter(active.connected ? active.router : null);
      setSavedRouters(saved);
    } catch {
      setBackendReady(false);
      setRouter(null);
    }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const go = (next: Page) => {
    setPage(next);
    setMobileMenu(false);
  };

  const onConnected = async (info: RouterInfo) => {
    setRouter(info);
    setToast('تم الاتصال وقراءة معلومات الراوتر بنجاح');
    try { setSavedRouters(await api.routers()); } catch { /* keep active session */ }
    go('overview');
  };

  const onDisconnect = async () => {
    await api.disconnect();
    setRouter(null);
    setToast('تم إنهاء الاتصال');
  };

  return (
    <div className="app-shell">
      {mobileMenu && <button className="mobile-scrim" aria-label="إغلاق القائمة" onClick={() => setMobileMenu(false)} />}
      <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark"><Network size={22} strokeWidth={2.25} /></div>
          <div className="brand-copy"><strong>BT2 <span>Manager</span></strong><small>NETWORK CONSOLE</small></div>
          <button className="sidebar-close icon-button" aria-label="إغلاق" onClick={() => setMobileMenu(false)}><X size={19} /></button>
        </div>

        <div className="workspace-switch">
          <div className="workspace-avatar">م</div>
          <div className="workspace-copy"><span>مساحة العمل</span><strong>المشغّل المحلي</strong></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <nav className="side-nav" aria-label="القائمة الرئيسية">
          <span className="nav-label">الرئيسية</span>
          <NavItem active={page === 'overview'} icon={<LayoutDashboard size={18} />} label="نظرة عامة" onClick={() => go('overview')} />
          <NavItem active={page === 'routers'} icon={<Router size={18} />} label="الراوترات" badge={router ? 'متصل' : undefined} onClick={() => go('routers')} />

          <span className="nav-label nav-label-gap">إدارة HotSpot</span>
          <NavItem active={page === 'packages'} icon={<PackageCheck size={18} />} label="الباقات" onClick={() => go('packages')} />
          <NavItem active={page === 'vouchers'} icon={<TicketIcon />} label="القسائم والمستخدمون" onClick={() => go('vouchers')} />
          <NavItem active={page === 'usermanager'} icon={<UserRound size={18} />} label="User Manager" onClick={() => go('usermanager')} />
          <NavItem active={page === 'studio'} icon={<Printer size={18} />} label="استوديو البطاقات" onClick={() => go('studio')} />

          <span className="nav-label nav-label-gap">التوزيع</span>
          <NavItem active={page === 'distributors'} icon={<Users size={18} />} label="الموزعون" onClick={() => go('distributors')} />
          <NavItem active={page === 'inventory'} icon={<Boxes size={18} />} label="المخزون والتخصيص" onClick={() => go('inventory')} />
          <span className="nav-label nav-label-gap">الجهاز والبيانات</span>
          <NavItem active={page === 'backup'} icon={<Database size={18} />} label="النسخ الاحتياطي" onClick={() => go('backup')} />
        </nav>

        <div className="sidebar-bottom">
          <div className="local-note"><LockKeyhole size={15} /><span>بياناتك تبقى على هذا الجهاز</span></div>
          <button className="profile-row" onClick={() => setToast('الإعدادات المحلية ستضاف ضمن مرحلة التقوية')}>
            <div className="profile-avatar">BT</div>
            <div className="profile-details"><strong>المشغّل</strong><span>حساب محلي</span></div>
            <Settings2 size={17} className="muted-icon" />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button className="mobile-menu icon-button" aria-label="فتح القائمة" onClick={() => setMobileMenu(true)}><Menu size={20} /></button>
            <div className="breadcrumb"><span>{pageTitles[page].eyebrow}</span><ArrowUpLeft size={13} /><strong>{pageTitles[page].title}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className={`connection-pill ${router ? 'is-online' : ''}`}>
              <span className="status-dot" />
              <span>{router ? router.identity || router.address : 'لا يوجد راوتر متصل'}</span>
              <ChevronDown size={14} />
            </div>
            <button className="icon-button help-button" title="مساعدة" onClick={() => setToast('ابدأ بربط راوتر من صفحة الراوترات. الاتصال الحالي محلي وآمن.') }><CircleHelp size={18} /></button>
            <div className="topbar-divider" />
            <div className="topbar-user"><div className="top-avatar">م</div><ChevronDown size={14} className="muted-icon" /></div>
          </div>
        </header>

        <div className="content-wrap">
          {!backendReady && <div className="backend-banner"><AlertCircle size={17} /><span>الخادم المحلي غير متاح. شغّل التطبيق من <code>bt2-manager2</code> ثم حدّث الصفحة.</span><button onClick={() => void refresh()}><RefreshCw size={14} /> إعادة المحاولة</button></div>}
          {page === 'overview' && <Overview router={router} savedRouters={savedRouters} onConnect={() => go('routers')} onNavigate={go} />}
          {page === 'routers' && <RoutersPage router={router} savedRouters={savedRouters} onConnected={onConnected} onDisconnect={onDisconnect} />}
          {page === 'packages' && <PackagesPage connected={!!router} />}
          {page === 'vouchers' && <VouchersPage connected={!!router} />}
          {page === 'usermanager' && <UserManagerPage connected={!!router} />}
          {page === 'studio' && <StudioPage />}
          {page === 'distributors' && <DistributorsPage />}
          {page === 'inventory' && <InventoryPage connected={!!router} />}
          {page === 'backup' && <BackupPage />}
        </div>
        <footer className="app-footer"><span><LockKeyhole size={13} /> تشغيل محلي · مستخدم واحد</span><span>BT2 Manager <i>·</i> معاينة مبكرة</span></footer>
      </main>
      {toast && <div role="status" className="toast"><CheckCircle2 size={18} />{toast}<button aria-label="إغلاق" onClick={() => setToast('')}><X size={15} /></button></div>}
    </div>
  );
}

function TicketIcon() { return <FilePlus2 size={18} />; }

function NavItem({ active, icon, label, badge, onClick }: { active: boolean; icon: ReactNode; label: string; badge?: string; onClick: () => void }) {
  return <button className={`nav-item ${active ? 'nav-active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{badge && <small>{badge}</small>}</button>;
}

function Overview({ router, savedRouters, onConnect, onNavigate }: { router: RouterInfo | null; savedRouters: RouterRecord[]; onConnect: () => void; onNavigate: (page: Page) => void }) {
  const [profileCount, setProfileCount] = useState<number | null>(null);
  useEffect(() => {
    if (!router) { setProfileCount(null); return; }
    api.profiles().then((items) => setProfileCount(items.length)).catch(() => setProfileCount(null));
  }, [router]);

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow"><Sparkles size={14} /> لوحة تشغيل الشبكة</div><h1>أهلاً بك في <span>BT2 Manager</span></h1><p>إدارة واضحة لشبكتك — من الراوتر إلى القسيمة، بخطوات آمنة.</p></div>
        <div className="heading-actions"><button className="button button-quiet" onClick={() => onNavigate('vouchers')}><Search size={16} /> البحث عن مستخدم</button><button className="button button-primary" onClick={onConnect}><Plus size={17} /> ربط راوتر</button></div>
      </div>

      <section className="hero-panel">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="hero-kicker-dot" /> مساحة تشغيل محلية</div>
          <h2>{router ? `متصل بـ ${router.identity || router.name}` : 'ابدأ بربط الراوتر'}</h2>
          <p>{router ? 'الاتصال نشط. يمكنك الآن قراءة ملفات HotSpot وإدارة المستخدمين.' : 'اربط راوتر MikroTik لقراءة ملفات HotSpot ومعلومات النظام. لا تُحفظ كلمة المرور بعد انتهاء الجلسة.'}</p>
          <button className="button hero-button" onClick={onConnect}>{router ? <><Router size={16} /> تفاصيل الاتصال</> : <><Zap size={16} /> إعداد الاتصال <ArrowUpLeft size={15} /></>}</button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-node node-top"><Signal size={15} /></div><div className="art-node node-left"><Wifi size={16} /></div>
          <div className="art-router"><Router size={47} strokeWidth={1.25} /><span /></div>
          <div className="art-node node-right"><Activity size={15} /></div><div className="art-node node-bottom"><ShieldCheck size={15} /></div>
          <div className="art-line line-a" /><div className="art-line line-b" /><div className="art-line line-c" /><div className="art-line line-d" />
        </div>
        <div className="hero-index">01 <span>/</span> 03</div>
      </section>

      <div className="section-title-row"><div><h2>ملخص الشبكة</h2><p>بيانات من اتصالك الحالي فقط</p></div><span className="live-label"><span className="live-pulse" /> {router ? 'مباشر' : 'بانتظار الاتصال'}</span></div>
      <div className="metric-grid">
        <Metric icon={<Router size={18} />} label="الراوتر النشط" value={router ? (router.identity || router.name) : '—'} note={router ? `${router.address}:${router.port}` : 'لا يوجد اتصال حالياً'} tone="teal" />
        <Metric icon={<Gauge size={18} />} label="إصدار RouterOS" value={router?.version || '—'} note={router ? `${router.board || router.model || 'جهاز MikroTik'}` : 'يظهر بعد الاتصال'} tone="blue" />
        <Metric icon={<PackageCheck size={18} />} label="ملفات HotSpot" value={profileCount === null ? '—' : String(profileCount)} note={profileCount === null ? 'يتطلب اتصالاً نشطاً' : 'تمت قراءتها من الراوتر'} tone="violet" />
        <Metric icon={<Users size={18} />} label="جلسات نشطة" value="—" note="ستظهر بعد استكمال قراءة الجلسات" tone="amber" />
      </div>

      <div className="lower-grid">
        <section className="surface quick-panel">
          <div className="surface-heading"><div><h3>اختصارات العمل</h3><p>ابدأ من المهام الأكثر استخداماً</p></div><span className="heading-icon"><Zap size={17} /></span></div>
          <div className="quick-actions">
            <QuickAction icon={<FilePlus2 size={18} />} title="إدارة القسائم" text="عرض مستخدمي HotSpot" onClick={() => onNavigate('vouchers')} />
            <QuickAction icon={<PackageCheck size={18} />} title="ملفات الخدمة" text="مراجعة ملفات HotSpot" onClick={() => onNavigate('vouchers')} />
            <QuickAction icon={<Printer size={18} />} title="تصميم بطاقة" text="إعداد قالب للطباعة" onClick={() => onNavigate('studio')} />
          </div>
        </section>
        <section className="surface router-summary">
          <div className="surface-heading"><div><h3>الراوترات المحفوظة</h3><p>العناوين فقط — لا تُخزن بيانات الدخول</p></div><button className="text-button" onClick={onConnect}>إدارة <ArrowUpLeft size={14} /></button></div>
          {savedRouters.length ? <div className="saved-list">{savedRouters.slice(0, 3).map((item) => <div className="saved-router" key={item.id}><div className="saved-router-icon"><Router size={17} /></div><div className="saved-router-copy"><strong>{item.identity || item.name}</strong><span>{item.address}:{item.port} <i>·</i> RouterOS {item.version || '—'}</span></div><span className="saved-state"><span /> محفوظ</span></div>)}</div> : <div className="empty-inline"><div className="empty-icon"><HardDrive size={18} /></div><span>ستظهر هنا عناوين الراوترات التي اتصلت بها.</span></div>}
        </section>
      </div>
    </>
  );
}

function Metric({ icon, label, value, note, tone }: { icon: ReactNode; label: string; value: string; note: string; tone: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></div>;
}

function QuickAction({ icon, title, text, onClick }: { icon: ReactNode; title: string; text: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span className="quick-icon">{icon}</span><span className="quick-copy"><strong>{title}</strong><small>{text}</small></span><ArrowUpLeft size={15} className="quick-arrow" /></button>;
}

function RoutersPage({ router, savedRouters, onConnected, onDisconnect }: { router: RouterInfo | null; savedRouters: RouterRecord[]; onConnected: (router: RouterInfo) => void; onDisconnect: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [port, setPort] = useState('8729');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tls, setTls] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const info = await api.connect({ name, address, port: Number(port), username, password, tls });
      setPassword(''); onConnected(info);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر الاتصال بالراوتر'); }
    finally { setBusy(false); }
  };

  const toggleTLS = (checked: boolean) => { setTls(checked); setPort(checked ? '8729' : '8728'); };

  return (
    <>
      <div className="page-heading compact-heading"><div><div className="eyebrow"><Router size={14} /> إدارة الشبكة</div><h1>اتصال الراوتر</h1><p>بيانات الاتصال مؤقتة في الذاكرة ولا تُحفظ في قاعدة التطبيق.</p></div></div>
      <div className="connection-layout">
        <section className="surface connection-form-card">
          <div className="surface-heading"><div><h3>إعداد اتصال جديد</h3><p>استخدم حساب RouterOS بصلاحيات محدودة للقراءة أولاً.</p></div><span className="heading-icon"><Signal size={17} /></span></div>
          <form onSubmit={submit} className="router-form">
            <div className="form-row"><label className="field"><span>اسم تعريفي <small>اختياري</small></span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: راوتر المكتب" /></label><label className="field"><span>عنوان الراوتر <b>*</b></span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.88.1" required autoComplete="off" dir="ltr" /></label></div>
            <div className="form-row"><label className="field"><span>اسم المستخدم <b>*</b></span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="router-admin" required autoComplete="username" /></label><label className="field"><span>كلمة المرور <b>*</b></span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="أدخل كلمة المرور" required autoComplete="current-password" /></label></div>
            <div className="form-row align-end"><label className="field port-field"><span>منفذ API</span><input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" dir="ltr" /></label><label className="tls-toggle"><span className="toggle-copy"><strong>اتصال مشفر TLS</strong><small>{tls ? 'API-SSL · 8729' : 'API غير مشفر · 8728'}</small></span><input type="checkbox" checked={tls} onChange={(e) => toggleTLS(e.target.checked)} /><span className="toggle-track" /></label></div>
            {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
            <div className="security-note"><ShieldCheck size={17} /><span>لا تحفظ كلمة المرور على الجهاز. استخدم TLS وشهادة موثوقة متى كانت مهيأة على الراوتر.</span></div>
            <div className="form-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Wifi size={16} />}{busy ? 'جارٍ الاتصال والقراءة…' : 'اختبار الاتصال'}</button><span className="form-caption"><LockKeyhole size={13} /> يعمل الاتصال من هذا الجهاز فقط</span></div>
          </form>
        </section>
        <aside className="connection-side">
          <section className="surface active-connection-card"><div className="surface-heading"><div><h3>الاتصال الحالي</h3><p>حالة جلسة RouterOS</p></div><div className={`connection-symbol ${router ? 'connected' : ''}`}>{router ? <Wifi size={18} /> : <WifiOff size={18} />}</div></div>
            {router ? <><div className="connected-device"><div className="device-chip"><Router size={22} /></div><div><strong>{router.identity || router.name}</strong><span>{router.address}:{router.port}</span></div><span className="online-tag"><i /> متصل</span></div><div className="device-facts"><div><span>الإصدار</span><strong>{router.version || 'غير معروف'}</strong></div><div><span>اللوحة</span><strong>{router.board || router.model || '—'}</strong></div><div><span>مدة التشغيل</span><strong>{router.uptime || '—'}</strong></div></div><button className="button button-danger-soft full-button" onClick={async () => { setDisconnecting(true); try { await onDisconnect(); } finally { setDisconnecting(false); } }} disabled={disconnecting}>{disconnecting ? <LoaderCircle size={15} className="spin" /> : <LogOut size={15} />} إنهاء الاتصال</button></> : <div className="disconnected-state"><div className="disconnected-art"><Router size={30} /><span><WifiOff size={16} /></span></div><strong>لا يوجد اتصال نشط</strong><p>أدخل بيانات الراوتر لقراءة هويته وإصدار RouterOS.</p></div>}
          </section>
          <section className="surface saved-card"><div className="surface-heading"><div><h3>آخر الاتصالات</h3><p>المحفوظ هو العنوان فقط</p></div><Clock3 size={17} className="muted-icon" /></div>{savedRouters.length ? savedRouters.slice(0, 4).map((item) => <div className="saved-mini" key={item.id}><span className="saved-mini-icon"><Router size={15} /></span><span><strong>{item.identity || item.name}</strong><small>{item.address}:{item.port}</small></span><span className="saved-mini-version">v{item.version || '—'}</span></div>) : <div className="muted-empty">لا توجد اتصالات سابقة.</div>}</section>
        </aside>
      </div>
    </>
  );
}

function VouchersPage({ connected }: { connected: boolean }) {
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [users, setUsers] = useState<HotspotUser[]>([]);
  const [managed, setManaged] = useState<Awaited<ReturnType<typeof api.vouchers>>['items']>([]);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [packages, setPackages] = useState<Awaited<ReturnType<typeof api.packages>>>([]);
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof api.templates>>>([]);
  const [templateVersionID, setTemplateVersionID] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packageID, setPackageID] = useState('');
  const [batchCount, setBatchCount] = useState('10');
  const [batchResult, setBatchResult] = useState<Awaited<ReturnType<typeof api.createBatch>> | null>(null);
  const [batchPrintInfo, setBatchPrintInfo] = useState<{ versionID: string; packageName: string; validity: string } | null>(null);
  const [printDocument, setPrintDocument] = useState<import('./api').CardTemplateDocument | null>(null);
  const [success, setSuccess] = useState('');

  const load = async () => {
    if (!connected) return;
    setLoading(true); setError('');
    try {
      const [loadedProfiles, loadedUsers, loadedPackages, loadedVouchers, loadedTemplates] = await Promise.all([api.profiles(), api.users(), api.packages(), api.vouchers(0,200), api.templates()]);
      setProfiles(loadedProfiles); setUsers(loadedUsers); setPackages(loadedPackages.filter((item) => item.enabled && item.service_type === 'hotspot')); setManaged(loadedVouchers.items); setTemplates(loadedTemplates);
      if (!templateVersionID && loadedTemplates[0]) setTemplateVersionID(loadedTemplates[0].version_id);
      if (!packageID && loadedPackages[0]) setPackageID(loadedPackages[0].id);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر قراءة بيانات HotSpot'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [connected]);
  useEffect(() => {
    if (!batchPrintInfo?.versionID) { setPrintDocument(null); return; }
    let cancelled = false;
    api.templateVersion(batchPrintInfo.versionID).then((item) => { if (!cancelled) setPrintDocument(item.document ?? null); }).catch(() => { if (!cancelled) setPrintDocument(null); });
    return () => { cancelled = true; };
  }, [batchPrintInfo]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedPackage = packages.find((item) => item.id === packageID);
    if (!selectedPackage || !window.confirm(`سيتم إنشاء ${batchCount} مستخدم فعلياً على الراوتر بملف «${selectedPackage.profile_name}». هل تريد المتابعة؟`)) return;
    setSaving(true); setError(''); setSuccess(''); setBatchResult(null);
    try {
      const result = await api.createBatch({ package_id: packageID, count: Number(batchCount), template_version_id: templateVersionID || undefined });
      setBatchResult(result); setBatchPrintInfo({ versionID: templateVersionID, packageName: selectedPackage.name, validity: selectedPackage.validity_label }); setFormOpen(false); setSuccess(`انتهت الدفعة: نجح ${result.succeeded_count} من ${result.requested_count}.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر إنشاء الدفعة'); }
    finally { setSaving(false); }
  };

  const revealCredentials = async (id: string) => {
    try {
      const value = await api.credentials(id);
      setRevealed((current) => ({ ...current, [id]: value.password }));
      window.setTimeout(() => setRevealed((current) => { const next = { ...current }; delete next[id]; return next; }), 30_000);
    }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذر استعادة بيانات القسيمة'); }
  };
  const disableVoucher = async (id: string, username: string) => {
    if (!window.confirm(`سيتم تعطيل «${username}» على الراوتر. هل تريد المتابعة؟`)) return;
    try { await api.disableVoucher(id); setSuccess(`تم تعطيل ${username}.`); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذر تعطيل القسيمة'); }
  };
  const printBatch = async () => {
    if (batchPrintInfo?.versionID && !printDocument) {
      try { const item = await api.templateVersion(batchPrintInfo.versionID); setPrintDocument(item.document ?? null); }
      catch { /* The built-in layout remains available if the saved template cannot be read. */ }
    }
    window.requestAnimationFrame(() => window.print());
  };

  const visibleUsers = useMemo(() => users.filter((u) => `${u.name} ${u.profile} ${u.server}`.toLowerCase().includes(query.toLowerCase())), [users, query]);

  return (
    <>
      <div className="page-heading"><div><div className="eyebrow"><Users size={14} /> HotSpot</div><h1>القسائم والمستخدمون</h1><p>قراءة حسابات HotSpot من الراوتر وإضافة مستخدم واحد بشكل صريح.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => void load()} disabled={!connected || loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> مزامنة</button><button className="button button-primary" onClick={() => setFormOpen((v) => !v)} disabled={!connected}><Plus size={16} /> دفعة جديدة</button></div></div>
      {success && <div className="success-banner"><CheckCircle2 size={17} />{success}<button onClick={() => setSuccess('')}><X size={14} /></button></div>}
      {!connected ? <div className="surface empty-page"><span className="empty-big-icon"><Router size={28} /></span><h3>اربط الراوتر لعرض المستخدمين</h3><p>تظهر البيانات بعد نجاح الاتصال. لا توجد بيانات تجريبية أو أرقام افتراضية في هذه الصفحة.</p></div> : <>
        {formOpen && <section className="surface create-user-panel"><div className="surface-heading"><div><h3>إنشاء دفعة HotSpot</h3><p>تُسجّل الدفعة محلياً قبل الكتابة، وتُعرض نتيجة كل قسيمة على حدة.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="إغلاق"><X size={17} /></button></div><form className="create-user-form" onSubmit={submit}><label className="field"><span>الباقة <b>*</b></span><select value={packageID} onChange={(e) => setPackageID(e.target.value)} required><option value="" disabled>اختر باقة مفعّلة</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.profile_name}</option>)}</select></label><label className="field"><span>عدد القسائم <b>*</b></span><input value={batchCount} onChange={(e) => setBatchCount(e.target.value)} type="number" min={1} max={200} required /></label><label className="field"><span>قالب الطباعة</span><select value={templateVersionID} onChange={(e)=>setTemplateVersionID(e.target.value)}><option value="">بدون قالب</option>{templates.map((item)=><option key={item.version_id} value={item.version_id}>{item.name} · v{item.version}</option>)}</select></label><span className="batch-security-note"><ShieldCheck size={15} /> كلمات المرور عشوائية ومشفّرة محلياً.</span><button className="button button-primary" disabled={saving || !packages.length}>{saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} إنشاء الدفعة</button></form></section>}
        {batchResult && <section className="surface generated-result"><div className="surface-heading"><div><h3>نتيجة الدفعة <bdi>#{batchResult.id.slice(0,8)}</bdi></h3><p>نجح {batchResult.succeeded_count} · تعذر {batchResult.failed_count} من أصل {batchResult.requested_count}</p></div><span className={`state-badge ${batchResult.state === 'completed' ? 'state-on' : 'state-off'}`}><i />{batchResult.state === 'completed' ? 'مكتملة' : batchResult.state === 'partial' ? 'جزئية' : 'تحتاج مراجعة'}</span><button className="button button-quiet compact-button" onClick={() => void printBatch()} disabled={!batchResult.succeeded_count}><Printer size={14}/> طباعة الناجح</button></div><div className="generated-credentials">{batchResult.vouchers.filter((item) => item.state === 'active').map((item) => <div className="credential-row" key={item.id}><strong>{item.username}</strong><code>{item.password || 'مشفّرة — استخدم عرض بيانات القسيمة'}</code><CheckCircle2 size={15} /></div>)}{!batchResult.succeeded_count && <p className="muted-empty">لم تنجح أي قسيمة؛ راجع حالة الراوتر قبل إعادة المحاولة.</p>}</div><small className="result-disclaimer"><LockKeyhole size={12} /> تُعرض كلمات المرور الآن فقط. ويمكن استعادتها لاحقاً من السجل المحلي بعد التحقق من الصلاحية.</small></section>}
        {batchResult && batchResult.succeeded_count > 0 && <VoucherPrintSheet vouchers={batchResult.vouchers.filter((item) => item.state === 'active')} document={printDocument} packageName={batchPrintInfo?.packageName ?? ''} validity={batchPrintInfo?.validity ?? ''} />}
        {error && <div className="inline-error page-error"><AlertCircle size={16} />{error}</div>}
        <div className="voucher-stats"><div className="mini-stat"><span className="mini-stat-icon blue"><Users size={17} /></span><span><small>مستخدمو HotSpot</small><strong>{users.length}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon green"><PackageCheck size={17} /></span><span><small>ملفات الخدمة</small><strong>{profiles.length}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon amber"><Activity size={17} /></span><span><small>حالة القراءة</small><strong className="small-stat-value">{loading ? 'جارٍ التحديث' : 'آخر قراءة ناجحة'}</strong></span></div></div>
        {managed.length > 0 && <section className="surface table-panel managed-table"><div className="table-heading"><div><h3>القسائم المُدارة محلياً</h3><p>كلمات المرور مشفرة في قاعدة البيانات؛ إظهارها مؤقت لمدة 30 ثانية.</p></div><span className="profile-count">{managed.length} من آخر 200</span></div><div className="table-scroll"><table><thead><tr><th>اسم المستخدم</th><th>الباقة</th><th>المخزون لدى</th><th>الحالة</th><th>إجراء آمن</th></tr></thead><tbody>{managed.map((item) => <tr key={item.id}><td><strong>{item.username}</strong></td><td>{item.package}</td><td>{item.owner}</td><td><span className={`state-badge ${item.state === 'active' ? 'state-on' : 'state-off'}`}><i />{item.state === 'active' ? 'نشطة' : item.state === 'disabled' ? 'معطلة' : item.state === 'failed' ? 'فشلت' : item.state}</span></td><td className="managed-actions">{revealed[item.id] ? <code>{revealed[item.id]}</code> : <button className="text-button" onClick={() => void revealCredentials(item.id)}><Eye size={14} /> كلمة المرور</button>}{item.state === 'active' && <button className="disable-link" onClick={() => void disableVoucher(item.id,item.username)}>تعطيل</button>}</td></tr>)}</tbody></table></div></section>}
        <section className="surface table-panel"><div className="table-heading"><div><h3>مستخدمي الراوتر</h3><p>كلمات المرور لا تُقرأ أو تُعرض في هذه القائمة.</p></div><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="بحث بالاسم أو الملف" /></label></div>{loading ? <div className="table-empty"><LoaderCircle className="spin" size={20} /> جارٍ قراءة الراوتر…</div> : visibleUsers.length ? <div className="table-scroll"><table><thead><tr><th>اسم المستخدم</th><th>ملف الخدمة</th><th>الخادم</th><th>الحالة</th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id || user.name}><td><span className="user-cell"><span className="user-table-avatar">{user.name.slice(0, 1).toUpperCase()}</span><strong>{user.name}</strong></span></td><td><span className="profile-badge">{user.profile || '—'}</span></td><td>{user.server || 'الافتراضي'}</td><td><span className={`state-badge ${user.disabled ? 'state-off' : 'state-on'}`}><i />{user.disabled ? 'معطّل' : 'مفعّل'}</span></td></tr>)}</tbody></table></div> : <div className="table-empty"><div className="empty-icon"><Users size={18} /></div>{query ? 'لا توجد نتائج تطابق البحث.' : 'لم تُرجع قراءة الراوتر مستخدمين.'}</div>}</section>
        <section className="surface profile-strip"><div className="surface-heading"><div><h3>ملفات HotSpot المقروءة</h3><p>لقطة من الراوتر النشط</p></div><span className="profile-count">{profiles.length} ملف</span></div><div className="profile-chips">{profiles.map((item) => <span key={item.id || item.name} className="profile-chip"><span />{item.name}<small>{item.shared_users ? `${item.shared_users} مستخدم` : 'HotSpot'}</small></span>)}{profiles.length === 0 && <span className="muted-empty">لا توجد ملفات متاحة.</span>}</div></section>
      </>}
    </>
  );
}

export default App;
