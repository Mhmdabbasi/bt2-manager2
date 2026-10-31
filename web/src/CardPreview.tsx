import { QRCodeSVG } from 'qrcode.react';
import type { CSSProperties } from 'react';
import type { CardTemplateDocument, CardTemplateField } from './api';

export const DEFAULT_CARD_TEMPLATE: CardTemplateDocument = {
  width_mm: 51,
  height_mm: 19.4,
  background: '#ffffff',
  page_columns: 4,
  page_rows: 15,
  fields: [
    { id: 'preview-title', kind: 'text', field: '', text: 'بطاقة إنترنت', x: 2, y: 1, width: 47, height: 4, font_size: 9, font_weight: 'bold', align: 'center', color: '#167b70' },
    { id: 'preview-user', kind: 'field', field: 'username', text: '', x: 2, y: 6, width: 47, height: 5, font_size: 12, font_weight: 'bold', align: 'center', color: '#20383b' },
    { id: 'preview-pass', kind: 'field', field: 'password', text: '', x: 2, y: 12, width: 47, height: 4, font_size: 9, font_weight: 'normal', align: 'center', color: '#667c7d' },
  ],
};

type PreviewValues = { username?: string; password?: string; packageName?: string; validity?: string; date?: string };

export function CardPreview({ document, values = {}, className = '' }: { document: CardTemplateDocument; values?: PreviewValues; className?: string }) {
  const today = values.date ?? new Date().toLocaleDateString('ar-YE');
  const fieldValue = (field: CardTemplateField) => {
    if (field.kind === 'text') return field.text;
    if (field.field === 'username') return values.username ?? 'BT2A7K9M';
    if (field.field === 'password') return values.password ?? '••••••••';
    if (field.field === 'package') return values.packageName ?? 'باقة تجريبية';
    if (field.field === 'validity') return values.validity ?? '24 ساعة';
    if (field.field === 'date' || field.field === 'print_date') return today;
    return '';
  };
  const hasImage = document.background_mode === 'image' && !!document.background_image;
  return <div className={`card-preview ${className}`} style={{ width: `${document.width_mm}mm`, height: `${document.height_mm}mm`, backgroundColor: document.background || '#ffffff' } as CSSProperties}>
    {hasImage && <img className="card-preview-image" src={document.background_image} alt="" style={{ objectFit: document.background_fit ?? 'cover' }} />}
    {document.fields.map((field) => <div key={field.id} className="card-preview-field" style={{ left: `${field.x}mm`, top: `${field.y}mm`, width: `${field.width}mm`, height: `${field.height}mm`, fontSize: `${field.font_size}pt`, fontWeight: field.font_weight === 'bold' ? 700 : 400, textAlign: field.align, color: field.color || '#20383b' } as CSSProperties}>
      {field.kind === 'field' && field.field === 'qrcode' ? <QRCodeSVG value={JSON.stringify({ username: values.username ?? 'BT2A7K9M', password: values.password ?? 'DEMO1234' })} size={128} level="M" style={{ width: '100%', height: '100%' }} /> : fieldValue(field)}
    </div>)}
  </div>;
}
