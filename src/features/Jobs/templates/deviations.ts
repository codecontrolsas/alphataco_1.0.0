import {
  EQUIPMENT_CONDITION_LABELS,
  normalizeEquipmentCondition,
} from '@/features/Operaciones/PartesDiarios/lib/equipment-condition';
import {
  CONDITION_DEVIATION_KIND,
  DEVIATION_LABELS,
  type DeviationKind,
} from '@/features/Operaciones/PartesDiarios/lib/resource-deviations';
import {
  MAIL_COLORS as C,
  MAIL_RADIUS as R,
  appUrl,
  badge,
  ctaBlock,
  escapeHtml,
  groupCardClose,
  groupCardOpen,
  headerPill,
  renderEmailShell,
  tableHeaderRow,
  type MailTone,
} from '@/shared/lib/mail/shell';
import { formatLongDateAr } from '@/shared/lib/argentina-time';
import type { CustomerEquipmentInfo as CustomerEquipment, DailyReportDeviationsResult as DeviationsResult, EmployeeDeviation, EquipmentDeviation, RowWithDeviations } from '@/features/Operaciones/PartesDiarios/schemas/deviations';

/**
 * Correo de desvíos del parte diario. Portado de `supabase/functions/send-deviations-email`.
 *
 * Se conserva el comportamiento: agrupado por cliente (ordenado por nombre), tarjetas de
 * resumen arriba, una tabla de empleados y otra de equipos por fila del parte, y el botón al
 * parte. Lo que cambia: los tipos salen de Zod en vez de interfaces a mano, el logo remoto de
 * Supabase se fue (ver `shell.ts`), el encabezado lleva el nombre de la empresa y todo lo que
 * viene de la base se escapa.
 */
const ROLE_LABELS: Record<string, string> = {
  chofer_dia: 'Chofer Día',
  chofer_noche: 'Chofer Noche',
  ayudante_dia: 'Ayudante Día',
  ayudante_noche: 'Ayudante Noche',
  sin_rol: 'Sin rol',
};

/**
 * Tono de cada desvío: el mismo que usa la pantalla del parte (duplicado = naranja, no afectado = celeste,
 * sin diagrama / no operativo = rojo, día no laboral / en reparación = amarillo).
 */
const DEVIATION_TONES: Record<DeviationKind, MailTone> = {
  duplicated: 'expired',
  unassigned_to_client: 'info',
  no_diagram: 'danger',
  non_work_day: 'warn',
  not_operative: 'danger',
  under_repair: 'warn',
  conditioned: 'info',
  in_preparation: 'pending',
};

const TYPE_SERVICE_LABELS: Record<string, string> = {
  mensual: 'Mensual',
  adicional: 'Adicional',
  adicional_permanente: 'Adicional Permanente',
};

const STATUS_LABELS: Record<string, { label: string; tone: MailTone }> = {
  pendiente: { label: 'Pendiente', tone: 'warn' },
  sin_recursos_asignados: { label: 'Sin recursos', tone: 'danger' },
  ejecutado: { label: 'Ejecutado', tone: 'ok' },
  reprogramado: { label: 'Reprogramado', tone: 'info' },
  cancelado: { label: 'Cancelado', tone: 'danger' },
  en_certificacion: { label: 'En certificación', tone: 'cert' },
};

function deviationBadge(kind: DeviationKind, suffix = ''): string {
  return badge(`${DEVIATION_LABELS[kind]}${suffix}`, DEVIATION_TONES[kind]);
}

function employeeDeviationBadges(deviation: EmployeeDeviation): string {
  const badges: string[] = [];
  if (deviation.is_unassigned_to_client) badges.push(deviationBadge('unassigned_to_client'));
  if (deviation.has_no_diagram) badges.push(deviationBadge('no_diagram'));
  if (deviation.is_non_work_day) {
    const suffix = deviation.diagram_type_name ? ` (${deviation.diagram_type_name})` : '';
    badges.push(deviationBadge('non_work_day', suffix));
  }
  if (deviation.is_duplicated) badges.push(deviationBadge('duplicated'));
  return badges.join(' ');
}

/**
 * Los otros equipos (piletas, contenedores) no tienen patente: se los muestra por N° de serie
 * con el tipo al lado, para distinguirlos de un vehículo.
 */
function equipmentLabelCell(deviation: EquipmentDeviation): string {
  const label = deviation.equipment_label || deviation.equipment_domain || '—';
  if (!deviation.is_other_equipment || !deviation.equipment_type) return escapeHtml(label);
  return `${escapeHtml(label)} ${badge(deviation.equipment_type, 'pending')}`;
}

/**
 * En la mayoría de los otros equipos el N° de serie y el interno son el mismo string: se
 * omite para no repetir el dato en la misma fila.
 */
function equipmentInternCell(deviation: EquipmentDeviation): string {
  const intern = deviation.equipment_intern_number;
  if (!intern || intern === '—') return '—';
  if (intern === (deviation.equipment_label || deviation.equipment_domain)) return '—';
  return `#${escapeHtml(intern)}`;
}

function equipmentDeviationBadges(deviation: EquipmentDeviation): string {
  const badges: string[] = [];
  if (deviation.is_unassigned_to_client) badges.push(deviationBadge('unassigned_to_client'));
  if (deviation.condition) {
    const key = normalizeEquipmentCondition(deviation.condition);
    if (key !== 'operativo') {
      const kind = key === 'desconocido' ? null : CONDITION_DEVIATION_KIND[key];
      badges.push(kind ? deviationBadge(kind) : badge(EQUIPMENT_CONDITION_LABELS[key], 'pending'));
    }
  }
  if (deviation.is_duplicated) badges.push(deviationBadge('duplicated'));
  return badges.join(' ');
}

/** `HH:MM:SS` o `HH:MM` → `HH:MM`. */
function formatTime(time: string | null): string {
  if (!time) return '—';
  return escapeHtml(time.substring(0, 5));
}

function metadataItem(label: string, value: string): string {
  return `<span style="font-size:12px;color:${C.textMuted};">${escapeHtml(label)}: </span><span style="font-size:12px;color:${C.text};font-weight:500;">${escapeHtml(value)}</span>`;
}

function statusBadge(status: string | null): string {
  if (!status) return badge('—', 'pending');
  const mapped = STATUS_LABELS[status] ?? { label: status, tone: 'pending' as const };
  return badge(mapped.label, mapped.tone);
}

function summaryCards(summary: DeviationsResult['summary']): string {
  const cards = [
    { label: 'Rows con desvíos', value: summary.total_rows_with_deviations, color: C.expiredInk },
    { label: 'Desvíos Empleados', value: summary.total_employee_deviations, color: C.warnInk },
    { label: 'Desvíos Equipos', value: summary.total_equipment_deviations, color: C.dangerInk },
    { label: 'Empleados Duplicados', value: summary.total_duplicated_employees, color: C.certInk },
    { label: 'Equipos Duplicados', value: summary.total_duplicated_equipment, color: C.certInk },
  ];

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        ${cards
          .map(
            (card) => `
        <td align="center" style="padding:0 3px;">
          <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:${C.surfaceMuted};border:1px solid ${C.border};border-radius:${R.surface};">
            <tr>
              <td style="padding:12px 6px;text-align:center;">
                <p style="margin:0;font-size:24px;font-weight:800;color:${card.color};line-height:1;">${card.value}</p>
                <p style="margin:5px 0 0;font-size:10px;color:${C.textMuted};font-weight:600;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(card.label)}</p>
              </td>
            </tr>
          </table>
        </td>`
          )
          .join('')}
      </tr>
    </table>`;
}

function employeesTable(deviations: readonly EmployeeDeviation[]): string {
  if (deviations.length === 0) return '';
  const rows = deviations
    .map(
      (employee, index) => `
      <tr style="background:${index % 2 === 0 ? C.card : C.surfaceAlt};">
        <td style="padding:7px 10px;font-size:12px;color:${C.text};font-weight:500;border-bottom:1px solid ${C.border};">${escapeHtml(employee.employee_name)}</td>
        <td style="padding:7px 10px;font-size:12px;color:${C.textMuted};font-family:monospace;border-bottom:1px solid ${C.border};">${escapeHtml(employee.employee_cuil)}</td>
        <td style="padding:7px 10px;font-size:12px;color:${C.textMuted};border-bottom:1px solid ${C.border};">${escapeHtml(ROLE_LABELS[employee.role] ?? employee.role)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid ${C.border};">${employeeDeviationBadges(employee)}</td>
      </tr>`
    )
    .join('');

  return `
    <tr>
      <td style="padding:10px 18px 4px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px;">Empleados</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:${R.surface};overflow:hidden;">
          <thead>${tableHeaderRow(['Nombre', 'CUIL', 'Rol', 'Desvíos'])}</thead>
          <tbody>${rows}</tbody>
        </table>
      </td>
    </tr>`;
}

function equipmentTable(deviations: readonly EquipmentDeviation[]): string {
  if (deviations.length === 0) return '';
  const rows = deviations
    .map(
      (equipment, index) => `
      <tr style="background:${index % 2 === 0 ? C.card : C.surfaceAlt};">
        <td style="padding:7px 10px;font-size:12px;color:${C.text};font-weight:500;font-family:monospace;border-bottom:1px solid ${C.border};">${equipmentLabelCell(equipment)}</td>
        <td style="padding:7px 10px;font-size:12px;color:${C.textMuted};border-bottom:1px solid ${C.border};">${equipmentInternCell(equipment)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid ${C.border};">${equipmentDeviationBadges(equipment)}</td>
      </tr>`
    )
    .join('');

  return `
    <tr>
      <td style="padding:10px 18px 4px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px;">Equipos</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.border};border-radius:${R.surface};overflow:hidden;">
          <thead>${tableHeaderRow(['Equipo', 'N° Interno', 'Desvíos'])}</thead>
          <tbody>${rows}</tbody>
        </table>
      </td>
    </tr>`;
}

function reportRow(row: RowWithDeviations, index: number): string {
  const background = index % 2 === 0 ? C.card : C.surfaceMuted;
  const borderTop = index > 0 ? `border-top:1px solid ${C.border};` : '';
  const typeServiceLabel = TYPE_SERVICE_LABELS[row.type_service ?? ''] ?? row.type_service ?? '—';
  const customerEquipment = row.customer_equipment.filter((item: CustomerEquipment) => item.name !== '—');
  const customerEquipmentText =
    customerEquipment.length > 0
      ? customerEquipment.map((item) => `${item.name}${item.type !== '—' ? ` (${item.type})` : ''}`).join(', ')
      : null;

  return `
    <tr>
      <td style="background:${background};padding:0;${borderTop}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:10px 18px;background:${C.surfaceMuted};border-bottom:1px solid ${C.border};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0;font-size:13px;font-weight:600;color:${C.text};">${escapeHtml(row.service_name)}${row.item_name !== '—' ? ` &rsaquo; ${escapeHtml(row.item_name)}` : ''}</p>
                  </td>
                  <td align="right">
                    <span style="font-size:12px;color:${C.textMuted};">${formatTime(row.start_time)} &mdash; ${formatTime(row.end_time)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 18px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:2px 0;">${metadataItem('Jornada', row.working_day ?? '—')}</td>
                  <td style="padding:2px 0;">${metadataItem('Tipo', typeServiceLabel)}</td>
                  <td style="padding:2px 0;">${metadataItem('Estado', '')} ${statusBadge(row.status)}</td>
                </tr>
                <tr>
                  <td style="padding:2px 0;">${metadataItem('Sector', row.sector_name ?? '—')}</td>
                  <td style="padding:2px 0;" colspan="2">${metadataItem('Área', row.area_name ?? '—')}</td>
                </tr>
              </table>
              ${customerEquipmentText ? `<p style="margin:4px 0 0;font-size:12px;color:${C.textMuted};">Equipo cliente: <span style="color:${C.text};font-weight:500;">${escapeHtml(customerEquipmentText)}</span></p>` : ''}
              ${row.description ? `<p style="margin:4px 0 0;font-size:12px;color:${C.textMuted};">Descripción: <span style="color:${C.textMuted};font-style:italic;">${escapeHtml(row.description)}</span></p>` : ''}
            </td>
          </tr>
          ${employeesTable(row.employee_deviations)}
          ${equipmentTable(row.equipment_deviations)}
          <tr><td style="padding:6px 0;"></td></tr>
        </table>
      </td>
    </tr>`;
}

export interface DeviationsEmailParams {
  companyName: string;
  reportDate: string;
  dailyReportId: string;
  data: DeviationsResult;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderDeviationsEmail(params: DeviationsEmailParams): RenderedEmail {
  const { data, companyName, reportDate, dailyReportId } = params;
  const { summary } = data;

  const totalIssues =
    summary.total_employee_deviations +
    summary.total_equipment_deviations +
    summary.total_duplicated_employees +
    summary.total_duplicated_equipment;

  const viewUrl = `${appUrl()}/dashboard/operations/${dailyReportId}`;

  // Agrupado por cliente, ordenado por nombre — igual que la edge function.
  const groups = new Map<string, { customerName: string; rows: RowWithDeviations[] }>();
  for (const row of data.rows_with_deviations) {
    const key = row.customer_id ?? row.customer_name;
    const group = groups.get(key) ?? { customerName: row.customer_name, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const orderedGroups = Array.from(groups.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));

  const body = [
    summaryCards(summary),
    ...orderedGroups.map(
      (group) =>
        groupCardOpen(group.customerName, `${group.rows.length} row${group.rows.length !== 1 ? 's' : ''} con desvíos`) +
        group.rows.map(reportRow).join('') +
        groupCardClose
    ),
    ctaBlock(viewUrl, 'Ver Parte Diario'),
  ].join('');

  return {
    subject: `Desvíos del Parte Diario — ${companyName} — ${reportDate}`,
    html: renderEmailShell({
      companyName,
      title: 'Reporte de Desvíos — Parte Diario',
      subtitle: formatLongDateAr(reportDate),
      badgeHtml: headerPill(`${totalIssues} desvío${totalIssues !== 1 ? 's' : ''}`),
      body,
    }),
    text: [
      `Desvíos del parte diario de ${companyName} — ${reportDate}`,
      `${summary.total_rows_with_deviations} fila(s) con desvíos, ${totalIssues} desvío(s) en total.`,
      `Empleados: ${summary.total_employee_deviations} · Equipos: ${summary.total_equipment_deviations}`,
      `Duplicados — empleados: ${summary.total_duplicated_employees} · equipos: ${summary.total_duplicated_equipment}`,
      `Ver el parte: ${viewUrl}`,
    ].join('\n'),
  };
}
