import { z } from 'zod';
import { documentSummarySchema, labeledStatusSchema } from './employees';

/**
 * Contrato de Equipos de `/api/mobile/v1` (solo lectura). Módulo sin directivas: lo usan las rutas y sirve de fuente
 * para los tipos de la app. Las rutas validan la salida contra estos schemas antes de enviarla.
 *
 * Dos clases de equipo, como en la web: `vehicle` (tabla `vehicles`, pestaña Vehículos) y `other` (tabla
 * `other_equipment`, pestaña Equipamiento). Cada listado es de UNA clase; los dados de baja se piden con
 * `status=inactive`.
 */

const uuid = z.string().uuid();
const nullableText = z.string().nullable();

// ─── Entrada ──────────────────────────────────────────────────────────────────

export const EQUIPMENT_KINDS = ['vehicle', 'other'] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];
export const EQUIPMENT_LIST_MAX = 50;

/** Valores de `condition_enum` (nombre de Prisma). */
export const EQUIPMENT_CONDITIONS = [
  'operativo',
  'no_operativo',
  'en_reparacion',
  'operativo_condicionado',
  'en_preparacion',
] as const;

/** Valores de `status_type` (estado documental guardado). */
export const EQUIPMENT_DOC_STATUSES = ['Completo', 'Completo_con_doc_vencida', 'Incompleto', 'Avalado', 'No_avalado'] as const;

export const equipmentListQuerySchema = z.object({
  kind: z.enum(EQUIPMENT_KINDS).default('vehicle'),
  status: z.enum(['active', 'inactive']).default('active'),
  q: z.string().trim().max(60).optional(),
  typeId: uuid.optional(),
  condition: z.enum(EQUIPMENT_CONDITIONS).optional(),
  docStatus: z.enum(EQUIPMENT_DOC_STATUSES).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(EQUIPMENT_LIST_MAX).default(30),
});

export type EquipmentListQuery = z.output<typeof equipmentListQuerySchema>;

export const equipmentKindParamSchema = z.enum(EQUIPMENT_KINDS);

// ─── Listado ──────────────────────────────────────────────────────────────────

/** Chofer del equipo (derivado de los partes diarios; ver el doc del contrato). */
export const equipmentDriverSchema = z.object({
  id: uuid,
  fileNumber: z.string(),
  name: z.string(),
  /** Fecha del último parte en que figura como chofer de este equipo. */
  lastDate: z.string(),
  /** Tiene documentos vencidos, por vencer, rechazados o faltantes; null si el rol no ve los documentos de empleados. */
  alert: z.boolean().nullable(),
});

const orderStatusSchema = z.object({ code: z.string(), label: z.string(), tone: z.enum(['ok', 'warn', 'danger', 'neutral']) });

export const equipmentMaintenanceSchema = z.object({
  /** Orden abierta con la fecha programada más cercana desde hoy. */
  nextService: z
    .object({ orderId: uuid, orderNumber: nullableText, date: z.string(), status: orderStatusSchema })
    .nullable(),
  /** Orden más recientemente creada, en cualquier estado. */
  lastOrder: z
    .object({
      orderId: uuid,
      orderNumber: nullableText,
      createdAt: z.string(),
      status: orderStatusSchema,
      description: nullableText,
    })
    .nullable(),
});

export const equipmentListItemSchema = z.object({
  id: uuid,
  kind: z.enum(EQUIPMENT_KINDS),
  /** Cómo se lo nombra en una lista: dominio (o serie) de un vehículo; interno (o n° de serie) de un equipamiento. */
  identifier: z.string(),
  domain: nullableText,
  internNumber: nullableText,
  serialNumber: nullableText,
  type: nullableText,
  brand: nullableText,
  model: nullableText,
  year: nullableText,
  condition: labeledStatusSchema.nullable(),
  isActive: z.boolean(),
  /** null si el módulo Documentación está apagado para la empresa. */
  docStatus: labeledStatusSchema.nullable(),
  /**
   * Revisión 2, todos opcionales. Patente = dominio del vehículo; null en el equipamiento (su `identifier` es el
   * interno o el n° de serie).
   */
  plate: nullableText.optional(),
  /** Kilómetros (vehículo) / horas de motor (vehículo) u horómetro (equipamiento), tal cual están cargados. */
  mileage: nullableText.optional(),
  engineHours: nullableText.optional(),
  /** Clientes afectados (la lista web ya muestra esta columna); `customer` es el primero. */
  customers: z.array(z.object({ id: uuid, name: z.string() })).optional(),
  customer: nullableText.optional(),
  costCenter: nullableText.optional(),
  /** Solo con ver los partes diarios; ausente si no hay chofer reciente. */
  driver: equipmentDriverSchema.nullable().optional(),
  /** Solo con permiso sobre los documentos del equipo; null para bajas o con Documentación apagada. */
  documentSummary: documentSummarySchema.nullable().optional(),
  /** Solo vehículos y con ver el historial de mantenimiento de la ficha. */
  maintenance: equipmentMaintenanceSchema.nullable().optional(),
});

export const equipmentListResponseSchema = z.object({
  items: z.array(equipmentListItemSchema),
  nextCursor: z.string().nullable(),
  /** Total con los filtros aplicados; solo en la primera página (sin `cursor`). */
  total: z.number().int().nullable(),
  /**
   * Revisión 2, primera página: conteos del universo de la lista (clase, estado, tipo y búsqueda; sin `condition` ni
   * `docStatus`, para que sirvan de tarjetas-filtro). `withExpiry` = con documentación vencida (null con Documentación apagada).
   */
  totals: z
    .object({
      all: z.number().int(),
      operative: z.number().int(),
      inWorkshop: z.number().int(),
      withExpiry: z.number().int().nullable(),
    })
    .nullable()
    .optional(),
});

export const equipmentFiltersResponseSchema = z.object({
  /** Clases y estados que el usuario puede listar (según sus permisos de la web). */
  kinds: z.array(
    z.object({
      value: z.enum(EQUIPMENT_KINDS),
      label: z.string(),
      statuses: z.array(z.object({ value: z.enum(['active', 'inactive']), label: z.string() })),
    })
  ),
  types: z.array(z.object({ id: uuid, name: z.string(), kind: z.enum(EQUIPMENT_KINDS) })),
  conditions: z.array(z.object({ value: z.string(), label: z.string() })),
  /** Vacío si el módulo Documentación está apagado. */
  docStatuses: z.array(z.object({ value: z.string(), label: z.string() })),
});

// ─── Ficha ────────────────────────────────────────────────────────────────────

/** Estado de un documento en la app (ver `docs/api-movil/equipos-y-documentacion.md`). */
export const DOCUMENT_STATUSES = ['valid', 'expiring', 'expired', 'missing', 'rejected'] as const;
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);

/** Documento de un equipo (motor de cumplimiento de la web, igual que la ficha). */
export const equipmentDocumentSchema = z.object({
  /** Id del documento; `missing:<equipo>:<tipo>[:<período>]` en una fila faltante (sin ficha). */
  id: z.string(),
  type: z.string(),
  monthly: z.boolean(),
  mandatory: z.boolean(),
  status: documentStatusSchema,
  state: labeledStatusSchema,
  /** Vencimiento `YYYY-MM-DD` (día argentino). */
  validity: nullableText,
  period: nullableText,
  /** Tiene ficha (`/documents/equipment/{id}`): solo los documentos reales. */
  hasDetail: z.boolean(),
});

/** Documento de un equipamiento (`other_equipment_certifications`): solo metadatos. */
export const equipmentCertificationSchema = z.object({
  id: uuid,
  name: z.string(),
  expirationDate: nullableText,
  status: z.enum(['valid', 'expiring', 'expired']),
});

const ownerSchema = z.object({ name: z.string(), cuit: nullableText }).nullable();

export const equipmentDetailResponseSchema = z.object({
  id: uuid,
  kind: z.enum(EQUIPMENT_KINDS),
  identifier: z.string(),
  isActive: z.boolean(),
  condition: labeledStatusSchema.nullable(),
  docStatus: labeledStatusSchema.nullable(),
  termination: z.object({ date: nullableText, reason: nullableText }).nullable(),
  /** Revisión 2 (opcionales): patente (dominio del vehículo; null en equipamiento), chofer, resumen documental y mantenimiento. */
  plate: nullableText.optional(),
  driver: equipmentDriverSchema.nullable().optional(),
  documentSummary: documentSummarySchema.nullable().optional(),
  maintenance: equipmentMaintenanceSchema.nullable().optional(),
  /** Bloques incluidos según permisos: un bloque sin permiso NO viaja (ni vacío). */
  technical: z
    .object({
      type: nullableText,
      subtype: nullableText,
      brand: nullableText,
      model: nullableText,
      year: nullableText,
      domain: nullableText,
      internNumber: nullableText,
      serialNumber: nullableText,
      chassis: nullableText,
      engine: nullableText,
      kilometer: nullableText,
      engineHours: nullableText,
      horometer: nullableText,
      manufacturerPlate: nullableText,
      linkedVehicle: z.object({ id: uuid, domain: nullableText }).nullable(),
      /** Titular / propietario del equipo. */
      owner: ownerSchema,
      contract: z.object({
        type: nullableText,
        number: nullableText,
        startDate: nullableText,
        expirationDate: nullableText,
      }),
      certification: z.object({ has: z.boolean(), number: nullableText, expirationDate: nullableText }),
    })
    .optional(),
  assignment: z
    .object({
      /** Clientes a los que está afectado. */
      customers: z.array(z.object({ id: uuid, name: z.string() })),
      sector: nullableText,
      costCenter: nullableText,
    })
    .optional(),
  /** Documentación del vehículo (permanentes y mensuales). null = sin permiso o módulo apagado. */
  documents: z
    .object({
      permanent: z.array(equipmentDocumentSchema).nullable(),
      monthly: z.array(equipmentDocumentSchema).nullable(),
      summary: z.object({ total: z.number(), missing: z.number(), expired: z.number(), expiringSoon: z.number() }),
    })
    .nullable(),
  /** Documentos de un equipamiento. null = sin permiso o es un vehículo. */
  certifications: z.array(equipmentCertificationSchema).nullable(),
});
