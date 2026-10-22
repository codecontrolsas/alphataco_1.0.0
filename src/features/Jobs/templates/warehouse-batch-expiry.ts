import type { ExpiringBatch } from '@/features/Warehouses/lib/expiring-batches';
import { formatQuantity } from '@/features/Warehouses/lib/format';
import {
  MAIL_COLORS as C,
  appUrl,
  badge,
  ctaBlock,
  escapeHtml,
  groupCardClose,
  groupCardOpen,
  headerPill,
  renderEmailShell,
  sectionHeader,
  tableHeaderRow,
} from '@/shared/lib/mail/shell';
import { formatDateAr, formatLongDateAr } from '@/shared/lib/argentina-time';
import type { RenderedEmail } from './deviations';

/**
 * Mail semanal de lotes vencidos y por vencer de Almacenes (spec etapa 2 §4.3). Solo se manda
 * si hay algo que avisar: el job saltea la empresa sin lotes en la ventana.
 */

/** La fila que arma `findExpiringBatches`: el mail muestra exactamente lo que el aviso de Stock. */
export type BatchExpiryItem = Omit<ExpiringBatch, 'materialId'>;

export interface WarehouseBatchExpiryEmailParams {
  companyName: string;
  today: string;
  windowDays: number;
  items: readonly BatchExpiryItem[];
}

function group(title: string, items: readonly BatchExpiryItem[], expired: boolean): string {
  if (items.length === 0) return '';
  const byWarehouse = new Map<string, BatchExpiryItem[]>();
  for (const item of items) byWarehouse.set(item.warehouse, [...(byWarehouse.get(item.warehouse) ?? []), item]);

  let html = sectionHeader(title, `${items.length} lote${items.length !== 1 ? 's' : ''}`);
  for (const [warehouse, rows] of byWarehouse) {
    html += groupCardOpen(warehouse, `${rows.length} lote${rows.length !== 1 ? 's' : ''}`);
    html += tableHeaderRow(['Material', 'Lote', 'Vencimiento', 'Saldo']);
    for (const row of rows) {
      html += `
        <tr>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;">${escapeHtml(row.material)}
            <span style="color:${C.textMuted};font-size:11px;"> ${escapeHtml(row.materialCode)}</span></td>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;font-family:monospace;">${escapeHtml(row.batch)}</td>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;white-space:nowrap;">${formatDateAr(row.expiresOn)}
            ${expired ? badge('Vencido', 'danger') : ''}</td>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;white-space:nowrap;text-align:right;">${formatQuantity(row.quantity)} ${escapeHtml(row.unit)}</td>
        </tr>`;
    }
    html += groupCardClose;
  }
  return html;
}

export function renderWarehouseBatchExpiryEmail(params: WarehouseBatchExpiryEmailParams): RenderedEmail {
  const { companyName, today, windowDays, items } = params;
  const expired = items.filter((i) => i.status === 'EXPIRED');
  const expiring = items.filter((i) => i.status === 'EXPIRING');
  const stockUrl = `${appUrl()}/dashboard/warehouse?tab=stock`;

  const body =
    group('Lotes vencidos', expired, true) +
    (expired.length > 0
      ? `<p style="margin:0 0 20px;font-size:12px;color:${C.textMuted};">Los lotes vencidos no pueden salir ni transferirse: se dan de baja con un ajuste.</p>`
      : '') +
    group(`Vencen en los próximos ${windowDays} días`, expiring, false) +
    ctaBlock(stockUrl, 'Ver stock');

  const badgeHtml = headerPill(`${expired.length} vencidos · ${expiring.length} por vencer`);

  return {
    subject: `Lotes por vencer — ${companyName} — ${formatLongDateAr(today)}`,
    html: renderEmailShell({
      companyName,
      title: 'Vencimientos de lotes',
      subtitle: formatLongDateAr(today),
      badgeHtml,
      body,
    }),
    text: [
      `Vencimientos de lotes de ${companyName} — ${formatDateAr(today)}`,
      `Vencidos: ${expired.length}`,
      ...expired.map(
        (i) =>
          `  - ${i.material} · lote ${i.batch} · ${i.warehouse} · venció ${formatDateAr(i.expiresOn)} · ${formatQuantity(i.quantity)} ${i.unit}`
      ),
      `Vencen en los próximos ${windowDays} días: ${expiring.length}`,
      ...expiring.map(
        (i) =>
          `  - ${i.material} · lote ${i.batch} · ${i.warehouse} · vence ${formatDateAr(i.expiresOn)} · ${formatQuantity(i.quantity)} ${i.unit}`
      ),
      `Ver stock: ${stockUrl}`,
    ].join('\n'),
  };
}
