import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, AlertCircle, ArrowUpLeft, Boxes, Camera, CheckCircle2, Database,
  ChevronDown, CircleHelp, Clock3, Eye, FilePlus2, Gauge, HardDrive, LayoutDashboard,
  LoaderCircle, LockKeyhole, LogOut, Maximize2, Menu, Minimize2, Moon, Network, PackageCheck, Plus, Printer,
  Power, RefreshCw, Router, Search, Settings2, ShieldCheck, Signal, Sparkles, Sun, UserRound, Users,
  Wifi, WifiOff, X, Zap,
} from 'lucide-react';
import { api, type HotspotProfile, type HotspotUser, type RouterInfo, type RouterRecord } from './api';
import { DistributorsPage, InventoryPage, PackagesPage, SessionsPage, StudioPage, UserManagerPage, UserManagerUsersPage } from './Modules';
import { BackupPage } from './BackupPage';
import { BatchArchivePage } from './BatchArchivePage';
import { VoucherPrintSheet } from './VoucherPrintSheet';
import { CardPreview, DEFAULT_CARD_TEMPLATE } from './CardPreview';
import { TablePagination } from './TablePagination';

type Page = 'overview' | 'routers' | 'packages' | 'vouchers' | 'batch_archive' | 'usermanager_profiles' | 'usermanager_users' | 'sessions' | 'studio' | 'distributors' | 'inventory' | 'backup';

const pageTitles: Record<Page, { title: string; eyebrow: string }> = {
  overview: { title: 'نظرة عامة', eyebrow: 'لوحة التحكم' },
  routers: { title: 'اتصال الراوتر', eyebrow: 'إدارة الشبكة' },
  packages: { title: 'الباقات', eyebrow: 'كتالوج الخدمة' },
  vouchers: { title: 'القسائم والمستخدمون', eyebrow: 'HotSpot' },
  batch_archive: { title: 'أرشيف دفع القسائم', eyebrow: 'سجل الدفعات' },
  usermanager_profiles: { title: 'Profiles والقيود', eyebrow: 'User Manager · قراءة فقط' },
  usermanager_users: { title: 'المستخدمون', eyebrow: 'User Manager · قراءة فقط' },
  sessions: { title: 'الجلسات', eyebrow: 'مراقبة الاتصال' },
  studio: { title: 'استوديو البطاقات', eyebrow: 'التصميم والطباعة' },
  distributors: { title: 'الموزعون', eyebrow: 'شبكة التوزيع' },
  inventory: { title: 'المخزون والتخصيص', eyebrow: 'حركة المخزون' },
  backup: { title: 'النسخ الاحتياطي', eyebrow: 'حماية البيانات' },
};

function estimateExpiry(validity: string, from = new Date()): Date | null {
  const normalized = validity.trim().toLowerCase().replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const routerOS = normalized.match(/^(\d+)d(\d{1,2}):(\d{2}):(\d{2})$/i);
  if (routerOS) {
    const total = Number(routerOS[1]) * 86400 + Number(routerOS[2]) * 3600 + Number(routerOS[3]) * 60 + Number(routerOS[4]);
    if (total > 0) return new Date(from.getTime() + total * 1000);
  }
  const token = /(\d+(?:\.\d+)?)\s*(weeks?|w|days?|d|hours?|h|minutes?|mins?|m|seconds?|secs?|s|أسابيع|أسبوع|أيام|يوم|ساعات|ساعة|دقائق|دقيقة|ثوانٍ|ثواني|ثانية)/giu;
  let totalMs = 0;
  let matches = 0;
  for (const match of normalized.matchAll(token)) {
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const multiplier = /^(w|week|weeks|أسبوع|أسابيع)$/u.test(unit) ? 604800000
      : /^(d|day|days|يوم|أيام)$/u.test(unit) ? 86400000
      : /^(h|hour|hours|ساعة|ساعات)$/u.test(unit) ? 3600000
      : /^(m|min|mins|minute|minutes|دقيقة|دقائق)$/u.test(unit) ? 60000
      : 1000;
    totalMs += amount * multiplier;
    matches++;
  }
  const remainder = normalized.replace(token, '').replace(/[+\s,،]+/g, '');
  if (!matches || remainder || !Number.isFinite(totalMs) || totalMs <= 0) return null;
  const result = new Date(from.getTime() + totalMs);
  return Number.isNaN(result.getTime()) ? null : result;
}

function App() {
  const [page, setPage] = useState<Page>('overview');
  const [router, setRouter] = useState<RouterInfo | null>(null);
  const [savedRouters, setSavedRouters] = useState<RouterRecord[]>([]);
  const [backendReady, setBackendReady] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState('');
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem('bt2.theme') === 'dark'; } catch { return false; } });
  const [fullscreen, setFullscreen] = useState(false);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

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
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    try { localStorage.setItem('bt2.theme', darkMode ? 'dark' : 'light'); } catch { /* theme still works for this session */ }
  }, [darkMode]);
  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

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

  const refreshConnection = async () => {
    const candidate = router
      ? savedRouters.find((item) => item.address === router.address && item.port === router.port && item.has_saved_password)
      : savedRouters.find((item) => item.has_saved_password);
    if (!candidate) { setToast('لا توجد كلمة مرور محفوظة لإعادة الاتصال. افتح إعداد الاتصال وأدخلها مرة واحدة.'); return; }
    setReconnecting(true);
    try {
      const info = await api.connect({ name: candidate.name, address: candidate.address, port: candidate.port, username: candidate.username, password: '', tls: candidate.tls });
      setRouter(info);
      try { setSavedRouters(await api.routers()); } catch { /* connection itself succeeded */ }
      setToast('تم تحديث الاتصال وقراءة معلومات الراوتر.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'تعذرت إعادة الاتصال بالراوتر.'); }
    finally { setReconnecting(false); }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setToast('تعذر تفعيل ملء الشاشة في نافذة التشغيل الحالية.'); }
  };

  const captureScreen = async () => {
    setScreenshotBusy(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(document.documentElement, {
        useCORS: true, scale: Math.min(window.devicePixelRatio || 1, 2),
        width: window.innerWidth, height: window.innerHeight, windowWidth: window.innerWidth, windowHeight: window.innerHeight,
        scrollX: window.scrollX, scrollY: window.scrollY, backgroundColor: darkMode ? '#101819' : '#f4f7f6',
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('تعذر تحويل لقطة الشاشة إلى PNG');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `bt2-manager-${new Date().toISOString().replace(/[:.]/g, '-')}.png`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      setToast('تم تنزيل لقطة الشاشة بصيغة PNG.');
    } catch (error) { setToast(error instanceof Error ? error.message : 'تعذر التقاط الشاشة.'); }
    finally { setScreenshotBusy(false); }
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

          <span className="nav-label nav-label-gap">مصادر الخدمة</span>
          <NavItem active={page === 'vouchers'} icon={<Wifi size={18} />} label="HotSpot · القسائم" onClick={() => go('vouchers')} />
          <NavItem active={page === 'usermanager_profiles'} icon={<PackageCheck size={18} />} label="User Manager · Profiles" badge="قراءة فقط" onClick={() => go('usermanager_profiles')} />
          <NavItem active={page === 'usermanager_users'} icon={<UserRound size={18} />} label="User Manager · المستخدمون" badge="قراءة فقط" onClick={() => go('usermanager_users')} />

          <span className="nav-label nav-label-gap">المتابعة</span>
          <NavItem active={page === 'sessions'} icon={<Activity size={18} />} label="الجلسات" onClick={() => go('sessions')} />

          <span className="nav-label nav-label-gap">كتالوج البطاقات</span>
          <NavItem active={page === 'packages'} icon={<PackageCheck size={18} />} label="الباقات" onClick={() => go('packages')} />
          <NavItem active={page === 'batch_archive'} icon={<HardDrive size={18} />} label="أرشيف الدفعات" onClick={() => go('batch_archive')} />
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
            {(router ? savedRouters.some((item) => item.address === router.address && item.port === router.port && item.has_saved_password) : savedRouters.some((item) => item.has_saved_password)) && <button className="icon-button topbar-tool" title="تحديث الاتصال بالراوتر" aria-label="تحديث الاتصال بالراوتر" onClick={() => void refreshConnection()} disabled={reconnecting}>{reconnecting ? <LoaderCircle size={17} className="spin" /> : <RefreshCw size={17} />}</button>}
            <button className="icon-button topbar-tool" title={fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'} aria-label={fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
            <button className="icon-button topbar-tool" title="التقاط لقطة الشاشة" aria-label="التقاط لقطة الشاشة" onClick={() => void captureScreen()} disabled={screenshotBusy}>{screenshotBusy ? <LoaderCircle size={17} className="spin" /> : <Camera size={17} />}</button>
            <button className="icon-button topbar-tool" title={darkMode ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'} aria-label={darkMode ? 'التبديل إلى الوضع الفاتح' : 'التبديل إلى الوضع الداكن'} onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={17} /> : <Moon size={17} />}</button>
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
          {page === 'batch_archive' && <BatchArchivePage />}
          {page === 'usermanager_profiles' && <UserManagerPage connected={!!router} />}
          {page === 'usermanager_users' && <UserManagerUsersPage connected={!!router} />}
          {page === 'sessions' && <SessionsPage connected={!!router} />}
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
          <p>{router ? 'الاتصال نشط. يمكنك الآن قراءة ملفات HotSpot وإدارة المستخدمين.' : 'اربط راوتر MikroTik لقراءة ملفات HotSpot ومعلومات النظام. تُحفظ بيانات الاتصال محلياً مع تشفير كلمة المرور لتسهيل إعادة الاتصال.'}</p>
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
          <div className="surface-heading"><div><h3>الراوترات المحفوظة</h3><p>أسماء وعناوين محفوظة، وكلمات المرور مشفّرة محلياً</p></div><button className="text-button" onClick={onConnect}>إدارة <ArrowUpLeft size={14} /></button></div>
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

  const passwordSaved = savedRouters.some((item) => item.address === address.trim() && item.port === Number(port) && item.username === username.trim() && item.has_saved_password);
  const chooseSavedRouter = (item: RouterRecord) => { setName(item.name); setAddress(item.address); setPort(String(item.port)); setUsername(item.username); setPassword(''); setTls(item.tls); };
  useEffect(() => {
    if (address || !savedRouters.length) return;
    const preferred = savedRouters.find((item) => item.has_saved_password) ?? savedRouters[0];
    chooseSavedRouter(preferred);
  }, [savedRouters, address]);

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
      <div className="page-heading compact-heading"><div><div className="eyebrow"><Router size={14} /> إدارة الشبكة</div><h1>اتصال الراوتر</h1><p>تُحفظ بيانات الراوتر محلياً لسهولة إعادة الاتصال، مع تشفير كلمة المرور.</p></div></div>
      <div className="connection-layout">
        <section className="surface connection-form-card">
          <div className="surface-heading"><div><h3>إعداد اتصال جديد</h3><p>استخدم حساب RouterOS بصلاحيات محدودة للقراءة أولاً.</p></div><span className="heading-icon"><Signal size={17} /></span></div>
          <form onSubmit={submit} className="router-form">
            <div className="form-row"><label className="field"><span>اسم تعريفي <small>اختياري</small></span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: راوتر المكتب" /></label><label className="field"><span>عنوان الراوتر <b>*</b></span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="192.168.88.1" required autoComplete="off" dir="ltr" /></label></div>
            <div className="form-row"><label className="field"><span>اسم المستخدم <b>*</b></span><input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="router-admin" required autoComplete="username" /></label><label className="field"><span>كلمة المرور {!passwordSaved&&<b>*</b>}</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={passwordSaved?'محفوظة ومشفّرة — اتركها فارغة لاستخدامها':'أدخل كلمة المرور'} required={!passwordSaved} autoComplete="current-password" /></label></div>
            <div className="form-row align-end"><label className="field port-field"><span>منفذ API</span><input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" dir="ltr" /></label><label className="tls-toggle"><span className="toggle-copy"><strong>اتصال مشفر TLS</strong><small>{tls ? 'API-SSL · 8729' : 'API غير مشفر · 8728'}</small></span><input type="checkbox" checked={tls} onChange={(e) => toggleTLS(e.target.checked)} /><span className="toggle-track" /></label></div>
            {error && <div className="inline-error"><AlertCircle size={16} />{error}</div>}
            <div className="security-note"><ShieldCheck size={17} /><span>تُشفّر كلمة المرور محلياً بمفتاح خاص بهذا الجهاز ولا تُعرض في قائمة الراوترات. استخدم TLS وشهادة موثوقة متى كانت مهيأة.</span></div>
            <div className="form-actions"><button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle size={16} className="spin" /> : <Wifi size={16} />}{busy ? 'جارٍ الاتصال والحفظ…' : passwordSaved ? 'حفظ التغييرات والاتصال' : 'اتصال وحفظ البيانات'}</button><span className="form-caption"><LockKeyhole size={13} /> يعمل الاتصال من هذا الجهاز فقط</span></div>
          </form>
        </section>
        <aside className="connection-side">
          <section className="surface active-connection-card"><div className="surface-heading"><div><h3>الاتصال الحالي</h3><p>حالة جلسة RouterOS</p></div><div className={`connection-symbol ${router ? 'connected' : ''}`}>{router ? <Wifi size={18} /> : <WifiOff size={18} />}</div></div>
            {router ? <><div className="connected-device"><div className="device-chip"><Router size={22} /></div><div><strong>{router.identity || router.name}</strong><span>{router.address}:{router.port}</span></div><span className="online-tag"><i /> متصل</span></div><div className="device-facts"><div><span>الإصدار</span><strong>{router.version || 'غير معروف'}</strong></div><div><span>اللوحة</span><strong>{router.board || router.model || '—'}</strong></div><div><span>مدة التشغيل</span><strong>{router.uptime || '—'}</strong></div></div><button className="button button-danger-soft full-button" onClick={async () => { setDisconnecting(true); try { await onDisconnect(); } finally { setDisconnecting(false); } }} disabled={disconnecting}>{disconnecting ? <LoaderCircle size={15} className="spin" /> : <LogOut size={15} />} إنهاء الاتصال</button></> : <div className="disconnected-state"><div className="disconnected-art"><Router size={30} /><span><WifiOff size={16} /></span></div><strong>لا يوجد اتصال نشط</strong><p>أدخل بيانات الراوتر لقراءة هويته وإصدار RouterOS.</p></div>}
          </section>
          <section className="surface saved-card"><div className="surface-heading"><div><h3>الاتصالات المحفوظة</h3><p>اختر راوتراً لملء بيانات الاتصال السابقة</p></div><Clock3 size={17} className="muted-icon" /></div>{savedRouters.length ? savedRouters.slice(0, 6).map((item) => <button type="button" className="saved-mini saved-mini-button" key={item.id} onClick={() => chooseSavedRouter(item)}><span className="saved-mini-icon"><Router size={15} /></span><span><strong>{item.identity || item.name}</strong><small>{item.address}:{item.port} · {item.username}</small></span><span className="saved-mini-version">{item.has_saved_password?'بيانات محفوظة':'أدخل كلمة المرور'}</span></button>) : <div className="muted-empty">لا توجد اتصالات سابقة.</div>}</section>
        </aside>
      </div>
    </>
  );
}

function VouchersPage({ connected }: { connected: boolean }) {
  const [profiles, setProfiles] = useState<HotspotProfile[]>([]);
  const [users, setUsers] = useState<HotspotUser[]>([]);
  const [servers, setServers] = useState<string[]>(['all']);
  const [distributors, setDistributors] = useState<Awaited<ReturnType<typeof api.distributors>>>([]);
  const [serviceType, setServiceType] = useState<'hotspot'|'user_manager'>('hotspot');
  const [distributorID, setDistributorID] = useState('');
  const [outletName, setOutletName] = useState('');
  const [usernamePrefix, setUsernamePrefix] = useState('');
  const [tokenMode, setTokenMode] = useState<'alphanumeric'|'letters'|'numbers'>('alphanumeric');
  const [usernameLength, setUsernameLength] = useState('10');
  const [hotspotServer, setHotspotServer] = useState('all');
  const [passwordPolicy, setPasswordPolicy] = useState<'none'|'same_as_username'|'random'>('random');
  const [distributorPackageAllowed, setDistributorPackageAllowed] = useState(true);
  const [managed, setManaged] = useState<Awaited<ReturnType<typeof api.vouchers>>['items']>([]);
  const [managedTotal, setManagedTotal] = useState(0);
  const [managedRefresh, setManagedRefresh] = useState(0);
  const [managedPage, setManagedPage] = useState(0);
  const [usersPage, setUsersPage] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersRefresh, setUsersRefresh] = useState(0);
  const [userActionBusy, setUserActionBusy] = useState('');
  const [tablePageSize, setTablePageSize] = useState(20);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [packages, setPackages] = useState<Awaited<ReturnType<typeof api.packages>>>([]);
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof api.templates>>>([]);
  const [templateVersionID, setTemplateVersionID] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [packageID, setPackageID] = useState('');
  const [batchCount, setBatchCount] = useState('10');
  const [batchResult, setBatchResult] = useState<Awaited<ReturnType<typeof api.createBatch>> | null>(null);
  const [batchPrintInfo, setBatchPrintInfo] = useState<{ versionID: string; packageName: string; validity: string } | null>(null);
  const [printDocument, setPrintDocument] = useState<import('./api').CardTemplateDocument | null>(null);
  const [templatePreviewDocument, setTemplatePreviewDocument] = useState<import('./api').CardTemplateDocument | null>(null);
  const [templatePreviewLoading, setTemplatePreviewLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const load = async (refreshUsers = true) => {
    if (!connected) return;
    setLoading(true); setError('');
    try {
      const [loadedProfiles, loadedPackages, loadedTemplates, loadedServers, loadedDistributors] = await Promise.all([api.profiles(), api.packages(), api.templates(), api.hotspotServers(), api.distributors()]);
      const availablePackages = loadedPackages.filter((item) => item.enabled && item.service_type === serviceType);
      setProfiles(loadedProfiles); setPackages(availablePackages); setTemplates(loadedTemplates); setServers(loadedServers); setDistributors(loadedDistributors.filter((item)=>item.active));
      if (!templateVersionID && loadedTemplates[0]) setTemplateVersionID(loadedTemplates[0].version_id);
      if (!availablePackages.some((item)=>item.id===packageID)) { const prefix=availablePackages[0]?.username_prefix ?? ''; setPackageID(availablePackages[0]?.id ?? ''); setUsernamePrefix(prefix); setUsernameLength((current)=>String(Math.max(Number(current)||10,prefix.length+4))); }
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر قراءة بيانات HotSpot'); }
    finally { setLoading(false); if (refreshUsers) setUsersRefresh((value)=>value+1); }
  };
  useEffect(() => { void load(false); }, [connected, serviceType]);
  useEffect(() => {
    if (!connected) { setUsers([]); setUsersTotal(0); return; }
    let cancelled = false;
    api.hotspotUsersPage(usersPage * tablePageSize, tablePageSize, query).then((result) => {
      if (cancelled) return;
      setUsers(result.items); setUsersTotal(result.total);
      if (usersPage > 0 && usersPage * tablePageSize >= result.total) setUsersPage(Math.max(0, Math.ceil(result.total / tablePageSize) - 1));
    }).catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تحميل مستخدمي HotSpot'); });
    return () => { cancelled = true; };
  }, [connected, usersPage, tablePageSize, query, usersRefresh]);
  useEffect(() => {
    if (!connected) { setManaged([]); setManagedTotal(0); return; }
    let cancelled=false;
    api.vouchers(managedPage*tablePageSize,tablePageSize,query).then((result)=>{if(!cancelled){setManaged(result.items);setManagedTotal(result.total);if(managedPage>0&&managedPage*tablePageSize>=result.total)setManagedPage(Math.max(0,Math.ceil(result.total/tablePageSize)-1));}}).catch((err)=>{if(!cancelled)setError(err instanceof Error?err.message:'تعذر تحميل القسائم المحفوظة');});
    return ()=>{cancelled=true};
  }, [connected,managedPage,tablePageSize,query,managedRefresh]);
  useEffect(() => {
    if (!distributorID) { setDistributorPackageAllowed(true); return; }
    setDistributorPackageAllowed(false);
    let cancelled = false;
    api.distributorPackagePolicy(distributorID).then((policy) => { if (!cancelled) { const selected = policy.packages.find((item)=>item.package_id===packageID); setDistributorPackageAllowed(selected?.allowed ?? policy.all_packages_enabled); const prefix=selected?.username_prefix_override || packages.find((item)=>item.id===packageID)?.username_prefix || ''; setUsernamePrefix(prefix); setUsernameLength((current)=>String(Math.max(Number(current)||10,prefix.length+4))); } }).catch(() => { if (!cancelled) setDistributorPackageAllowed(false); });
    return () => { cancelled = true; };
  }, [distributorID, packageID, packages]);
  const applicableTemplates = useMemo(() => templates.filter((item) => item.service_type === serviceType && (
    item.scope === 'global' && (!item.package_id || item.package_id === packageID) ||
    item.scope === 'package' && item.package_id === packageID ||
    item.scope === 'distributor' && item.package_id === packageID && item.distributor_id === distributorID
  )).sort((a,b) => {
    const rank = (item: typeof a) => item.scope === 'distributor' ? 0 : item.scope === 'package' ? 1 : item.package_id ? 2 : 3;
    return rank(a)-rank(b);
  }), [templates, serviceType, packageID, distributorID]);
  useEffect(() => {
    if (applicableTemplates.some((item)=>item.version_id===templateVersionID)) return;
    setTemplateVersionID(applicableTemplates[0]?.version_id ?? '');
  }, [applicableTemplates, templateVersionID]);
  useEffect(() => {
    if (!templateVersionID) { setTemplatePreviewDocument(null); setTemplatePreviewLoading(false); return; }
    let cancelled = false;
    setTemplatePreviewLoading(true);
    api.templateVersion(templateVersionID).then((item) => { if (!cancelled) setTemplatePreviewDocument(item.document ?? null); }).catch(() => { if (!cancelled) setTemplatePreviewDocument(null); }).finally(() => { if (!cancelled) setTemplatePreviewLoading(false); });
    return () => { cancelled = true; };
  }, [templateVersionID]);

  useEffect(() => {
    if (!batchPrintInfo?.versionID) { setPrintDocument(null); return; }
    let cancelled = false;
    api.templateVersion(batchPrintInfo.versionID).then((item) => { if (!cancelled) setPrintDocument(item.document ?? null); }).catch(() => { if (!cancelled) setPrintDocument(null); });
    return () => { cancelled = true; };
  }, [batchPrintInfo]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedPackage = packages.find((item) => item.id === packageID);
    if (!selectedPackage) { setError('الباقة المحددة غير متاحة؛ اختر باقة مفعّلة ثم راجع الخطوات.'); return; }
    if (serviceType !== 'hotspot') { setError('إنشاء User Manager ما زال مقفلاً حتى اجتياز اختبار التوافق على RouterOS 6 و7.'); return; }
    if (!distributorPackageAllowed) { setError('لا تسمح سياسة الموزع بالباقة المحددة.'); return; }
    const count = Number(batchCount);
    const length = Number(usernameLength);
    if (!Number.isInteger(count) || count < 1 || count > 200 || !Number.isInteger(length) || length < Math.max(4, usernamePrefix.length + 4) || length > 32) { setError('راجع عدد القسائم وطول اسم الدخول في خطوة إعداد التوليد.'); return; }
    if (templateVersionID && (templatePreviewLoading || !templatePreviewDocument)) { setError('تعذر تحميل لقطة القالب المحدد؛ انتظر اكتمالها أو اختر قالباً آخر.'); return; }
    const referenceTotal = (selectedPackage.price_minor * count / 100).toLocaleString('ar-YE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const marginTotal = ((selectedPackage.price_minor - selectedPackage.distributor_price_minor) * count / 100).toLocaleString('ar-YE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (!window.confirm(`سيتم إنشاء ${count} مستخدم فعلياً على الراوتر بملف «${selectedPackage.profile_name}».\n\nالسعر المرجعي الإجمالي: ${referenceTotal} YER. الهامش النظري: ${marginTotal} YER.\nهذه مؤشرات تسعير فقط؛ لن تُنشأ مبيعات أو فواتير أو حركات مالية.\n\nهل تريد المتابعة؟`)) return;
    setSaving(true); setError(''); setSuccess(''); setBatchResult(null);
    try {
      const result = await api.createBatch({ package_id: packageID, count: Number(batchCount), template_version_id: templateVersionID || undefined, distributor_id: distributorID || undefined, outlet_name: outletName || undefined, username_prefix: usernamePrefix, token_mode: tokenMode, username_length: Number(usernameLength), hotspot_server: hotspotServer, password_policy: passwordPolicy });
      setBatchResult(result); setBatchPrintInfo({ versionID: templateVersionID, packageName: selectedPackage.name, validity: selectedPackage.validity_label }); setFormOpen(false); setSuccess(`انتهت الدفعة: نجح ${result.succeeded_count} من ${result.requested_count}.`);
      await load(); setManagedRefresh((value)=>value+1);
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
    try { await api.disableVoucher(id); setSuccess(`تم تعطيل ${username}.`); await load(); setManagedRefresh((value)=>value+1); }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذر تعطيل القسيمة'); }
  };
  const setHotspotUserState = async (user: HotspotUser) => {
    const disabled = !user.disabled;
    const action = disabled ? 'تعطيل' : 'تفعيل';
    const detail = disabled ? 'قد تبقى الجلسة الحالية متصلة؛ استخدم صفحة الجلسات لقطعها.' : 'سيتمكن الحساب من تسجيل الدخول مجدداً.';
    if (!window.confirm(`هل تريد ${action} المستخدم «${user.name}» على الراوتر؟\n\n${detail}`)) return;
    setError(''); setSuccess(''); setUserActionBusy(user.id);
    try {
      const result = await api.setHotspotUserDisabled(user.id, disabled);
      setSuccess(`تم ${action} «${result.name}» على الراوتر.`);
      setUsersRefresh((value) => value + 1);
      setManagedRefresh((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : `تعذر ${action} مستخدم HotSpot`);
    } finally {
      setUserActionBusy('');
    }
  };

  const printBatch = async () => {
    if (batchPrintInfo?.versionID && !printDocument) {
      try { const item = await api.templateVersion(batchPrintInfo.versionID); setPrintDocument(item.document ?? null); }
      catch { /* The built-in layout remains available if the saved template cannot be read. */ }
    }
    document.body.classList.add('printing-vouchers');
    const cleanupPrintState = () => document.body.classList.remove('printing-vouchers');
    window.addEventListener('afterprint', cleanupPrintState, { once: true });
    window.requestAnimationFrame(() => {
      window.print();
      if (batchResult?.id) void api.markBatchPrinted(batchResult.id).then(() => setSuccess('تم تسجيل وقت الطباعة في أرشيف الدفعات.')).catch(() => setError('اكتملت الطباعة لكن تعذر تسجيل وقتها في الأرشيف.'));
      window.setTimeout(cleanupPrintState, 1000);
    });
  };

  const selectedBatchPackage = packages.find((item) => item.id === packageID);
  const requestedCount = Math.max(0, Number(batchCount) || 0);
  const previewUsername = `${usernamePrefix.toUpperCase()}${'X'.repeat(Math.max(0,Math.min(32,(Number(usernameLength)||0)-usernamePrefix.length)))}`;
  const previewPassword = passwordPolicy==='none'?'بدون كلمة مرور':passwordPolicy==='same_as_username'?previewUsername:'••••••••';
  const referencePriceTotal = selectedBatchPackage ? selectedBatchPackage.price_minor * requestedCount / 100 : 0;
  const distributorMarginTotal = selectedBatchPackage ? (selectedBatchPackage.price_minor - selectedBatchPackage.distributor_price_minor) * requestedCount / 100 : 0;
  const estimatedExpiry = selectedBatchPackage ? estimateExpiry(selectedBatchPackage.validity_label) : null;
  const advanceWizard = () => {
    setError('');
    if (wizardStep === 0) {
      if (!selectedBatchPackage) { setError('اختر باقة مفعّلة قبل الانتقال إلى إعدادات التوليد.'); return; }
      if (!distributorPackageAllowed) { setError('تحقق من سياسة الباقة للموزع المحدد قبل المتابعة.'); return; }
    }
    if (wizardStep === 1) {
      const length = Number(usernameLength);
      if (!Number.isInteger(length) || length < Math.max(4, usernamePrefix.length + 4) || length > 32) { setError('طول اسم الدخول يجب أن يكون بين الحد الأدنى المطلوب و32 حرفاً.'); return; }
      if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 200) { setError('عدد القسائم يجب أن يكون عدداً صحيحاً بين 1 و200.'); return; }
    }
    setWizardStep((step) => Math.min(2, step + 1));
  };
  const visibleUsers = users;
  const visibleManaged = managed;
  const pagedUsers = visibleUsers;
  const pagedManaged = visibleManaged;

  return (
    <>
      <div className="page-heading"><div><div className="eyebrow"><Users size={14} /> HotSpot</div><h1>القسائم والمستخدمون</h1><p>توليد دفعات HotSpot، متابعة نتائج كل قسيمة، وإدارة المستخدمين المسجلين.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => void load()} disabled={!connected || loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> مزامنة</button><button className="button button-primary" onClick={() => { if (!formOpen) setWizardStep(0); setFormOpen((v) => !v); }} disabled={!connected}><Plus size={16} /> دفعة جديدة</button></div></div>
      {success && <div className="success-banner"><CheckCircle2 size={17} />{success}<button onClick={() => setSuccess('')}><X size={14} /></button></div>}
      {!connected ? <div className="surface empty-page"><span className="empty-big-icon"><Router size={28} /></span><h3>اربط الراوتر لعرض المستخدمين</h3><p>تظهر البيانات بعد نجاح الاتصال. لا توجد بيانات تجريبية أو أرقام افتراضية في هذه الصفحة.</p></div> : <>
        {formOpen && <section className="surface create-user-panel"><div className="surface-heading"><div><h3>إنشاء دفعة HotSpot</h3><p>تُسجّل الدفعة محلياً قبل الكتابة، وتُعرض نتيجة كل قسيمة على حدة.</p></div><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="إغلاق"><X size={17} /></button></div><form className="create-user-form batch-wizard-form" onSubmit={submit}><div className="batch-stepper field-wide" aria-label="خطوات إنشاء الدفعة">{['الخدمة والتخصيص','إعداد التوليد','المراجعة والتأكيد'].map((label,index)=><div key={label} className={`batch-step ${wizardStep===index?'batch-step-current':wizardStep>index?'batch-step-done':''}`}><span>{wizardStep>index?'✓':index+1}</span><small>{label}</small></div>)}</div>{wizardStep===0&&<div className="batch-step-panel field-wide"><label className="field"><span>نوع الخدمة <b>*</b></span><select value={serviceType} onChange={(e)=>{setServiceType(e.target.value as typeof serviceType);setPackageID('');}}><option value="hotspot">HotSpot</option><option value="user_manager">User Manager</option></select></label><label className="field"><span>الباقة <b>*</b></span><select value={packageID} onChange={(e)=>{const id=e.target.value;setPackageID(id);const prefix=packages.find((item)=>item.id===id)?.username_prefix??'';setUsernamePrefix(prefix);setUsernameLength((current)=>String(Math.max(Number(current)||10,prefix.length+4)));}} required><option value="" disabled>اختر باقة مفعّلة</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.profile_name}</option>)}</select></label><label className="field"><span>تخصيص الدفعة إلى</span><select value={distributorID} onChange={(e)=>setDistributorID(e.target.value)}><option value="">المشغّل (مخزون مركزي)</option>{distributors.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>اسم نقطة التوزيع (اختياري)</span><input value={outletName} onChange={(e)=>setOutletName(e.target.value)} maxLength={120} placeholder="مثال: بقالة محمد" /></label></div>}{wizardStep===1&&<div className="batch-step-panel field-wide"><label className="field"><span>بادئة اسم المستخدم</span><input value={usernamePrefix} onChange={(e)=>{const prefix=e.target.value.toUpperCase();setUsernamePrefix(prefix);setUsernameLength((current)=>String(Math.max(Number(current)||10,prefix.length+4)));}} maxLength={8} dir="ltr" /></label><label className="field"><span>نوع رمز الدخول</span><select value={tokenMode} onChange={(e)=>setTokenMode(e.target.value as typeof tokenMode)}><option value="alphanumeric">حروف وأرقام</option><option value="letters">حروف فقط</option><option value="numbers">أرقام فقط</option></select></label><label className="field"><span>طول اسم الدخول</span><input value={usernameLength} onChange={(e)=>setUsernameLength(e.target.value)} type="number" min={Math.max(4,usernamePrefix.length+4)} max={32} required /></label>{serviceType==='hotspot'&&<label className="field"><span>خادم HotSpot</span><select value={hotspotServer} onChange={(e)=>setHotspotServer(e.target.value)}>{servers.map((item)=><option key={item} value={item}>{item==='all'?'الكل':item}</option>)}</select></label>}<label className="field"><span>سياسة كلمة المرور</span><select value={passwordPolicy} onChange={(e)=>setPasswordPolicy(e.target.value as typeof passwordPolicy)}><option value="none">بدون كلمة مرور (اسم دخول فقط)</option><option value="same_as_username">مطابقة لاسم الدخول</option><option value="random">عشوائية منفصلة</option></select></label><label className="field"><span>عدد القسائم</span><input value={batchCount} onChange={(e) => setBatchCount(e.target.value)} type="number" min={1} max={200} required /></label></div>}{wizardStep===2&&<div className="batch-step-panel field-wide"><label className="field"><span>قالب الطباعة</span><select value={templateVersionID} onChange={(e)=>setTemplateVersionID(e.target.value)}><option value="">بدون قالب</option>{applicableTemplates.map((item)=><option key={item.version_id} value={item.version_id}>{item.name} · v{item.version}</option>)}</select></label><section className="batch-design-preview field-wide"><div className="batch-design-preview-heading"><strong>معاينة البطاقة قبل التوليد</strong><small>{templateVersionID?'معاينة الإصدار المحدد ومقاساته وخلفيته':'معاينة القالب الافتراضي'}</small></div>{templatePreviewLoading?<div className="muted-empty"><LoaderCircle size={15} className="spin"/> جارٍ تحميل تصميم القالب…</div>:templateVersionID&&!templatePreviewDocument?<div className="inline-error">تعذر تحميل لقطة القالب؛ أعد اختيار القالب أو اختر «بدون قالب».</div>:<CardPreview document={templatePreviewDocument??DEFAULT_CARD_TEMPLATE} values={{username:previewUsername||'BTXXXXXXXX',password:previewPassword,packageName:selectedBatchPackage?.name??'باقة تجريبية',validity:selectedBatchPackage?.validity_label??'24 ساعة'}} className="batch-design-card"/>}</section><section className="batch-summary field-wide"><div className="batch-summary-heading"><strong>ملخص تقديري قبل التأكيد</strong><small>الباقة: {selectedBatchPackage?.name??'—'} · مدة الوصف: {selectedBatchPackage?.validity_label||'غير محددة'} · تسعير ومخزون فقط، بلا مبيعات أو فواتير أو تحصيل.</small></div><div className="batch-summary-metrics"><div><small>عدد البطاقات</small><strong>{Number.isInteger(requestedCount)&&requestedCount>0?requestedCount.toLocaleString('ar-YE'):'—'}</strong></div><div><small>مجموع السعر المرجعي</small><strong>{referencePriceTotal.toLocaleString('ar-YE',{minimumFractionDigits:2,maximumFractionDigits:2})} YER</strong></div><div><small>الهامش النظري للدفعة</small><strong>{distributorMarginTotal.toLocaleString('ar-YE',{minimumFractionDigits:2,maximumFractionDigits:2})} YER</strong></div><div><small>انتهاء الصلاحية التقديري</small><strong>{estimatedExpiry?estimatedExpiry.toLocaleString('ar-YE'):'غير محسوب من وصف الصلاحية'}</strong></div><div><small>نموذج اسم الدخول</small><strong dir="ltr">{previewUsername||'—'}</strong></div><div><small>خادم HotSpot</small><strong>{hotspotServer==='all'?'كل الخوادم':hotspotServer}</strong></div></div><p>حساب الانتهاء تقديري ويفترض بدء الصلاحية الآن؛ قد يبدأ RouterOS احتسابها عند أول استخدام، لذا لا يُعد تاريخاً مؤكداً من الراوتر.</p></section>{serviceType==='user_manager'&&<div className="batch-info-warning field-wide">توليد User Manager للكتابة مؤجل حتى اجتياز اختبارات RouterOS v6 وv7. يمكنك تجهيز الباقة، لكن لن تُرسل أوامر إنشاء.</div>}{!distributorPackageAllowed&&<div className="batch-info-warning field-wide">هذه الباقة غير مسموح بها وفق سياسة الموزع المحدد.</div>}<span className="batch-security-note field-wide"><ShieldCheck size={15} /> كلمات المرور تُشفّر محلياً؛ يظهر سبب كل قسيمة فاشلة ولا يعاد الأمر الملتبس دون مصالحة.</span></div>}<div className="batch-wizard-controls field-wide">{wizardStep>0&&<button type="button" className="button button-quiet" onClick={()=>{setError('');setWizardStep((step)=>Math.max(0,step-1));}} disabled={saving}>السابق</button>}{wizardStep<2?<button type="button" className="button button-primary" onClick={advanceWizard} disabled={saving}>التالي</button>:<button type="submit" className="button button-primary" disabled={saving || !selectedBatchPackage || serviceType!=='hotspot' || !distributorPackageAllowed || (!!templateVersionID && (templatePreviewLoading || !templatePreviewDocument))}>{saving ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} إنشاء الدفعة على الراوتر</button>}</div></form></section>}
        {batchResult && <section className="surface generated-result"><div className="surface-heading"><div><h3>نتيجة الدفعة <bdi>#{batchResult.id.slice(0,8)}</bdi></h3><p>{batchResult.name} · {batchResult.outlet_name} · نجح {batchResult.succeeded_count} · تعذر {batchResult.failed_count} من أصل {batchResult.requested_count}</p></div><span className={`state-badge ${batchResult.state === 'completed' ? 'state-on' : 'state-off'}`}><i />{batchResult.state === 'completed' ? 'مكتملة' : batchResult.state === 'partial' ? 'جزئية' : 'تحتاج مراجعة'}</span><button className="button button-quiet compact-button" onClick={() => void printBatch()} disabled={!batchResult.succeeded_count}><Printer size={14}/> طباعة الناجح</button></div><div className="generated-credentials">{batchResult.vouchers.filter((item) => item.state === 'active').map((item) => <div className="credential-row" key={item.id}><strong>{item.username}</strong><code>{item.password || 'مشفّرة — استخدم عرض بيانات القسيمة'}</code><CheckCircle2 size={15} /></div>)}{batchResult.vouchers.filter((item) => item.state === 'failed').map((item) => <div className="credential-failure" key={item.id}><strong>{item.username}</strong><span>{item.error || 'لم يؤكد الراوتر إنشاء هذا المستخدم.'}</span></div>)}{!batchResult.succeeded_count && <p className="muted-empty">لم تنجح أي قسيمة؛ راجع تفاصيل الفشل أعلاه قبل إعادة المحاولة.</p>}</div><small className="result-disclaimer"><LockKeyhole size={12} /> تُعرض كلمات المرور الآن فقط. ويمكن استعادتها لاحقاً من السجل المحلي بعد التحقق من الصلاحية.</small></section>}
        {batchResult && batchResult.succeeded_count > 0 && <VoucherPrintSheet vouchers={batchResult.vouchers.filter((item) => item.state === 'active')} document={printDocument} packageName={batchPrintInfo?.packageName ?? ''} validity={batchPrintInfo?.validity ?? ''} />}
        {error && <div className="inline-error page-error"><AlertCircle size={16} />{error}</div>}
        <div className="voucher-stats"><div className="mini-stat"><span className="mini-stat-icon blue"><Users size={17} /></span><span><small>مستخدمو HotSpot</small><strong>{usersTotal}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon green"><PackageCheck size={17} /></span><span><small>ملفات الخدمة</small><strong>{profiles.length}</strong></span></div><div className="mini-stat"><span className="mini-stat-icon amber"><Activity size={17} /></span><span><small>حالة القراءة</small><strong className="small-stat-value">{loading ? 'جارٍ التحديث' : 'آخر قراءة ناجحة'}</strong></span></div></div>
        {(managedTotal > 0 || query) && <section className="surface table-panel managed-table"><div className="table-heading"><div><h3>القسائم المُدارة محلياً</h3><p>كلمات المرور مشفرة في قاعدة البيانات؛ إظهارها مؤقت لمدة 30 ثانية.</p></div><span className="profile-count">{managed.length} من {managedTotal} قسيمة</span></div><div className="table-scroll"><table><thead><tr><th>اسم المستخدم</th><th>الباقة</th><th>المخزون لدى</th><th>الحالة</th><th>إجراء آمن</th></tr></thead><tbody>{visibleManaged.length ? pagedManaged.map((item) => <tr key={item.id}><td><strong>{item.username}</strong>{item.failure_reason&&<small className="failure-hint">{item.failure_reason}</small>}</td><td>{item.package}</td><td>{item.owner}</td><td><span className={`state-badge ${item.state === 'active' ? 'state-on' : 'state-off'}`}><i />{item.state === 'active' ? 'نشطة' : item.state === 'disabled' ? 'معطلة' : item.state === 'failed' ? 'فشلت' : item.state}</span></td><td className="managed-actions">{revealed[item.id] ? <code>{revealed[item.id]}</code> : <button className="text-button" onClick={() => void revealCredentials(item.id)}><Eye size={14} /> كلمة المرور</button>}{item.state === 'active' && <button className="disable-link" onClick={() => void disableVoucher(item.id,item.username)}>تعطيل</button>}</td></tr>) : <tr><td colSpan={5} className="table-empty">لا توجد قسائم تطابق البحث.</td></tr>}</tbody></table></div><TablePagination page={managedPage} pageSize={tablePageSize} total={managedTotal} onPage={setManagedPage} onPageSize={(size)=>{setTablePageSize(size);setManagedPage(0);setUsersPage(0);}} label="قسيمة" /></section>}
        <section className="surface table-panel"><div className="table-heading"><div><h3>مستخدمي الراوتر</h3><p>كلمات المرور لا تُقرأ أو تُعرض في هذه القائمة.</p></div><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => {setQuery(e.target.value);setUsersPage(0);setManagedPage(0);}} placeholder="بحث بالاسم أو الملف" /></label></div>{loading ? <div className="table-empty"><LoaderCircle className="spin" size={20} /> جارٍ قراءة الراوتر…</div> : visibleUsers.length ? <><div className="table-scroll"><table><thead><tr><th>اسم المستخدم</th><th>ملف الخدمة</th><th>الخادم</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{pagedUsers.map((user) => <tr key={user.id || user.name}><td><span className="user-cell"><span className="user-table-avatar">{user.name.slice(0, 1).toUpperCase()}</span><strong>{user.name}</strong></span></td><td><span className="profile-badge">{user.profile || '—'}</span></td><td>{user.server || 'الافتراضي'}</td><td><span className={`state-badge ${user.disabled ? 'state-off' : 'state-on'}`}><i />{user.disabled ? 'معطّل' : 'مفعّل'}</span></td><td><button type="button" className="button button-quiet compact-button hotspot-user-action" onClick={() => void setHotspotUserState(user)} disabled={userActionBusy===user.id} title={user.disabled?'إتاحة تسجيل الدخول لهذا المستخدم':'منع تسجيل الدخول لهذا المستخدم'}>{userActionBusy===user.id?<LoaderCircle size={14} className="spin"/>:<Power size={14}/>} {user.disabled?'تفعيل':'تعطيل'}</button></td></tr>)}</tbody></table></div><TablePagination page={usersPage} pageSize={tablePageSize} total={usersTotal} onPage={setUsersPage} onPageSize={(size)=>{setTablePageSize(size);setUsersPage(0);setManagedPage(0);}} label="مستخدم" /></> : <div className="table-empty"><div className="empty-icon"><Users size={18} /></div>{query ? 'لا توجد نتائج تطابق البحث.' : 'لم تُرجع قراءة الراوتر مستخدمين.'}</div>}</section>
        <section className="surface profile-strip"><div className="surface-heading"><div><h3>ملفات HotSpot المقروءة</h3><p>لقطة من الراوتر النشط</p></div><span className="profile-count">{profiles.length} ملف</span></div><div className="profile-chips">{profiles.map((item) => <span key={item.id || item.name} className="profile-chip"><span />{item.name}<small>{item.shared_users ? `${item.shared_users} مستخدم` : 'HotSpot'}</small></span>)}{profiles.length === 0 && <span className="muted-empty">لا توجد ملفات متاحة.</span>}</div></section>
      </>}
    </>
  );
}

export default App;
