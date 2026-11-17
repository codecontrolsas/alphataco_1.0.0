import 'server-only';

import { loadEmployeeDocumentRows } from '@/features/Documentacion/DocumentosEmpleados/lib/employee-document-rows.server';
import { loadEquipmentDocumentRows } from '@/features/Documentacion/DocumentosEquipos/lib/equipment-document-rows.server';
import type { DocumentListTab } from '@/features/Documentacion/lists-shared/document-list-types';
import { arToday, parseValidity } from '@/features/Documentacion/shared/compliance/dates';
import { checkMultiplePermissionsServer } from '@/features/Permissions/actions/permissions.server';
import { employeeLabel, vehicleLabel } from '@/shared/lib/resource-labels';
import { getActiveCompanyId } from '@/shared/lib/tenant';

/**
 * «Mis pendientes» y calendario de vencimientos: las filas de las cuatro listas de documentos (personal y equipos,
 * permanentes y mensuales), calculadas por el mismo motor y con los mismos permisos que esas listas.
 */

/** Orden de urgencia: vencido, rechazado, faltante, por vencer. */
export const URGENCY_ORDER = ['expired', 'rejected', 'missing', 'expiring'] as const;
export type Urgency = (typeof URGENCY_ORDER)[number];

/** Días hacia adelante que muestra el calendario. */
export const CALENDAR_DAYS = 90;

interface Source {
  tab: DocumentListTab;
  parentTab: 'documentos-de-empleados' | 'documentos-de-equipos';
  kind: 'Persona' | 'Equipos';
  monthly: boolean;
}

const SOURCES: Source[] = [
  { tab: 'docs-empleados-permanentes', parentTab: 'documentos-de-empleados', kind: 'Persona', monthly: false },
  { tab: 'docs-empleados-mensuales', parentTab: 'documentos-de-empleados', kind: 'Persona', monthly: true },
  { tab: 'docs-equipos-permanentes', parentTab: 'documentos-de-equipos', kind: 'Equipos', monthly: false },
  { tab: 'docs-equipos-mensuales', parentTab: 'documentos-de-equipos', kind: 'Equipos', monthly: true },
];

export interface DocumentItem {
  /** Id del documento, o `missing:...` si falta cargarlo. */
  id: string;
  kind: 'Persona' | 'Equipos';
  /** Subtab de la lista de origen (permiso para ver el detalle y subir). */
  tab: DocumentListTab;
  parentTab: Source['parentTab'];
  resourceId: string;
  resourceLabel: string;
  typeId: string;
  typeName: string;
  isPrivate: boolean;
  /** Estado de la fila (`pendiente` = faltante). */
  state: string;
  urgency: Urgency | null;
  /** Vencimiento `YYYY-MM-DD`. */
  validity: string | null;
  period: string | null;
  denyReason: string | null;
}

function urgencyOf(state: string, expiringSoon: boolean): Urgency | null {
  if (state === 'vencido') return 'expired';
  if (state === 'rechazado') return 'rejected';
  if (state === 'pendiente') return 'missing';
  if (expiringSoon) return 'expiring';
  return null;
}

/** Todas las filas que el usuario puede ver, una lista detrás de otra (no satura el pool de conexiones). */
async function loadVisibleItems(): Promise<{ today: string; items: DocumentItem[]; visibleTabs: DocumentListTab[] }> {
  const companyId = await getActiveCompanyId();
  const granted = await checkMultiplePermissionsServer([
    ...SOURCES.map((s) => ({ moduleSlug: 'documentacion', tabSlug: s.tab, actionSlug: 'view' })),
    { moduleSlug: 'documentacion', tabSlug: 'documentos-de-empleados', actionSlug: 'view_private' },
    { moduleSlug: 'documentacion', tabSlug: 'documentos-de-equipos', actionSlug: 'view_private' },
  ]);
  const can = (tab: string, action: string) => granted.get(`documentacion:${tab}:${action}`) === true;

  const items: DocumentItem[] = [];
  const visibleTabs: DocumentListTab[] = [];
  for (const source of SOURCES) {
    if (!can(source.tab, 'view')) continue;
    visibleTabs.push(source.tab);
    const canViewPrivate = can(source.parentTab, 'view_private');
    if (source.kind === 'Persona') {
      const rows = await loadEmployeeDocumentRows(companyId, source.monthly, canViewPrivate, '');
      for (const row of rows) {
        items.push({
          id: row.id,
          kind: 'Persona',
          tab: source.tab,
          parentTab: source.parentTab,
          resourceId: row.applies,
          resourceLabel: employeeLabel(row.employees),
          typeId: row.id_document_types,
          typeName: row.document_types.name,
          isPrivate: row.document_types.private,
          state: row.state,
          urgency: urgencyOf(row.state, row.expiringSoon),
          validity: parseValidity(row.validity),
          period: row.period,
          denyReason: row.deny_reason,
        });
      }
    } else {
      const rows = await loadEquipmentDocumentRows(companyId, source.monthly, canViewPrivate, '');
      for (const row of rows) {
        items.push({
          id: row.id,
          kind: 'Equipos',
          tab: source.tab,
          parentTab: source.parentTab,
          resourceId: row.applies,
          resourceLabel: vehicleLabel(row.vehicles) || row.vehicles.serie || 'Equipo',
          typeId: row.id_document_types,
          typeName: row.document_types.name,
          isPrivate: row.document_types.private,
          state: row.state,
          urgency: urgencyOf(row.state, row.expiringSoon),
          validity: parseValidity(row.validity),
          period: row.period,
          denyReason: row.deny_reason,
        });
      }
    }
  }
  return { today: arToday(), items, visibleTabs };
}

const RANK: Record<Urgency, number> = { expired: 0, rejected: 1, missing: 2, expiring: 3 };

/** Bandeja de pendientes: solo lo que pide acción, de lo más urgente a lo menos (y lo que venció antes, primero). */
export async function loadPendingDocuments() {
  const { today, items, visibleTabs } = await loadVisibleItems();
  const pending = items
    .filter((i) => i.urgency !== null)
    .sort(
      (a, b) =>
        RANK[a.urgency!] - RANK[b.urgency!] ||
        (a.validity ?? '9999').localeCompare(b.validity ?? '9999') ||
        a.resourceLabel.localeCompare(b.resourceLabel, 'es')
    );
  return { today, pending, visibleTabs };
}

export type PendingDocuments = Awaited<ReturnType<typeof loadPendingDocuments>>;

/** Calendario: documentos vigentes que vencen desde hoy hasta dentro de `CALENDAR_DAYS` días. */
export async function loadExpiryCalendar() {
  const { today, items, visibleTabs } = await loadVisibleItems();
  const limit = new Date(Date.parse(`${today}T12:00:00Z`) + CALENDAR_DAYS * 86_400_000).toISOString().slice(0, 10);
  const upcoming = items
    .filter(
      (i) =>
        i.validity && i.validity >= today && i.validity <= limit && i.state !== 'vencido' && i.state !== 'rechazado'
    )
    .sort((a, b) => a.validity!.localeCompare(b.validity!) || a.resourceLabel.localeCompare(b.resourceLabel, 'es'));
  return { today, limit, upcoming, visibleTabs };
}

export type ExpiryCalendar = Awaited<ReturnType<typeof loadExpiryCalendar>>;
