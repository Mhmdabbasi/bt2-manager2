import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';

export function TablePagination({ page, pageSize, total, onPage, onPageSize, label = 'سجلات' }: {
  page: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize: (size: number) => void; label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="archive-pagination"><span>إجمالي {total} {label} · صفحة {page + 1} من {pages}</span><div><label>عدد الصفوف <select value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label><button className="button button-quiet compact-button" aria-label="أول صفحة" onClick={() => onPage(0)} disabled={page === 0}><ChevronFirst size={14}/> الأولى</button><button className="button button-quiet compact-button" aria-label="الصفحة السابقة" onClick={() => onPage(page - 1)} disabled={page === 0}><ChevronRight size={14}/> السابق</button><button className="button button-quiet compact-button" aria-label="الصفحة التالية" onClick={() => onPage(page + 1)} disabled={page >= pages - 1}>التالي <ChevronLeft size={14}/></button><button className="button button-quiet compact-button" aria-label="آخر صفحة" onClick={() => onPage(pages - 1)} disabled={page >= pages - 1}>الأخيرة <ChevronLast size={14}/></button></div></div>;
}
