import type { BadgeProps } from '@/components/ui/badge';
import {
  CalendarX,
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

// ============================================================================
// EMPLOYEE ENUM LABELS
// ============================================================================

export const genderLabels: Record<string, string> = {
  Masculino: 'Masculino',
  Femenino: 'Femenino',
  No_Declarado: 'No Declarado',
};

export const nationalityLabels: Record<string, string> = {
  Argentina: 'Argentina',
  Extranjero: 'Extranjero',
};

export const documentTypeLabels: Record<string, string> = {
  DNI: 'DNI',
  LE: 'LE',
  LC: 'LC',
  PASAPORTE: 'Pasaporte',
};

export const maritalStatusLabels: Record<string, string> = {
  Casado: 'Casado',
  Soltero: 'Soltero',
  Divorciado: 'Divorciado',
  Viudo: 'Viudo',
  Separado: 'Separado',
  Union_de_hecho: 'Union de hecho',
};

export const levelOfEducationLabels: Record<string, string> = {
  Primario: 'Primario',
  Secundario: 'Secundario',
  Terciario: 'Terciario',
  Universitario: 'Universitario',
  PosGrado: 'Pos Grado',
};

export const costTypeLabels: Record<string, string> = {
  Directo: 'Directo',
  Indirecto: 'Indirecto',
};

export const affiliateStatusLabels: Record<string, string> = {
  Dentro_de_convenio: 'Dentro de convenio',
  Fuera_de_convenio: 'Fuera de convenio',
};

export const employeeStatusLabels: Record<string, string> = {
  Avalado: 'Avalado',
  No_avalado: 'No avalado',
  Incompleto: 'Incompleto',
  Completo: 'Completo',
  Completo_con_doc_vencida: 'Completo con doc vencida',
};

export const reasonForTerminationLabels: Record<string, string> = {
  Despido_sin_causa: 'Despido sin causa',
  Renuncia: 'Renuncia',
  Despido_con_causa: 'Despido con causa',
  Acuerdo_de_partes: 'Acuerdo de partes',
  Fin_de_contrato: 'Fin de contrato',
  Fallecimiento: 'Fallecimiento',
};

// ============================================================================
// OTHER EQUIPMENT ENUM LABELS
// ============================================================================

/**
 * Labels para condition_enum (state prisma: operativo, no_operativo, en_reparacion,
 * operativo_condicionado, en_preparacion)
 */
export const conditionLabels: Record<string, string> = {
  operativo: 'Operativo',
  no_operativo: 'No operativo',
  en_reparacion: 'En reparación',
  operativo_condicionado: 'Operativo condicionado',
  en_preparacion: 'En preparación',
};

/**
 * Labels para status_type aplicado a equipos (Avalado, No_avalado, Incompleto,
 * Completo, Completo_con_doc_vencida)
 */
export const otherEquipmentStatusLabels: Record<string, string> = {
  Avalado: 'Avalado',
  No_avalado: 'No avalado',
  Incompleto: 'Incompleto',
  Completo: 'Completo',
  Completo_con_doc_vencida: 'Completo con doc vencida',
};

/**
 * Labels para currency_enum (USD, EUR, GBP, ARS)
 */
export const currencyLabels: Record<string, string> = {
  USD: 'USD',
  EUR: 'EUR',
  GBP: 'GBP',
  ARS: 'ARS',
};

/**
 * Labels para termination_reason_enum aplicado a equipos
 * (venta, destrucción total, devolución, otro)
 */
export const terminationReasonEquipmentLabels: Record<string, string> = {
  venta: 'Venta',
  destrucci_n_total: 'Destrucción total',
  devoluci_n: 'Devolución',
  otro: 'Otro',
};

/**
 * Labels para contract_type_vehicles_enum
 * (Leasing, Alquiler, Propio, Prendado)
 */
export const contractTypeVehiclesLabels: Record<string, string> = {
  Leasing: 'Leasing',
  Alquiler: 'Alquiler',
  Propio: 'Propio',
  Prendado: 'Prendado',
};

// ============================================================================
// BADGE CONFIGS
// ============================================================================

type BadgeVariant = NonNullable<BadgeProps['variant']>;

export const employeeStatusBadges: Record<string, BadgeVariant> = {
  Avalado: 'success',
  No_avalado: 'destructive',
  Incompleto: 'destructive',
  Completo: 'success',
  Completo_con_doc_vencida: 'yellow',
};

// ============================================================================
// DAILY REPORT ENUM LABELS
// ============================================================================

/**
 * Labels para daily_report_header_status_new
 * (abierto, cerrado, cerrado_completo, cerrado_incompleto)
 */
export const dailyReportStatusLabels: Record<string, string> = {
  abierto: 'Abierto',
  cerrado: 'Cerrado',
  cerrado_completo: 'Cerrado completo',
  cerrado_incompleto: 'Cerrado incompleto',
};

export const dailyReportStatusBadges: Record<string, BadgeVariant> = {
  abierto: 'default',
  cerrado: 'destructive',
  cerrado_completo: 'success',
  cerrado_incompleto: 'destructive',
};

/**
 * Labels para daily_report_status (estado de una fila del parte diario)
 * Valores: pendiente, sin_recursos_asignados, ejecutado, reprogramado, cancelado, en_certificacion
 */
export const dailyReportRowStatusLabels: Record<string, string> = {
  pendiente: 'Pendiente',
  sin_recursos_asignados: 'Sin recursos',
  ejecutado: 'Ejecutado',
  reprogramado: 'Reprogramado',
  cancelado: 'Cancelado',
  en_certificacion: 'En certificación',
};

export const dailyReportRowStatusBadges: Record<string, BadgeVariant> = {
  pendiente: 'yellow',
  sin_recursos_asignados: 'destructive',
  ejecutado: 'success',
  reprogramado: 'default',
  cancelado: 'destructive',
  en_certificacion: 'default',
};

/**
 * Labels para daily_report_type_enum (tipo de servicio de una fila)
 * Valores: mensual, adicional, adicional_permanente
 */
export const dailyReportTypeServiceLabels: Record<string, string> = {
  mensual: 'Mensual',
  adicional: 'Adicional',
  adicional_permanente: 'Adicional Permanente',
};

// ============================================================================
// FORMULARIOS ENUM LABELS
// ============================================================================

/**
 * Labels para el tipo de fuente de formularios
 * (checklist_template, custom_form)
 */
export const formSourceLabels: Record<string, string> = {
  checklist_template: 'Normalizado',
  custom_form: 'Formulario personalizado',
};

// ============================================================================
// MANTENIMIENTO / REPARACIONES ENUM LABELS
// ============================================================================

/**
 * Labels para criticidad de tipos de reparación (Baja, Media, Alta)
 */
export const repairCriticityLabels: Record<string, string> = {
  Baja: 'Baja',
  Media: 'Media',
  Alta: 'Alta',
};

/**
 * Labels para tipo de mantenimiento (Correctivo, Preventivo, Otro)
 */
export const typeOfMaintenanceLabels: Record<string, string> = {
  Correctivo: 'Correctivo',
  Preventivo: 'Preventivo',
  Otro: 'Otro',
};

// ============================================================================
// DOCUMENT STATE ENUM LABELS (documents_company.state)
// ============================================================================

/**
 * Labels para el enum `state` de documentos (documents_company, documents_employees, etc.)
 * Keys: valores del enum Prisma (presentado, rechazado, aprobado, vencido, pendiente)
 */
export const documentStateLabels: Record<string, string> = {
  presentado: 'Presentado',
  rechazado: 'Rechazado',
  aprobado: 'Aprobado',
  vencido: 'Vencido',
  pendiente: 'Pendiente',
};

export const documentStateBadges: Record<string, BadgeVariant> = {
  presentado: 'default',
  rechazado: 'destructive',
  aprobado: 'success',
  vencido: 'yellow',
  pendiente: 'secondary',
};

// ============================================================================
// GENERIC HELPER
// ============================================================================

/**
 * Obtiene el label legible de un valor de enum.
 * Si no encuentra el valor, reemplaza underscores por espacios.
 */
export function getEnumLabel(value: string | null | undefined, labels: Record<string, string>): string {
  if (!value) return '-';
  return labels[value] ?? value.replace(/_/g, ' ');
}

// ============================================================================
// STATUS TONES (StatusBadge) — mapa único estado → tono (DISENO.md §4.2)
// ============================================================================

/** Tono semántico de un estado. Lo consume `StatusBadge` (`@/components/ui/status-badge`). */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

/**
 * Tono de cada estado por dominio. Las claves son los valores reales de la BD (enums de Prisma).
 * Es el ÚNICO mapa estado → tono del sistema: prohibido redefinirlo por pantalla. Los dominios que faltan
 * (mantenimiento, OT, factura, preparte, tickets…) los agrega cada módulo al migrar sus badges.
 */
export const statusToneMap = {
  // status_type de empleados y equipos
  resource: {
    Completo: 'success',
    Completo_con_doc_vencida: 'warning',
    Incompleto: 'danger',
    Avalado: 'success',
    No_avalado: 'danger',
  },
  // is_active (los ternarios Activo/Inactivo): el consumidor pasa `is_active ? 'active' : 'inactive'`
  activity: {
    active: 'success',
    inactive: 'neutral',
  },
  // state de documentos: pendiente = sin archivo, presentado = pendiente de revisión
  document: {
    aprobado: 'success',
    presentado: 'info',
    pendiente: 'neutral',
    vencido: 'danger',
    rechazado: 'danger',
  },
  // condition_enum de equipos
  condition: {
    operativo: 'success',
    operativo_condicionado: 'warning',
    en_reparacion: 'info',
    no_operativo: 'danger',
    en_preparacion: 'neutral',
  },
  // daily_report_header_status_new
  dailyReport: {
    abierto: 'info',
    cerrado: 'success',
    cerrado_completo: 'success',
    cerrado_incompleto: 'warning',
  },
  // daily_report_status (fila del parte)
  dailyReportRow: {
    pendiente: 'warning',
    sin_recursos_asignados: 'danger',
    ejecutado: 'success',
    reprogramado: 'info',
    cancelado: 'neutral',
    en_certificacion: 'info',
  },
} as const satisfies Record<string, Record<string, StatusTone>>;

export type StatusDomain = keyof typeof statusToneMap;
export type StatusOf<D extends StatusDomain> = keyof (typeof statusToneMap)[D];

/** Label visible de cada estado por dominio. Reusa los mapas de labels de arriba. */
export const statusLabelMap = {
  resource: employeeStatusLabels,
  activity: { active: 'Activo', inactive: 'Inactivo' },
  document: documentStateLabels,
  condition: conditionLabels,
  dailyReport: dailyReportStatusLabels,
  dailyReportRow: dailyReportRowStatusLabels,
} satisfies Record<StatusDomain, Record<string, string>>;

/**
 * Ícono de los estados donde suma significado más allá del tono. El resto lleva el punto de color
 * (`StatusBadge` con `icon="dot"`): el texto siempre acompaña, nunca es solo color.
 */
export const statusIconMap: { [D in StatusDomain]?: Partial<Record<StatusOf<D>, LucideIcon>> } = {
  resource: {
    Completo: CircleCheck,
    Completo_con_doc_vencida: TriangleAlert,
    Incompleto: CircleX,
    Avalado: ShieldCheck,
    No_avalado: ShieldX,
  },
  document: {
    aprobado: CircleCheck,
    presentado: Clock,
    pendiente: CircleDashed,
    vencido: CalendarX,
    rechazado: CircleX,
  },
  condition: {
    operativo: CircleCheck,
    operativo_condicionado: TriangleAlert,
    en_reparacion: Wrench,
    no_operativo: CircleX,
    en_preparacion: CircleDashed,
  },
};
