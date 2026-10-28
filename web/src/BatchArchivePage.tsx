import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, LoaderCircle, Power, Printer, RefreshCw, Search, ShieldAlert, ToggleRight, X } from 'lucide-react';
import { api, type ArchivedBatch, type ArchivedVoucher, type BatchArchiveRow, type CardTemplateDocument } from './api';
import { VoucherPrintSheet } from './VoucherPrintSheet';
import { TablePagination } from './TablePagination';

type BatchDetail = { batch: ArchivedBatch; vouchers: ArchivedVoucher[] };

const formatDate = (value: string) => value ? new Date(value).toLocaleString('ar-YE', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const serviceLabel = (value: string) => value === 'hotspot' ? 'HotSpot' : value === 'user_manager' ? 'User Manager' : value;

export function BatchArchivePage() {
  const [items, setItems] = useState<BatchArchiveRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [query, setQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busyID, setBusyID] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [template, setTemplate] = useState<CardTemplateDocument | null>(null);
  const [printingID, setPrintingID] = useState('');
  const visibleItems = useMemo(() => items, [items]);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await api.batches(page * pageSize, pageSize, query.trim());
      setItems(result.items); setTotal(result.total);
      if (page > 0 && page * pageSize >= result.total) setPage(Math.max(0, Math.ceil(result.total / pageSize) - 1));
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر تحميل أرشيف الدفعات'); }
    finally { setLoading(false); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 220); return () => window.clearTimeout(timer); }, [page, pageSize, query, refreshKey]);

  const openDetail = async (id: string) => {
    setBusyID(id); setError(''); setSuccess('');
    try {
      const result = await api.batch(id);
      setDetail(result);
      const frozen = result.batch.generation_options.template_document_json;
      if (typeof frozen === 'string' && frozen) {
        try { setTemplate(JSON.parse(frozen) as CardTemplateDocument); }
        catch { setTemplate(null); }
      } else if (result.batch.template_version_id) {
        try { const saved = await api.templateVersion(result.batch.template_version_id); setTemplate(saved.document ?? null); }
        catch { setTemplate(null); }
      } else setTemplate(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر فتح الدفعة'); }
    finally { setBusyID(''); }
  };

  const toggleBatch = async (row: BatchArchiveRow, enable: boolean) => {
    const action = enable ? 'تفعيل' : 'تعطيل';
    const count = enable ? row.disabled_count : row.active_count;
    if (!count || !window.confirm(`سيتم ${action} ${count} قسيمة من الدفعة «${row.name}» على الراوتر الأصلي. هل تريد المتابعة؟`)) return;
    setBusyID(row.id); setError(''); setSuccess('');
    try {
      const result = enable ? await api.enableBatch(row.id) : await api.disableBatch(row.id);
      setSuccess(`تم ${action} ${result.succeeded_count} من ${result.requested_count} قسيمة${result.failed_count ? `؛ تعذر ${result.failed_count}` : ''}.`);
      if (result.failed_count) setError(result.results.filter((item) => item.error).map((item) => `${item.username}: ${item.error}`).join(' · '));
      setRefreshKey((value) => value + 1);
      if (detail?.batch.id === row.id) await openDetail(row.id);
    } catch (err) { setError(err instanceof Error ? err.message : `تعذر ${action} الدفعة`); }
    finally { setBusyID(''); }
  };

  const requestPrint = async (id: string) => {
    setBusyID(id); setError(''); setSuccess('');
    try {
      const result = await api.batch(id);
      setDetail(result);
      const frozen = result.batch.generation_options.template_document_json;
      if (typeof frozen === 'string' && frozen) {
        try { setTemplate(JSON.parse(frozen) as CardTemplateDocument); } catch { setTemplate(null); }
      } else if (result.batch.template_version_id) {
        try { const saved = await api.templateVersion(result.batch.template_version_id); setTemplate(saved.document ?? null); } catch { setTemplate(null); }
      } else setTemplate(null);
      if (!result.vouchers.some((voucher) => voucher.state === 'active' || voucher.state === 'disabled')) throw new Error('لا توجد قسائم ناجحة قابلة لإعادة الطباعة.');
      setPrintingID(id);
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذرت تهيئة الطباعة'); }
    finally { setBusyID(''); }
  };

  useEffect(() => {
    if (!printingID || detail?.batch.id !== printingID) return;
    const id = printingID;
    const clear = () => {
      document.body.classList.remove('printing-vouchers');
      window.removeEventListener('afterprint', afterPrint);
      setPrintingID('');
    };
    const afterPrint = () => {
      void api.markBatchPrinted(id).then(() => {
        setSuccess('تم تسجيل تاريخ إعادة الطباعة في الأرشيف.');
        setRefreshKey((value) => value + 1);
      }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر حفظ تاريخ الطباعة')).finally(clear);
    };
    document.body.classList.add('printing-vouchers');
    window.addEventListener('afterprint', afterPrint, { once: true });
    const frame = window.requestAnimationFrame(() => window.print());
    const fallback = window.setTimeout(() => { if (printingID === id) clear(); }, 120_000);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(fallback); document.body.classList.remove('printing-vouchers'); window.removeEventListener('afterprint', afterPrint); };
  }, [printingID, detail]);

  const printable = detail?.vouchers.filter((item) => item.state === 'active' || item.state === 'disabled').map((item) => ({ ...item, state: 'active' })) ?? [];
  const options = detail?.batch.generation_options ?? {};
  const printPackage = String(options.package_name ?? detail?.batch.package ?? '');
  const printValidity = String(options.validity_label ?? detail?.batch.validity_label ?? '');

  return <>
    <div className="page-heading"><div><div className="eyebrow"><Printer size={14} /> سجل الدفعات</div><h1>أرشيف دفع القسائم</h1><p>عرض الدفعات السابقة، معاينة بياناتها، إعادة طباعتها بقالبها الأصلي، وإدارة حالتها على الراوتر.</p></div><div className="heading-actions"><button className="button button-quiet" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCw size={15} className={loading ? 'spin' : ''} /> تحديث</button></div></div>
    {success && <div className="success-banner"><CheckCircle2 size={17} />{success}<button onClick={() => setSuccess('')} aria-label="إغلاق"><X size={14} /></button></div>}
    {error && <div className="inline-error page-error"><AlertCircle size={16} />{error}</div>}
    <section className="surface batch-archive-panel">
      <div className="table-heading"><div><h3>الدفعات المسجلة</h3><p>تُحفظ إعدادات التوليد ونسخة القالب مع الدفعة لإعادة الطباعة كما أُنشئت.</p></div><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="بحث بالدفعة أو النقطة أو الباقة" /></label></div>
      {loading ? <div className="table-empty"><LoaderCircle size={20} className="spin" /> جارٍ تحميل الأرشيف…</div> : visibleItems.length ? <div className="table-scroll"><table><thead><tr><th>اسم الدفعة</th><th>نقطة التوزيع</th><th>الباقة / الخدمة</th><th>تاريخ الإضافة</th><th>تاريخ الطباعة</th><th>النتيجة</th><th>الإجراءات</th></tr></thead><tbody>{visibleItems.map((row) => <tr key={row.id}><td><strong className="archive-batch-name">{row.name}</strong><small className="archive-batch-sub">{row.print_count ? `طُبعت ${row.print_count} مرة` : 'لم تُطبع بعد'}</small></td><td>{row.outlet_name || 'المشغّل المحلي'}</td><td><strong>{row.package}</strong><small className="archive-batch-sub">{serviceLabel(row.service_type)} · {row.profile_name}</small></td><td>{formatDate(row.created_at)}</td><td>{formatDate(row.printed_at)}</td><td><span className="archive-counts"><span className="state-on">نجح {row.succeeded_count}</span><span className="state-off">فشل {row.failed_count}</span></span></td><td><div className="archive-actions"><button className="icon-button" title="عرض التفاصيل" aria-label="عرض التفاصيل" onClick={() => void openDetail(row.id)} disabled={busyID === row.id}><Eye size={16} /></button><button className="icon-button" title="إعادة الطباعة" aria-label="إعادة الطباعة" onClick={() => void requestPrint(row.id)} disabled={busyID === row.id || row.succeeded_count === 0}><Printer size={16} /></button><button className="icon-button archive-disable" title="تعطيل الناجح" aria-label="تعطيل الناجح" onClick={() => void toggleBatch(row, false)} disabled={busyID === row.id || row.active_count === 0}><Power size={16} /></button><button className="icon-button archive-enable" title="تفعيل المعطل" aria-label="تفعيل المعطل" onClick={() => void toggleBatch(row, true)} disabled={busyID === row.id || row.disabled_count === 0}><ToggleRight size={17} /></button></div></td></tr>)}</tbody></table></div> : <div className="table-empty"><ShieldAlert size={19} />{query ? 'لا توجد دفعات تطابق البحث.' : 'لا توجد دفعات محفوظة بعد.'}</div>}
      <TablePagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(size)=>{setPageSize(size);setPage(0);}} label="دفعة" />
    </section>
    {detail && <section className="surface archive-detail"><div className="surface-heading"><div><h3>{detail.batch.name} · {detail.batch.outlet_name}</h3><p>{detail.batch.package} · {serviceLabel(detail.batch.service_type)} · أُنشئت {formatDate(detail.batch.created_at)}</p></div><button className="icon-button" onClick={() => setDetail(null)} aria-label="إغلاق التفاصيل"><X size={17} /></button></div><div className="archive-detail-meta"><span>القالب: {detail.batch.template_version_id ? detail.batch.template_version_id.slice(0, 8) : 'التخطيط الافتراضي'}</span><span>خادم HotSpot: {String(options.hotspot_server ?? 'all')}</span><span>البادئة: {String(options.username_prefix ?? '—')}</span><span>نوع الرمز: {String(options.token_mode ?? '—')}</span><span>طول الاسم: {String(options.username_length ?? '—')}</span><span>كلمة المرور: {String(options.password_policy ?? '—')}</span><span>آخر طباعة: {formatDate(detail.batch.printed_at)}</span></div><div className="table-scroll"><table><thead><tr><th>اسم المستخدم</th><th>كلمة المرور</th><th>الحالة</th><th>السبب</th></tr></thead><tbody>{detail.vouchers.map((voucher) => <tr key={voucher.id}><td><strong>{voucher.username}</strong></td><td><code>{voucher.password || '—'}</code></td><td>{voucher.state === 'active' ? 'نشطة' : voucher.state === 'disabled' ? 'معطلة' : voucher.state === 'failed' ? 'فشلت' : voucher.state}</td><td>{voucher.error || '—'}</td></tr>)}</tbody></table></div><div className="archive-detail-actions"><button className="button button-primary" onClick={() => void requestPrint(detail.batch.id)} disabled={!detail.vouchers.some((voucher) => voucher.state === 'active' || voucher.state === 'disabled')}><Printer size={15} /> إعادة طباعة هذه الدفعة</button><small>تُستخدم لقطة القالب وإعدادات الطباعة المحفوظة مع الدفعة، وليس القالب الحالي.</small></div></section>}
    {detail && printable.length > 0 && <VoucherPrintSheet vouchers={printable} document={template} packageName={printPackage} validity={printValidity} />}
  </>;
}
