import { useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, Database, Download, LockKeyhole } from 'lucide-react';
import { api } from './api';

export function BackupPage() {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setSuccess('');
    if (password.length < 12) { setError('اختر عبارة مرور لا تقل عن 12 حرفاً.'); return; }
    if (password !== confirmation) { setError('عبارتا المرور غير متطابقتين.'); return; }
    setBusy(true);
    try {
      const file = await api.exportBackup(password);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      link.href = url; link.download = `bt2-manager2-${new Date().toISOString().slice(0, 10)}.bt2backup`;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPassword(''); setConfirmation('');
      setSuccess('تم إنشاء النسخة المشفّرة وتنزيلها. احتفظ بعبارة المرور منفصلة عن الملف.');
    } catch (err) { setError(err instanceof Error ? err.message : 'تعذر إنشاء النسخة الاحتياطية.'); }
    finally { setBusy(false); }
  };

  return <>
    <div className="page-heading"><div><div className="eyebrow"><Database size={14} /> حماية البيانات</div><h1>النسخ الاحتياطي المحلي</h1><p>صدّر بياناتك المحلية في ملف واحد مشفّر بعبارة مرور تختارها.</p></div></div>
    {error && <div className="inline-error page-error"><AlertCircle size={16} />{error}</div>}
    {success && <div className="success-banner"><CheckCircle2 size={17} />{success}</div>}
    <section className="surface backup-panel">
      <div className="backup-explainer"><span className="backup-icon"><LockKeyhole size={21}/></span><div><h3>تشفير قبل التنزيل</h3><p>تُضمّن النسخة قاعدة البيانات ومفتاح التشفير المحلي، وتُحمى بتشفير AES-GCM مع اشتقاق مفتاح scrypt. لا تُرسل إلى أي خدمة خارجية.</p></div></div>
      <form className="backup-form" onSubmit={submit}>
        <label className="field"><span>عبارة مرور النسخة <b>*</b></span><input type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={password} onChange={(event)=>setPassword(event.target.value)} required placeholder="12 حرفاً على الأقل" /></label>
        <label className="field"><span>تأكيد عبارة المرور <b>*</b></span><input type="password" autoComplete="new-password" minLength={12} maxLength={1024} value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} required /></label>
        <button className="button button-primary" disabled={busy}>{busy ? 'جارٍ إعداد النسخة…' : <><Download size={16}/> إنشاء وتنزيل نسخة مشفّرة</>}</button>
      </form>
      <div className="backup-warning"><AlertCircle size={16}/><span><strong>مهم:</strong> استعادة النسخة من واجهة التطبيق غير متاحة بعد. احتفظ بملف النسخة وعبارة المرور؛ لا تعتبر التصدير بديلاً عن اختبار استعادة فعلي.</span></div>
    </section>
  </>;
}
