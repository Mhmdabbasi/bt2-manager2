import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { CardTemplateDocument } from './api';

type PrintableVoucher = { id: string; username: string; password: string; state: string };

const fallback: CardTemplateDocument = {
  width_mm: 51, height_mm: 18.8, background: '#ffffff', fields: [
    { id: 'print-user', kind: 'field', field: 'username', text: '', x: 2, y: 3, width: 47, height: 5, font_size: 12, font_weight: 'bold', align: 'center', color: '#183d35' },
    { id: 'print-pass', kind: 'field', field: 'password', text: '', x: 2, y: 10, width: 47, height: 4, font_size: 9, font_weight: 'normal', align: 'center', color: '#536d68' },
  ],
};

export function VoucherPrintSheet({ vouchers, document, packageName, validity }: {
  vouchers: PrintableVoucher[];
  document?: CardTemplateDocument | null;
  packageName: string;
  validity: string;
}) {
  const layout = document ?? fallback;
  const columns = Math.max(1, Math.floor(204 / layout.width_mm));
  const rows = Math.max(1, Math.floor(291 / layout.height_mm));
  const perPage = columns * rows;
  const pages = Array.from({ length: Math.ceil(vouchers.length / perPage) }, (_, index) => vouchers.slice(index * perPage, (index + 1) * perPage));
  const printedDate = new Date().toLocaleDateString('ar-YE');
  const valueFor = (field: string, voucher: PrintableVoucher) => ({ username: voucher.username, password: voucher.password, package: packageName, validity, date: printedDate, print_date: printedDate } as Record<string, string>)[field] ?? '';
  return createPortal(<div className="voucher-print-sheet" aria-hidden="true">{pages.map((items, pageIndex) => <div className="voucher-print-page" key={pageIndex} style={{ gridTemplateColumns: `repeat(${columns}, ${layout.width_mm}mm)`, gridAutoRows: `${layout.height_mm}mm` }}>
    {items.map((voucher) => <div className="voucher-print-card" key={voucher.id} style={{ width: `${layout.width_mm}mm`, height: `${layout.height_mm}mm`, background: layout.background }}>
      {layout.fields.map((field) => <div key={field.id} className="voucher-print-field" style={{ left: `${field.x}mm`, top: `${field.y}mm`, width: `${field.width}mm`, height: `${field.height}mm`, fontSize: `${field.font_size}pt`, fontWeight: field.font_weight === 'bold' ? 700 : 400, textAlign: field.align, color: field.color || '#20383b' }}>{field.kind === 'text' ? field.text : field.field === 'qrcode' ? <QRCodeSVG value={JSON.stringify({ username: voucher.username, password: voucher.password })} size={128} level="M" style={{ width: '100%', height: '100%' }} /> : valueFor(field.field, voucher)}</div>)}
    </div>)}
  </div>)}</div>, window.document.body);
}
