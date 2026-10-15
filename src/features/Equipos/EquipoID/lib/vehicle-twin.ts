/**
 * Modelo puro del "gemelo del vehículo": clasifica la silueta y convierte los conteos de la ficha en
 * zonas con tono de estado y texto de lectura. Sin React ni acceso a datos: lo arma el servidor
 * (`vehicle-twin.server.ts`) y lo dibuja `components/iso/VehicleTwin.tsx`.
 */
import type { TireTone } from '@/features/Mantenimiento/Gomeria/shared/iso/truck-geometry';
import type { DiagramAxle, DiagramPosition } from '@/features/Mantenimiento/Gomeria/shared/tire-diagram-utils';
import { ATTENTION_THRESHOLDS } from '@/features/Mantenimiento/lib/attention-thresholds';

export type VehicleCategory = 'tractor' | 'trailer' | 'truck' | 'pickup' | 'machinery';
export type TwinZoneId = 'tires' | 'documents' | 'checklists' | 'maintenance' | 'hitch';

/** Pestaña de la ficha (`value` de `VehicleTabs`) a la que lleva cada zona; `null` = no navega. */
export const ZONE_TAB: Record<TwinZoneId, string | null> = {
  tires: 'tires',
  documents: 'documents',
  checklists: 'checklists',
  maintenance: 'operations',
  hitch: null,
};

export const ZONE_NAME: Record<TwinZoneId, string> = {
  tires: 'Cubiertas',
  documents: 'Documentación',
  checklists: 'Desvíos de checklist',
  maintenance: 'Mantenimiento',
  hitch: 'Enganche',
};

export const ZONE_SECTION_LABEL: Record<TwinZoneId, string> = {
  tires: 'Ir a Cubiertas',
  documents: 'Ir a Documentación',
  checklists: 'Ir a Checklists',
  maintenance: 'Ir a Mantenimiento',
  hitch: '',
};

/** Silueta según el tipo y subtipo del equipo. Un tipo desconocido cae en `truck` (genérico). */
export function classifyVehicle(input: {
  typeName?: string | null;
  subTypeName?: string | null;
  isTractorUnit?: boolean | null;
  hasHitch?: boolean | null;
}): VehicleCategory {
  if (input.isTractorUnit) return 'tractor';
  const text = `${input.typeName ?? ''} ${input.subTypeName ?? ''}`.toLowerCase();
  if (/semi|acoplado|trailer|remolque|batea|cisterna|playo|carret/.test(text)) return 'trailer';
  if (/camioneta|pick|utilitario|pickup/.test(text)) return 'pickup';
  if (/excavad|retro|pala |cargador|gr[uú]a|maquin|motoniv|topadora|autoelevador|rodillo|minicargador/.test(text)) {
    return 'machinery';
  }
  return 'truck';
}

/** Ejes de vista previa cuando el equipo no tiene cubiertas configuradas (ruedas sin estado). */
export function defaultAxles(category: VehicleCategory): DiagramAxle[] {
  const axle = (n: number, dual: boolean): DiagramAxle => ({
    id: `preview-${n}`,
    axle_number: n,
    tires_per_side: dual ? 2 : 1,
    tire_size: null,
    is_drive_axle: dual,
    is_spare: false,
  });
  switch (category) {
    case 'tractor':
      return [axle(1, false), axle(2, true), axle(3, true)];
    case 'trailer':
      return [axle(1, true), axle(2, true), axle(3, true)];
    case 'truck':
      return [axle(1, false), axle(2, true)];
    default:
      return [axle(1, false), axle(2, false)];
  }
}

// ─── Datos que llegan del servidor ─────────────────────────────────────────

export interface TwinDocuments {
  overdue: number;
  expiringSoon: number;
  missing: number;
  rejected: number;
  inReview: number;
  ok: number;
}

export interface TwinDeviations {
  total: number;
  critical: number;
  /** Antigüedad (días) del desvío pendiente más viejo; `null` si no hay. */
  oldestDays: number | null;
}

export interface TwinOrders {
  total: number;
  /** Cuántas necesitan atención (rechazadas, o demasiado tiempo sin avanzar). */
  attention: number;
  byStatus: Array<{ label: string; count: number }>;
}

export interface TwinHitch {
  capable: boolean;
  /** Tipos de equipo con los que puede acoplarse. */
  compatibleTypes: string[];
}

export interface TwinTires {
  axles: DiagramAxle[];
  positions: DiagramPosition[];
}

export interface VehicleTwinData {
  label: string;
  category: VehicleCategory;
  typeName: string | null;
  tires: TwinTires | null;
  hitch: TwinHitch;
  /** `null` = el usuario no tiene acceso a esa sección (o falló la carga). */
  documents: TwinDocuments | null;
  deviations: TwinDeviations | null;
  orders: TwinOrders | null;
  /** Pestañas de la ficha que el usuario puede ver. */
  access: Record<TwinZoneId, boolean>;
  /** Pestaña de cubiertas con permiso de edición: define la pista accionable sin configuración. */
  canEditTires: boolean;
}

// ─── Tonos ─────────────────────────────────────────────────────────────────

export function toneForDocuments(d: TwinDocuments): TireTone {
  if (d.overdue + d.missing + d.rejected > 0) return 'red';
  if (d.expiringSoon > 0) return 'amber';
  if (d.inReview > 0) return 'blue';
  if (d.ok > 0) return 'green';
  return 'none';
}

export function toneForDeviations(d: TwinDeviations): TireTone {
  if (d.total === 0) return 'green';
  const stale = d.oldestDays !== null && d.oldestDays > ATTENTION_THRESHOLDS.deviationsWithoutRequestDays;
  return d.critical > 0 || stale ? 'red' : 'amber';
}

export function toneForOrders(o: TwinOrders): TireTone {
  if (o.total === 0) return 'green';
  return o.attention > 0 ? 'amber' : 'blue';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export interface TwinZoneInfo {
  id: TwinZoneId;
  name: string;
  tone: TireTone;
  /** Línea corta con la cuenta real (leyenda y encabezado de la lectura). */
  summary: string;
  rows: Array<[string, string]>;
  hint: string | null;
  /** Pestaña destino si la zona es accionable (hay permiso y destino). */
  tab: string | null;
  sectionLabel: string;
}

/** Zonas con su estado y lectura, a partir de los datos de la ficha. Pura: el tono de cubiertas lo pone la capa. */
export function buildZoneInfos(data: VehicleTwinData, tiresTone: TireTone, tiresSummary: string): TwinZoneInfo[] {
  const tabOf = (id: TwinZoneId) => (data.access[id] ? ZONE_TAB[id] : null);
  const noAccess = 'Sin acceso a esta sección.';
  const out: TwinZoneInfo[] = [];

  const hasTires = data.tires !== null && data.tires.positions.length > 0;
  out.push({
    id: 'tires',
    name: ZONE_NAME.tires,
    tone: tiresTone,
    summary: data.access.tires ? tiresSummary : 'Sin acceso',
    rows: [],
    hint: !data.access.tires
      ? noAccess
      : hasTires
        ? null
        : data.canEditTires
          ? 'Sin configuración de cubiertas: definí los ejes desde la pestaña Cubiertas.'
          : 'Sin configuración de cubiertas: pedí que la carguen desde la pestaña Cubiertas.',
    tab: tabOf('tires'),
    sectionLabel: ZONE_SECTION_LABEL.tires,
  });

  const d = data.documents;
  out.push({
    id: 'documents',
    name: ZONE_NAME.documents,
    tone: d ? toneForDocuments(d) : 'none',
    summary: d
      ? d.overdue + d.missing + d.rejected + d.expiringSoon === 0
        ? `${d.ok + d.inReview} al día`
        : `${plural(d.overdue, 'vencido', 'vencidos')}, ${d.expiringSoon} por vencer`
      : 'Sin acceso',
    rows: d
      ? [
          ['Vencidos', String(d.overdue)],
          ['Por vencer (30 días)', String(d.expiringSoon)],
          ['Faltantes', String(d.missing)],
          ['Rechazados', String(d.rejected)],
          ['En revisión', String(d.inReview)],
          ['Al día', String(d.ok)],
        ]
      : [],
    hint: d ? 'Documentos permanentes que aplican al equipo.' : noAccess,
    tab: tabOf('documents'),
    sectionLabel: ZONE_SECTION_LABEL.documents,
  });

  const v = data.deviations;
  out.push({
    id: 'checklists',
    name: ZONE_NAME.checklists,
    tone: v ? toneForDeviations(v) : 'none',
    summary: v
      ? v.total === 0
        ? 'sin desvíos abiertos'
        : plural(v.total, 'desvío abierto', 'desvíos abiertos')
      : 'Sin acceso',
    rows: v
      ? [
          ['Abiertos (sin solicitud)', String(v.total)],
          ['Críticos', String(v.critical)],
          ['El más viejo', v.oldestDays === null ? '-' : plural(v.oldestDays, 'día', 'días')],
        ]
      : [],
    hint: v ? null : noAccess,
    tab: tabOf('checklists'),
    sectionLabel: ZONE_SECTION_LABEL.checklists,
  });

  const o = data.orders;
  out.push({
    id: 'maintenance',
    name: ZONE_NAME.maintenance,
    tone: o ? toneForOrders(o) : 'none',
    summary: o
      ? o.total === 0
        ? 'sin órdenes abiertas'
        : plural(o.total, 'orden abierta', 'órdenes abiertas')
      : 'Sin acceso',
    rows: o
      ? [
          ...o.byStatus.map((s): [string, string] => [s.label, String(s.count)]),
          ...(o.attention ? [['Piden atención', String(o.attention)] as [string, string]] : []),
        ]
      : [],
    hint: o ? null : noAccess,
    tab: tabOf('maintenance'),
    sectionLabel: ZONE_SECTION_LABEL.maintenance,
  });

  if (data.hitch.capable) {
    out.push({
      id: 'hitch',
      name: ZONE_NAME.hitch,
      tone: 'none',
      summary: data.hitch.compatibleTypes.length ? `admite ${data.hitch.compatibleTypes.join(', ')}` : 'con enganche',
      rows: data.hitch.compatibleTypes.map((t): [string, string] => ['Compatible con', t]),
      hint: 'El sistema no registra con qué equipo está acoplado hoy: solo qué tipos admite.',
      tab: null,
      sectionLabel: '',
    });
  }
  return out;
}

/** Clasifica una orden como "pide atención": rechazada, o sin avanzar más allá de los umbrales de Mantenimiento. */
export function orderNeedsAttention(
  order: { status: string; created_at: Date | null; workshop_entry_date: Date | null },
  now: Date
): boolean {
  if (order.status === 'operations_rejected' || order.status === 'workshop_rejected') return true;
  const days = (from: Date | null) => (from ? (now.getTime() - from.getTime()) / 86_400_000 : 0);
  if (order.status === 'pending_scheduling') return days(order.created_at) > ATTENTION_THRESHOLDS.schedulingPendingDays;
  if (order.status === 'in_workshop') return days(order.workshop_entry_date) > ATTENTION_THRESHOLDS.inWorkshopDays;
  return false;
}
