/**
 * Modelo de vista del PDF de Orden de Mantenimiento (ticket 684).
 *
 * Es un modelo de **presentacion**, no el shape crudo de Prisma: la server action
 * que lo alimente resuelve antes las relaciones, los nombres de los responsables
 * y las etiquetas de estado.
 *
 * Por que los estados llegan como texto ya resuelto (`statusLabel`) y no como el
 * valor crudo: los mapas de etiquetas de mantenimiento ya existen en el modulo
 * (`MO_STATUS_CONFIG` / `WO_STATUS_CONFIG` en
 * `WorkshopView/WorkshopSectorTasksTable/columns.tsx`). Declarar aca un mapa
 * paralelo haria que el mismo estado se lea distinto en pantalla y en el papel.
 * Como esos mapas acoplan la etiqueta con un icono de lucide y una variante de
 * Badge — inservibles en un PDF —, el layout recibe la etiqueta ya resuelta y no
 * decide nomenclatura.
 *
 * Todo campo opcional se imprime igual: la ausencia es el dato que se audita.
 */

// ============================================================================
// EQUIPO
// ============================================================================

/**
 * Recurso intervenido. Una orden apunta a un vehiculo O a un equipamiento
 * (`other_equipment`), nunca a los dos: la BD lo garantiza con un CHECK.
 * Ver `Mantenimiento/shared/maintenance-resource.ts`.
 */
export interface ReportEquipment {
  /** 'Vehiculo' | 'Equipamiento'. Resuelto con `getResourceKindLabel`. */
  kindLabel: string;
  /** Dominio (patente) si es vehiculo, numero de serie si es equipamiento. */
  identifier: string;
  /** Etiqueta del campo anterior: "Dominio" o "N.° de serie". */
  identifierLabel: string;
  internalNumber?: string | null;
  type?: string | null;
  subType?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: string | null;
  /** Sector operativo al que pertenece el equipo (no el sector de taller). */
  operationalSector?: string | null;
  /** Kilometraje al ingresar al taller. Excluyente con `engineHoursAtEntry`. */
  kilometerAtEntry?: string | null;
  /** Horometro al ingresar al taller. Aplica a equipamiento e hidrogruas. */
  engineHoursAtEntry?: string | null;
}

// ============================================================================
// TRAZABILIDAD
// ============================================================================

/**
 * Hito del circuito de la orden. Se imprimen TODOS los hitos definidos, tambien
 * los que no ocurrieron: que un paso figure "Sin registrar" es informacion de
 * auditoria, no un motivo para omitir la fila.
 */
export interface ReportMilestone {
  /** Nombre del hito en caso oracion: "Ingreso a taller". */
  label: string;
  at?: Date | string | null;
  /** Nombre y apellido de quien lo ejecuto. */
  by?: string | null;
  /** Motivo, nota de validacion o aclaracion asociada al hito. */
  note?: string | null;
}

// ============================================================================
// TAREAS
// ============================================================================

/** Tarea ejecutada dentro de una orden de trabajo. */
export interface ReportTask {
  /** Numeracion jerarquica citable por el auditor: "2.3" = OT 2, tarea 3. */
  code: string;
  /** Nombre del tipo de reparacion (`types_of_repairs.name`). */
  repairType: string;
  /** Detalle cargado en el item (`maintenance_order_items.description`). */
  description?: string | null;
  /** Enum `type_of_maintenance_ENUM`: Preventivo | Correctivo | Otro. */
  maintenanceType?: string | null;
  isCritical: boolean;
  /** El item es un diagnostico, no una reparacion. */
  isDiagnostic: boolean;
  /** Etiqueta ya resuelta del `work_order_item_status`. */
  statusLabel: string;
  /** La tarea fue rechazada o reasignada: se marca como no conforme. */
  isNonConforming: boolean;
  completedAt?: Date | string | null;
  completedBy?: string | null;
  /** Notas del tecnico que ejecuto la tarea. */
  technicianNotes?: string | null;
  /** Comentario del jefe de taller sobre la tarea. */
  workshopChiefComment?: string | null;
  /** Motivo de rechazo del item. */
  rejectionReason?: string | null;
}

// ============================================================================
// ORDENES DE TRABAJO
// ============================================================================

/**
 * Orden de trabajo: el tramo de la orden que ejecuta un sector de taller.
 * Es 1:1 con la unidad y agrupa N tareas.
 */
export interface ReportWorkOrder {
  /** `work_orders.order_number`. */
  number: string;
  /** `workshop_sectors.name`. Null cuando la OT quedo sin sector asignado. */
  sector?: string | null;
  /** `workshops.name` + tipo (interno / externo). */
  workshop?: string | null;
  isExternalWorkshop: boolean;
  /** Etiqueta ya resuelta del `work_order_status`. */
  statusLabel: string;
  /** Etiqueta ya resuelta del `work_order_priority`. */
  priorityLabel: string;
  plannedStart?: Date | string | null;
  plannedEnd?: Date | string | null;
  actualStart?: Date | string | null;
  actualEnd?: Date | string | null;
  /** Quien cerro la OT. */
  completedBy?: string | null;
  /** `work_orders.notes`. */
  notes?: string | null;
  tasks: ReportTask[];
}

// ============================================================================
// DOCUMENTO
// ============================================================================

/** Datos de emision, para trazabilidad del papel impreso. */
export interface ReportIssuance {
  /** Instante en que se genero este PDF. */
  at: Date | string;
  /** Usuario que lo descargo. */
  by: string;
  /** Id corto de la orden: permite rastrear el registro desde el papel. */
  traceId: string;
}

// ============================================================================
// MATERIALES (Almacenes etapa 4)
// ============================================================================

/**
 * Material entregado a la orden por pedido de materiales, neto de anulaciones. Las cantidades y
 * los importes llegan formateados; el costo solo si quien emite tiene permiso de ver precios.
 */
export interface ReportMaterial {
  /** OT a la que se pidio ("OT-000102 · Mecánica"); null = pedido a nivel orden. */
  workOrder: string | null;
  /** "ACE-15W40 · Aceite 15W40". */
  material: string;
  /** "12 l". */
  quantity: string;
  /** "$ 60.006,00" o null sin permiso. */
  cost: string | null;
}

export interface MaintenanceOrderReportData {
  /** `maintenance_orders.order_number`. */
  orderNumber: string;
  /** Etiqueta ya resuelta del estado de la orden. */
  statusLabel: string;
  /** Origen del pedido: 'checklist' | 'Carga manual' | etc. */
  sourceLabel?: string | null;
  /** Tipo de preventivo, cuando aplica. */
  preventiveType?: string | null;
  /** `maintenance_orders.description`. */
  description?: string | null;
  createdAt?: Date | string | null;
  /** Fecha planificada de ingreso. */
  scheduledDate?: Date | string | null;
  workshopEntryDate?: Date | string | null;
  /** Cierre efectivo de la orden: el ultimo `actual_end_date` de sus OT. */
  closedAt?: Date | string | null;

  equipment: ReportEquipment;
  milestones: ReportMilestone[];
  workOrders: ReportWorkOrder[];
  materials: ReportMaterial[];
  /** Total de materiales formateado; null sin permiso de ver precios. */
  materialsTotal: string | null;

  /** Empresa emisora, para el encabezado. */
  companyName: string;
  /** Ruta o URL del logo. Debe ser un JPEG aplanado sobre blanco. */
  logoSrc?: string;
  /** Codigo y revision del formulario, como en el resto de los registros del sistema. */
  documentCode: string;
  documentRevision: string;

  issuance: ReportIssuance;
}
