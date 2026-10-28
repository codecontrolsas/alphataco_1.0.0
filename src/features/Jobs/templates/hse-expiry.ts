import { formatDateAr, formatLongDateAr } from '@/shared/lib/argentina-time';
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
import type { RenderedEmail } from './deviations';

/**
 * Correos del job `hse-expiry` (ticket 804, fase 4):
 * - al EMPLEADO: sus capacitaciones o documentos HSE que vencen pronto o ya vencieron (lleva al portal);
 * - a HSE (resumen semanal por roles): vencidos, por vencer y pendientes de la empresa (lleva al dashboard).
 */

export interface HseEmployeeNoticeItem {
  kind: 'training' | 'document';
  title: string;
  /** `YYYY-MM-DD` */
  dueOn: string;
  window: 'upcoming' | 'expired';
}

const KIND_LABEL = { training: 'Capacitación', document: 'Documento HSE' } as const;

function itemRows(items: readonly HseEmployeeNoticeItem[]): string {
  let html = tableHeaderRow(['Qué', 'Vencimiento', 'Estado']);
  for (const item of items) {
    html += `
      <tr>
        <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;">${escapeHtml(item.title)}
          <span style="color:${C.textMuted};font-size:11px;"> ${KIND_LABEL[item.kind]}</span></td>
        <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;white-space:nowrap;">${formatDateAr(item.dueOn)}</td>
        <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;white-space:nowrap;">${
          item.window === 'expired' ? badge('Vencido', 'danger') : badge('Por vencer', 'warn')
        }</td>
      </tr>`;
  }
  return html;
}

export function renderHseEmployeeExpiryEmail(params: {
  companyName: string;
  employeeName: string;
  today: string;
  items: readonly HseEmployeeNoticeItem[];
}): RenderedEmail {
  const { companyName, employeeName, today, items } = params;
  const portalUrl = `${appUrl()}/portal`;
  const expired = items.filter((i) => i.window === 'expired').length;
  const body =
    `<p style="margin:0 0 16px;font-size:14px;">Hola ${escapeHtml(employeeName)}: tenés ${items.length} ${
      items.length === 1 ? 'ítem de HSE que vence pronto o ya venció' : 'ítems de HSE que vencen pronto o ya vencieron'
    }. Entrá al portal para ponerte al día.</p>` +
    groupCardOpen('Tus vencimientos', `${items.length}`) +
    itemRows(items) +
    groupCardClose +
    ctaBlock(portalUrl, 'Ir al portal');
  return {
    subject: `${expired > 0 ? 'Vencimientos HSE' : 'Por vencer en HSE'} — ${companyName}`,
    html: renderEmailShell({
      companyName,
      title: 'Avisos de HSE',
      subtitle: formatLongDateAr(today),
      badgeHtml: headerPill(`${items.length} aviso${items.length === 1 ? '' : 's'}`),
      body,
    }),
    text: [
      `Hola ${employeeName}: estos ítems de HSE vencen pronto o ya vencieron.`,
      ...items.map(
        (i) =>
          `  - ${KIND_LABEL[i.kind]}: ${i.title} · ${i.window === 'expired' ? 'venció' : 'vence'} el ${formatDateAr(i.dueOn)}`
      ),
      `Portal: ${portalUrl}`,
    ].join('\n'),
  };
}

export interface HseSummaryTrainingRow {
  file: string | null;
  employee: string;
  title: string;
  dueOn: string;
  expired: boolean;
}

export interface HseSummaryDocumentRow {
  title: string;
  version: number;
  dueOn: string;
  expired: boolean;
}

export interface HseExpirySummaryParams {
  companyName: string;
  today: string;
  windowDays: number;
  trainings: readonly HseSummaryTrainingRow[];
  documents: readonly HseSummaryDocumentRow[];
  pending: { acknowledgements: number; trainings: number; signatures: number };
}

export function renderHseExpirySummaryEmail(params: HseExpirySummaryParams): RenderedEmail {
  const { companyName, today, windowDays, trainings, documents, pending } = params;
  const url = `${appUrl()}/dashboard/hse?tab=cumplimiento`;

  let body = sectionHeader(
    'Pendientes',
    `${pending.acknowledgements} documentos sin aceptar · ${pending.trainings} capacitaciones sin aprobar · ${pending.signatures} constancias sin firmar`
  );
  if (trainings.length > 0) {
    body += groupCardOpen(`Capacitaciones vencidas o que vencen en ${windowDays} días`, `${trainings.length}`);
    body += tableHeaderRow(['Legajo', 'Empleado', 'Capacitación', 'Vencimiento']);
    for (const row of trainings) {
      body += `
        <tr>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;font-family:monospace;">${escapeHtml(row.file ?? '—')}</td>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;">${escapeHtml(row.employee)}</td>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;">${escapeHtml(row.title)}</td>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;white-space:nowrap;">${formatDateAr(row.dueOn)}
            ${row.expired ? badge('Vencida', 'danger') : ''}</td>
        </tr>`;
    }
    body += groupCardClose;
  }
  if (documents.length > 0) {
    body += groupCardOpen(`Documentos HSE vencidos o que vencen en ${windowDays} días`, `${documents.length}`);
    body += tableHeaderRow(['Documento', 'Versión', 'Vencimiento']);
    for (const row of documents) {
      body += `
        <tr>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;">${escapeHtml(row.title)}</td>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;">v${row.version}</td>
          <td style="padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;white-space:nowrap;">${formatDateAr(row.dueOn)}
            ${row.expired ? badge('Vencido', 'danger') : ''}</td>
        </tr>`;
    }
    body += groupCardClose;
  }
  body += ctaBlock(url, 'Ver cumplimiento');

  const expired = trainings.filter((t) => t.expired).length + documents.filter((d) => d.expired).length;
  return {
    subject: `HSE: ${expired} vencidos y ${trainings.length + documents.length - expired} por vencer — ${companyName}`,
    html: renderEmailShell({
      companyName,
      title: 'Resumen semanal de HSE',
      subtitle: formatLongDateAr(today),
      badgeHtml: headerPill(`${expired} vencidos`),
      body,
    }),
    text: [
      `Resumen HSE de ${companyName} — ${formatDateAr(today)}`,
      `Pendientes: ${pending.acknowledgements} documentos sin aceptar, ${pending.trainings} capacitaciones sin aprobar, ${pending.signatures} constancias sin firmar.`,
      ...trainings.map(
        (t) =>
          `  - [${t.file ?? '—'}] ${t.employee} · ${t.title} · ${t.expired ? 'venció' : 'vence'} ${formatDateAr(t.dueOn)}`
      ),
      ...documents.map(
        (d) => `  - ${d.title} v${d.version} · ${d.expired ? 'venció' : 'vence'} ${formatDateAr(d.dueOn)}`
      ),
      `Ver: ${url}`,
    ].join('\n'),
  };
}
