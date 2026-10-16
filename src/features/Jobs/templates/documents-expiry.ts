import {
  MAIL_COLORS as C,
  MAIL_TONES,
  MAIL_RADIUS as R,
  appUrl,
  ctaBlock,
  escapeHtml,
  groupCardClose,
  groupCardOpen,
  headerPill,
  renderEmailShell,
  sectionHeader,
  tableHeaderRow,
  type MailTone,
} from '@/shared/lib/mail/shell';
import { formatDateAr, formatLongDateAr } from '../lib/dates';
import type {
  ExpiringCompanyItem,
  ExpiringEmployeeItem,
  ExpiringEquipmentItem,
  ExpirySummary,
} from '../schemas/documents-expiry';
import type { RenderedEmail } from './deviations';

/**
 * Resumen semanal de documentos. Portado de
 * `supabase/functions/send-documents-expiry-email`.
 *
 * Se conserva el comportamiento: tres tarjetas (por vencer / vencidos / pendientes) con
 * mini-enlaces por recurso que abren la tabla ya filtrada, el detalle de los que vencen en la
 * ventana, y el hero "Todo al día" cuando no hay nada. Lo que cambia: los tipos salen de Zod,
 * el logo remoto de Supabase se fue, el encabezado lleva el nombre de la empresa, y las URLs
 * se arman sobre `NEXT_PUBLIC_BASE_URL` en vez del dominio hardcodeado que traia el original.
 */

// IDs de tabla y subtab de las tablas permanentes en /dashboard/document.
const TAB_EMP = 'documentos-de-empleados';
const TAB_EQ = 'documentos-de-equipos';
const TAB_CO = 'documentos-de-empresa';
const SUBTAB_EMP = 'empleados-permanentes';
const SUBTAB_EQ = 'equipos-permanentes';
const SUBTAB_CO = 'empresa-permanentes';
const TABLE_ID_EMP = 'employee-permanent-docs';
const TABLE_ID_EQ = 'equipment-permanent-docs';
const TABLE_ID_CO = 'company-docs-permanentes';

// Las tablas de empresa usan 'documentType' (camelCase); las de empleados/equipos,
// 'document_type'.
const COL_DT_EMP = 'document_type';
const COL_DT_EQ = 'document_type';
const COL_DT_CO = 'documentType';

function buildDocUrl(tab: string, subtab: string, extraParams: Record<string, string>): string {
  const params = new URLSearchParams({ tab, subtab, ...extraParams });
  return `${appUrl()}/dashboard/document?${params.toString()}`;
}

function urlExpiringTable(tab: string, subtab: string, tableId: string, fromIso: string, toIso: string): string {
  return buildDocUrl(tab, subtab, {
    [`${tableId}__validity_from`]: fromIso,
    [`${tableId}__validity_to`]: toIso,
  });
}

function urlExpiredTable(tab: string, subtab: string, tableId: string, todayIso: string): string {
  return buildDocUrl(tab, subtab, { [`${tableId}__validity_to`]: todayIso });
}

function urlPendingTable(tab: string, subtab: string, tableId: string): string {
  return buildDocUrl(tab, subtab, { [`${tableId}__state`]: 'pendiente' });
}

function urlEmployeeDetailDocs(employeeId: string, documentTypeId: string): string {
  const params = new URLSearchParams({
    action: 'view',
    employee_id: employeeId,
    tab: 'documents',
    [`${TABLE_ID_EMP}__${COL_DT_EMP}`]: documentTypeId,
  });
  return `${appUrl()}/dashboard/employee/action?${params.toString()}`;
}

function urlEquipmentDetailDocs(vehicleId: string, documentTypeId: string): string {
  const params = new URLSearchParams({
    action: 'view',
    id: vehicleId,
    tab: 'documents',
    [`${TABLE_ID_EQ}__${COL_DT_EQ}`]: documentTypeId,
  });
  return `${appUrl()}/dashboard/equipment/action?${params.toString()}`;
}

/** `documents_company.validity` es texto sin filtro de rango: se filtra por tipo de documento. */
function urlCompanyDocFiltered(documentTypeIds: readonly string[]): string {
  if (documentTypeIds.length === 0) return buildDocUrl(TAB_CO, SUBTAB_CO, {});
  return buildDocUrl(TAB_CO, SUBTAB_CO, { [`${TABLE_ID_CO}__${COL_DT_CO}`]: documentTypeIds.join(',') });
}

function urlDashboardRoot(): string {
  return `${appUrl()}/dashboard/document`;
}

function expiryChip(daysRemaining: number): string {
  let tone: MailTone;
  let label: string;

  if (daysRemaining < 0) {
    tone = 'danger';
    label = `vencido hace ${Math.abs(daysRemaining)}d`;
  } else if (daysRemaining === 0) {
    tone = 'danger';
    label = 'hoy';
  } else if (daysRemaining === 1) {
    tone = 'danger';
    label = 'mañana';
  } else if (daysRemaining <= 3) {
    tone = 'expired';
    label = `en ${daysRemaining} días`;
  } else {
    tone = 'warn';
    label = `en ${daysRemaining} días`;
  }

  const { bg, fg } = MAIL_TONES[tone];
  return `<span style="display:inline-block;background:${bg};color:${fg};padding:2px 8px;border-radius:${R.pill};font-size:11px;font-weight:600;white-space:nowrap;line-height:1.4;margin-left:6px;">${escapeHtml(label)}</span>`;
}

interface SummaryCTA {
  label: string;
  href: string | null;
}

function summaryCardDistributed(options: {
  value: number;
  label: string;
  color: string;
  ctas: readonly SummaryCTA[];
  fallbackText: string;
}): string {
  const visibleCtas = options.ctas.filter((cta) => cta.href !== null);

  const ctaBlockHtml =
    visibleCtas.length === 0
      ? `<p style="margin:8px 0 0;font-size:11px;font-weight:500;color:${options.color};line-height:1.4;">${escapeHtml(options.fallbackText)}</p>`
      : visibleCtas
          .map(
            (cta) =>
              `<a href="${escapeHtml(cta.href ?? '')}" style="display:block;margin-top:6px;font-size:11px;font-weight:600;color:${options.color};text-decoration:underline;line-height:1.3;">${escapeHtml(cta.label)} &rsaquo;</a>`
          )
          .join('');

  return `
    <td align="center" valign="top" style="padding:0 4px;width:33.33%;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${C.surfaceMuted};border:1px solid ${C.border};border-radius:${R.surface};">
        <tr>
          <td style="padding:14px 10px;text-align:center;">
            <p style="margin:0;font-size:28px;font-weight:800;color:${options.color};line-height:1;">${options.value.toLocaleString('es-AR')}</p>
            <p style="margin:6px 0 0;font-size:10px;color:${C.textMuted};font-weight:600;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(options.label)}</p>
            ${ctaBlockHtml}
          </td>
        </tr>
      </table>
    </td>`;
}

function employeesGroup(group: { total: number; detail: readonly ExpiringEmployeeItem[] }): string {
  if (group.total === 0) return '';
  const rows = group.detail
    .map(
      (item, index) => `
      <tr style="background:${index % 2 === 0 ? C.card : C.surfaceAlt};">
        <td style="padding:7px 10px;font-size:12px;color:${C.textMuted};font-family:monospace;border-bottom:1px solid ${C.border};">[${escapeHtml(item.file_number)}]</td>
        <td style="padding:7px 10px;font-size:12px;border-bottom:1px solid ${C.border};"><a href="${escapeHtml(urlEmployeeDetailDocs(item.employee_id, item.document_type_id))}" style="color:${C.text};font-weight:500;text-decoration:underline;">${escapeHtml(item.employee_name)}</a></td>
        <td style="padding:7px 10px;font-size:12px;color:${C.textMuted};border-bottom:1px solid ${C.border};">${escapeHtml(item.document_type_name)}</td>
        <td style="padding:7px 10px;font-size:12px;color:${C.text};border-bottom:1px solid ${C.border};white-space:nowrap;">${escapeHtml(formatDateAr(item.validity))}${expiryChip(item.days_remaining)}</td>
      </tr>`
    )
    .join('');

  return (
    groupCardOpen(
      `Empleados · ${group.total} documento${group.total !== 1 ? 's' : ''}`,
      'por vencer en los próximos 7 días'
    ) +
    `<tr><td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:${R.surface};overflow:hidden;">
        <thead>${tableHeaderRow(['Legajo', 'Empleado', 'Documento', 'Vence'])}</thead>
        <tbody>${rows}</tbody>
      </table>
    </td></tr>` +
    groupCardClose
  );
}

function equipmentGroup(group: { total: number; detail: readonly ExpiringEquipmentItem[] }): string {
  if (group.total === 0) return '';
  const rows = group.detail
    .map(
      (item, index) => `
      <tr style="background:${index % 2 === 0 ? C.card : C.surfaceAlt};">
        <td style="padding:7px 10px;font-size:12px;font-weight:500;font-family:monospace;border-bottom:1px solid ${C.border};"><a href="${escapeHtml(urlEquipmentDetailDocs(item.vehicle_id, item.document_type_id))}" style="color:${C.text};text-decoration:underline;">${escapeHtml(item.domain)}</a></td>
        <td style="padding:7px 10px;font-size:12px;color:${C.textMuted};border-bottom:1px solid ${C.border};">#${escapeHtml(item.intern_number)}</td>
        <td style="padding:7px 10px;font-size:12px;color:${C.textMuted};border-bottom:1px solid ${C.border};">${escapeHtml(item.document_type_name)}</td>
        <td style="padding:7px 10px;font-size:12px;color:${C.text};border-bottom:1px solid ${C.border};white-space:nowrap;">${escapeHtml(formatDateAr(item.validity))}${expiryChip(item.days_remaining)}</td>
      </tr>`
    )
    .join('');

  return (
    groupCardOpen(
      `Equipos · ${group.total} documento${group.total !== 1 ? 's' : ''}`,
      'por vencer en los próximos 7 días'
    ) +
    `<tr><td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:${R.surface};overflow:hidden;">
        <thead>${tableHeaderRow(['Dominio', 'Nº Int.', 'Documento', 'Vence'])}</thead>
        <tbody>${rows}</tbody>
      </table>
    </td></tr>` +
    groupCardClose
  );
}

function companyGroup(group: { total: number; detail: readonly ExpiringCompanyItem[] }): string {
  if (group.total === 0) return '';
  const rows = group.detail
    .map(
      (item, index) => `
      <tr style="background:${index % 2 === 0 ? C.card : C.surfaceAlt};">
        <td style="padding:7px 10px;font-size:12px;font-weight:500;border-bottom:1px solid ${C.border};"><a href="${escapeHtml(urlCompanyDocFiltered([item.document_type_id]))}" style="color:${C.text};text-decoration:underline;">${escapeHtml(item.document_type_name)}</a></td>
        <td style="padding:7px 10px;font-size:12px;color:${C.text};border-bottom:1px solid ${C.border};white-space:nowrap;">${escapeHtml(formatDateAr(item.validity))}${expiryChip(item.days_remaining)}</td>
      </tr>`
    )
    .join('');

  return (
    groupCardOpen(
      `Empresa · ${group.total} documento${group.total !== 1 ? 's' : ''}`,
      'por vencer en los próximos 7 días'
    ) +
    `<tr><td style="padding:14px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:${R.surface};overflow:hidden;">
        <thead>${tableHeaderRow(['Documento', 'Vence'])}</thead>
        <tbody>${rows}</tbody>
      </table>
    </td></tr>` +
    groupCardClose
  );
}

function heroAllClear(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding:32px 0 8px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:420px;width:100%;background:${C.okSubtle};border:1px solid ${C.ok};border-radius:${R.surface};">
            <tr>
              <td style="padding:32px 28px;text-align:center;">
                <div style="font-size:56px;line-height:1;color:${C.ok};margin-bottom:8px;">&#10003;</div>
                <p style="margin:0;font-size:18px;font-weight:700;color:${C.okInk};">Todo al d&iacute;a</p>
                <p style="margin:8px 0 0;font-size:13px;color:${C.okInk};line-height:1.5;">
                  No hay documentos vencidos, por vencer ni faltantes esta semana.<br>
                  Buen trabajo del equipo de control documental.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;
}

export interface DocumentsExpiryEmailParams {
  companyName: string;
  data: ExpirySummary;
}

export function renderDocumentsExpiryEmail(params: DocumentsExpiryEmailParams): RenderedEmail {
  const { data, companyName } = params;
  const fromIso = data.today;
  const toIso = data.window_end;
  const expiring = data.expiring_soon;

  const totalExpiringSoon = expiring.employees.total + expiring.equipment.total + expiring.company.total;
  const totalExpired = data.expired_counts.employees + data.expired_counts.equipment + data.expired_counts.company;
  const totalPending = data.pending_counts.employees + data.pending_counts.equipment + data.pending_counts.company;
  const isAllClear = totalExpiringSoon === 0 && totalExpired === 0 && totalPending === 0;

  const expiringCtas: SummaryCTA[] = [
    {
      label: `Empleados (${expiring.employees.total})`,
      href: expiring.employees.total > 0 ? urlExpiringTable(TAB_EMP, SUBTAB_EMP, TABLE_ID_EMP, fromIso, toIso) : null,
    },
    {
      label: `Equipos (${expiring.equipment.total})`,
      href: expiring.equipment.total > 0 ? urlExpiringTable(TAB_EQ, SUBTAB_EQ, TABLE_ID_EQ, fromIso, toIso) : null,
    },
    {
      label: `Empresa (${expiring.company.total})`,
      href:
        expiring.company.total > 0
          ? urlCompanyDocFiltered(Array.from(new Set(expiring.company.detail.map((item) => item.document_type_id))))
          : null,
    },
  ];

  const expiredCtas: SummaryCTA[] = [
    {
      label: `Empleados (${data.expired_counts.employees})`,
      href: data.expired_counts.employees > 0 ? urlExpiredTable(TAB_EMP, SUBTAB_EMP, TABLE_ID_EMP, fromIso) : null,
    },
    {
      label: `Equipos (${data.expired_counts.equipment})`,
      href: data.expired_counts.equipment > 0 ? urlExpiredTable(TAB_EQ, SUBTAB_EQ, TABLE_ID_EQ, fromIso) : null,
    },
    {
      label: `Empresa (${data.expired_counts.company})`,
      href: data.expired_counts.company > 0 ? urlCompanyDocFiltered(data.expired_doc_type_ids.company) : null,
    },
  ];

  const pendingCtas: SummaryCTA[] = [
    {
      label: `Empleados (${data.pending_counts.employees})`,
      href: data.pending_counts.employees > 0 ? urlPendingTable(TAB_EMP, SUBTAB_EMP, TABLE_ID_EMP) : null,
    },
    {
      label: `Equipos (${data.pending_counts.equipment})`,
      href: data.pending_counts.equipment > 0 ? urlPendingTable(TAB_EQ, SUBTAB_EQ, TABLE_ID_EQ) : null,
    },
    {
      label: `Empresa (${data.pending_counts.company})`,
      href: data.pending_counts.company > 0 ? urlPendingTable(TAB_CO, SUBTAB_CO, TABLE_ID_CO) : null,
    },
  ];

  let bodyInner = '';

  if (isAllClear) {
    bodyInner = heroAllClear();
  } else {
    bodyInner += `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
        <tr>
          ${summaryCardDistributed({ value: totalExpiringSoon, label: `Por vencer en ${data.days_ahead} días`, color: C.expiredInk, ctas: expiringCtas, fallbackText: 'Sin documentos' })}
          ${summaryCardDistributed({ value: totalExpired, label: 'Vencidos', color: C.dangerInk, ctas: expiredCtas, fallbackText: 'Sin documentos' })}
          ${summaryCardDistributed({ value: totalPending, label: 'Faltantes (sin cargar)', color: C.warnInk, ctas: pendingCtas, fallbackText: 'Sin documentos' })}
        </tr>
      </table>`;

    if (totalExpiringSoon > 0) {
      bodyInner += sectionHeader(
        'Documentos por vencer en los próximos 7 días',
        `${totalExpiringSoon} documento${totalExpiringSoon !== 1 ? 's' : ''} requiere${totalExpiringSoon !== 1 ? 'n' : ''} atención`
      );
      bodyInner += employeesGroup(expiring.employees);
      bodyInner += equipmentGroup(expiring.equipment);
      bodyInner += companyGroup(expiring.company);
    }
  }

  const badgeHtml = isAllClear ? headerPill('Todo al d&iacute;a', 'ok') : headerPill(`${totalExpiringSoon} por vencer`);

  return {
    subject: `Resumen semanal de documentos — ${companyName} — ${formatLongDateAr(data.today)}`,
    html: renderEmailShell({
      companyName,
      title: 'Resumen Semanal de Documentos',
      subtitle: formatLongDateAr(data.today),
      badgeHtml,
      body: bodyInner + ctaBlock(urlDashboardRoot(), 'Ver tablero de documentos'),
    }),
    text: [
      `Resumen semanal de documentos de ${companyName} — ${formatDateAr(data.today)}`,
      `Por vencer en ${data.days_ahead} días: ${totalExpiringSoon}`,
      `Vencidos: ${totalExpired}`,
      `Faltantes (sin cargar): ${totalPending}`,
      `Ver el tablero: ${urlDashboardRoot()}`,
    ].join('\n'),
  };
}
