import { formatDateAr, formatLongDateAr } from '@/shared/lib/argentina-time';
import {
  MAIL_COLORS as C,
  appUrl,
  ctaBlock,
  escapeHtml,
  groupCardClose,
  groupCardOpen,
  headerPill,
  renderEmailShell,
  tableHeaderRow,
} from '@/shared/lib/mail/shell';
import type { ThresholdItem } from '../lib/documents-threshold.server';
import type { RenderedEmail } from './deviations';

const cell = `padding:8px 12px;border-top:1px solid ${C.border};font-size:13px;`;

function whenText(days: number): string {
  return days === 1 ? 'mañana' : `en ${days} días`;
}

/** Mail del aviso diario: documentos que vencen exactamente en `days` días. */
export function renderDocumentsThresholdEmail(params: {
  companyName: string;
  today: string;
  days: number;
  items: readonly ThresholdItem[];
}): RenderedEmail {
  const { companyName, today, days, items } = params;
  const url = `${appUrl()}/dashboard/document?tab=cumplimiento-por-cliente&subtab=calendario`;
  let rows = tableHeaderRow(['Documento', 'De', 'Vence']);
  for (const item of items) {
    rows += `
      <tr>
        <td style="${cell}">${escapeHtml(item.typeName)}</td>
        <td style="${cell}">${escapeHtml(item.resourceLabel)}
          <span style="color:${C.textMuted};font-size:11px;"> ${item.kind === 'Persona' ? 'Persona' : 'Equipo'}</span></td>
        <td style="${cell}white-space:nowrap;">${formatDateAr(item.validity)}</td>
      </tr>`;
  }
  const count = `${items.length} ${items.length === 1 ? 'documento' : 'documentos'}`;
  const body =
    `<p style="margin:0 0 16px;font-size:14px;">Estos documentos vencen ${whenText(days)}. Renovalos antes para no quedar fuera de servicio.</p>` +
    groupCardOpen(`Vencen ${whenText(days)}`, `${items.length}`) +
    rows +
    groupCardClose +
    ctaBlock(url, 'Ver el calendario de vencimientos');
  return {
    subject: `${count} ${items.length === 1 ? 'vence' : 'vencen'} ${whenText(days)} — ${companyName}`,
    html: renderEmailShell({
      companyName,
      title: 'Documentos por vencer',
      subtitle: formatLongDateAr(today),
      badgeHtml: headerPill(count),
      body,
    }),
    text: [
      `Estos documentos vencen ${whenText(days)}:`,
      ...items.map((i) => `  - ${i.typeName} · ${i.resourceLabel} · vence el ${formatDateAr(i.validity)}`),
      '',
      `Calendario de vencimientos: ${url}`,
    ].join('\n'),
  };
}
