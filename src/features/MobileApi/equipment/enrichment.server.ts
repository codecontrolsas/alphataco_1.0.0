import 'server-only';

import { arToday, daysUntil } from '@/features/Documentacion/shared/compliance/dates';
import { EXPIRING_SOON_DAYS } from '@/features/Documentacion/shared/lib/document-expiry';
import { getStatusUi, type StatusTone } from '@/features/Mantenimiento/lib/status-presentation';
import type { Prisma } from '@/generated/prisma/client';
import { runInTenantScope, type TenantContext } from '@/shared/lib/tenant-context';
import moment from 'moment';
import { loadMobileDocumentRows } from '../documents/queries.server';
import type { EmployeeAccess } from '../employees/access';
import { hasAlert, loadEmployeeDocumentCounts, type DocumentCounts } from '../employees/document-summary.server';
import { argentinaDateTime, type Tone } from '../lib/labels';
import type { EquipmentAccess } from './access';

/**
 * Datos de Equipos agregados en la revisión 2 para la lista y la ficha: resumen documental, chofer y mantenimiento.
 * Todos se piden para la página completa (nunca por equipo) y cada uno solo viaja si el rol puede ver su fuente.
 */

const EMPTY_COUNTS = (): DocumentCounts => ({ valid: 0, expiring: 0, expired: 0, missing: 0, rejected: 0 });

// ─── Resumen documental ───────────────────────────────────────────────────────

/**
 * Vehículos: conteo por vehículo ACTIVO con el motor de cumplimiento de la web (permanentes y mensuales según
 * permisos; privados solo con `view_private`). null = el rol no ve la lista de documentos de equipos.
 */
export async function loadVehicleDocumentCounts(
  ctx: TenantContext,
  access: EquipmentAccess
): Promise<Map<string, DocumentCounts> | null> {
  const { permanent, monthly, privateTypes } = access.vehicle.documentList;
  if (!permanent && !monthly) return null;
  const periods = [...(permanent ? [false] : []), ...(monthly ? [true] : [])];
  const rows = await runInTenantScope(ctx, async () =>
    (
      await Promise.all(
        periods.map((isMonthly) =>
          loadMobileDocumentRows(ctx, { resource: 'equipment', monthly: isMonthly, privateTypes }, '')
        )
      )
    ).flat()
  );
  const counts = new Map<string, DocumentCounts>();
  for (const row of rows) {
    const entry = counts.get(row.resource.id) ?? EMPTY_COUNTS();
    entry[row.status] += 1;
    counts.set(row.resource.id, entry);
  }
  return counts;
}

export const documentCountsOrEmpty = (counts: Map<string, DocumentCounts>, id: string) =>
  counts.get(id) ?? EMPTY_COUNTS();

/** Equipamiento: sus documentos son las certificaciones (`other_equipment_certifications`); sin vencimiento = vigente. */
export async function loadOtherCertificationCounts(tx: Prisma.TransactionClient, companyId: string, ids: string[]) {
  const counts = new Map<string, DocumentCounts>();
  if (ids.length === 0) return counts;
  const rows = await tx.other_equipment_certifications.findMany({
    where: { equipment_id: { in: ids }, company_id: companyId },
    select: { equipment_id: true, expiration_date: true },
  });
  const today = arToday();
  for (const row of rows) {
    const entry = counts.get(row.equipment_id) ?? EMPTY_COUNTS();
    const expiration = row.expiration_date ? moment.utc(row.expiration_date).format('YYYY-MM-DD') : null;
    const days = expiration ? daysUntil(expiration, today) : null;
    if (days === null) entry.valid += 1;
    else if (days < 0) entry.expired += 1;
    else if (days <= EXPIRING_SOON_DAYS) entry.expiring += 1;
    else entry.valid += 1;
    counts.set(row.equipment_id, entry);
  }
  return counts;
}

// ─── Chofer ───────────────────────────────────────────────────────────────────

const DRIVER_FRESH_DAYS = 7;

export interface DriverInfo {
  id: string;
  fileNumber: string;
  name: string;
  /** Fecha del último parte en que figura como chofer de este equipo. */
  lastDate: string;
  /** El chofer tiene documentos vencidos, por vencer, rechazados o faltantes. null = el rol no ve sus documentos. */
  alert: boolean | null;
}

/**
 * No hay un chofer fijo por equipo en la base: se deriva de los partes diarios. Es el empleado cargado como chofer
 * (día, y si no noche) de la línea más reciente de los últimos 7 días en la que figura el equipo (sin líneas
 * canceladas ni reprogramadas). Requiere poder ver los partes diarios.
 */
export async function loadDrivers(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  vehicleIds: string[],
  employees: EmployeeAccess
): Promise<Map<string, DriverInfo>> {
  const result = new Map<string, DriverInfo>();
  if (vehicleIds.length === 0) return result;
  const today = moment.utc(arToday());
  const relations = await tx.dailyreportequipmentrelations.findMany({
    where: {
      equipment_id: { in: vehicleIds },
      company_id: ctx.companyId,
      dailyreportrows: {
        status: { notIn: ['cancelado', 'reprogramado'] },
        dailyreport: {
          company_id: ctx.companyId,
          date: { gte: today.clone().subtract(DRIVER_FRESH_DAYS, 'days').toDate(), lte: today.toDate() },
        },
        dailyreportemployeerelations: { some: { role: { in: ['chofer_dia', 'chofer_noche'] } } },
      },
    },
    select: {
      equipment_id: true,
      dailyreportrows: {
        select: {
          dailyreport: { select: { date: true } },
          dailyreportemployeerelations: {
            where: { role: { in: ['chofer_dia', 'chofer_noche'] } },
            select: { role: true, employees: { select: { id: true, file: true, firstname: true, lastname: true } } },
          },
        },
      },
    },
  });

  const best = new Map<string, { date: string; employee: { id: string; file: string; name: string } }>();
  for (const relation of relations) {
    const row = relation.dailyreportrows;
    if (!relation.equipment_id || !row?.dailyreport) continue;
    const date = moment.utc(row.dailyreport.date).format('YYYY-MM-DD');
    const drivers = [...row.dailyreportemployeerelations].sort((a, b) => (a.role === 'chofer_dia' ? -1 : b.role === 'chofer_dia' ? 1 : 0));
    const driver = drivers.find((item) => item.employees)?.employees;
    if (!driver) continue;
    const current = best.get(relation.equipment_id);
    if (!current || date > current.date) {
      best.set(relation.equipment_id, {
        date,
        employee: { id: driver.id, file: driver.file, name: `${driver.lastname} ${driver.firstname}` },
      });
    }
  }

  const counts = best.size > 0 ? await loadEmployeeDocumentCounts(ctx, employees) : null;
  for (const [equipmentId, item] of best) {
    result.set(equipmentId, {
      id: item.employee.id,
      fileNumber: item.employee.file,
      name: item.employee.name,
      lastDate: item.date,
      alert: counts ? hasAlert(counts.get(item.employee.id) ?? EMPTY_COUNTS()) : null,
    });
  }
  return result;
}

// ─── Mantenimiento ────────────────────────────────────────────────────────────

const TONE_OF: Record<StatusTone, Tone> = {
  ok: 'ok',
  warn: 'warn',
  danger: 'danger',
  neutral: 'neutral',
  pending: 'neutral',
  brand: 'neutral',
  info: 'neutral',
};

/** Mismo texto y tono que el circuito de taller de la web (`status-presentation.ts`). */
const orderStatus = (status: string) => {
  const ui = getStatusUi('order', status);
  return { code: status, label: ui.label, tone: TONE_OF[ui.tone] };
};

export interface MaintenanceInfo {
  nextService: {
    orderId: string;
    orderNumber: string | null;
    date: string;
    status: { code: string; label: string; tone: Tone };
  } | null;
  lastOrder: {
    orderId: string;
    orderNumber: string | null;
    createdAt: string;
    status: { code: string; label: string; tone: Tone };
    description: string | null;
  } | null;
}

type OrderRow = {
  equipment_id: string;
  id: string;
  order_number: string | null;
  status: string;
  description: string | null;
  scheduled: string | null;
  created_at: Date | null;
};

/**
 * Próximo service = la orden abierta (ni completada ni rechazada) con la fecha programada más cercana desde hoy;
 * no hay un plan de services por kilometraje en la base. Última orden = la más recientemente creada, en cualquier
 * estado. Dos consultas para todos los vehículos de la página.
 */
export async function loadMaintenance(tx: Prisma.TransactionClient, companyId: string, vehicleIds: string[]) {
  const result = new Map<string, MaintenanceInfo>();
  if (vehicleIds.length === 0) return result;
  const today = arToday();
  const [lastRows, nextRows] = await Promise.all([
    tx.$queryRaw<OrderRow[]>`
      SELECT DISTINCT ON (equipment_id)
        equipment_id::text AS equipment_id, id::text AS id, order_number, status, description,
        to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled, created_at
      FROM maintenance_orders
      WHERE equipment_id = ANY(${vehicleIds}::uuid[]) AND company_id = ${companyId}::uuid
      ORDER BY equipment_id, created_at DESC NULLS LAST`,
    tx.$queryRaw<OrderRow[]>`
      SELECT DISTINCT ON (equipment_id)
        equipment_id::text AS equipment_id, id::text AS id, order_number, status, description,
        to_char(scheduled_date, 'YYYY-MM-DD') AS scheduled, created_at
      FROM maintenance_orders
      WHERE equipment_id = ANY(${vehicleIds}::uuid[]) AND company_id = ${companyId}::uuid
        AND status NOT IN ('completed', 'rejected') AND scheduled_date >= ${today}::date
      ORDER BY equipment_id, scheduled_date ASC, created_at ASC`,
  ]);
  for (const id of vehicleIds) result.set(id, { nextService: null, lastOrder: null });
  for (const row of lastRows) {
    result.get(row.equipment_id)!.lastOrder = {
      orderId: row.id,
      orderNumber: row.order_number,
      createdAt: row.created_at ? argentinaDateTime(row.created_at) : '',
      status: orderStatus(row.status),
      description: row.description,
    };
  }
  for (const row of nextRows) {
    if (!row.scheduled) continue;
    result.get(row.equipment_id)!.nextService = {
      orderId: row.id,
      orderNumber: row.order_number,
      date: row.scheduled,
      status: orderStatus(row.status),
    };
  }
  return result;
}
