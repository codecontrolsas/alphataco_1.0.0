import { z } from 'zod';
import { labeledStatusSchema } from './employees';
import { DOCUMENT_STATUSES, documentStatusSchema } from './equipment';

/**
 * Contrato de Documentación de `/api/mobile/v1` (solo lectura). Módulo sin directivas.
 *
 * Tres clases de recurso, como las pestañas de la web: documentos de EMPLEADOS, de EQUIPOS (vehículos) y de la
 * EMPRESA. Las filas salen del mismo motor de cumplimiento que las listas web: el estado es el derivado (no el
 * guardado), las filas faltantes son sintéticas y los documentos archivados («ya no aplica») no aparecen.
 */

const nullableText = z.string().nullable();

export const DOCUMENT_RESOURCES = ['employee', 'equipment', 'company'] as const;
export type DocumentResource = (typeof DOCUMENT_RESOURCES)[number];
export { DOCUMENT_STATUSES };
export const DOCUMENT_LIST_MAX = 50;

// ─── Entrada ──────────────────────────────────────────────────────────────────

export const documentListQuerySchema = z.object({
  /** Sin `resource`: todas las clases que el usuario puede ver. */
  resource: z.enum(DOCUMENT_RESOURCES).optional(),
  /** Sin `period`: permanentes y mensuales (los que el usuario puede ver). */
  period: z.enum(['permanent', 'monthly']).optional(),
  status: documentStatusSchema.optional(),
  typeId: z.string().uuid().optional(),
  /** Busca en el tipo de documento y en el recurso (legajo, apellido y nombre; dominio, interno o serie). */
  q: z.string().trim().max(60).optional(),
  /** Documentos de UN recurso (empleado o equipo). Exige `resource`. */
  resourceId: z.string().uuid().optional(),
  /** Revisión 2: solo recursos afectados a este cliente (los documentos de la empresa quedan afuera). */
  customerId: z.string().uuid().optional(),
  /** Revisión 2: `expiry` agrupa por vencimiento (vencidos, esta semana, este mes, más adelante). */
  group: z.literal('expiry').optional(),
  /** Con `group=expiry`: pide UNA sola agrupación para seguir paginándola con su `cursor`. */
  bucket: z.enum(['overdue', 'thisWeek', 'thisMonth', 'later']).optional(),
  cursor: z.string().max(1024).optional(),
  limit: z.coerce.number().int().min(1).max(DOCUMENT_LIST_MAX).default(30),
});

export type DocumentListQuery = z.output<typeof documentListQuerySchema>;

export const documentResourceParamSchema = z.enum(DOCUMENT_RESOURCES);

// ─── Piezas ───────────────────────────────────────────────────────────────────

/** Recurso dueño del documento. En un empleado viaja SIEMPRE el legajo. */
export const documentOwnerSchema = z.object({
  kind: z.enum(DOCUMENT_RESOURCES),
  id: z.string().uuid(),
  /** Cómo se lo nombra: «Apellido Nombre», dominio/serie/interno, o la razón social. */
  name: z.string(),
  /** Legajo del empleado; null en equipos y empresa. */
  fileNumber: nullableText,
  /** Dominio / n° interno del vehículo; null en empleados y empresa. */
  domain: nullableText,
  internNumber: nullableText,
});

export const documentTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  mandatory: z.boolean(),
  monthly: z.boolean(),
  hasExpiry: z.boolean(),
  private: z.boolean(),
});

// ─── Listado ──────────────────────────────────────────────────────────────────

export const documentListItemSchema = z.object({
  /** Id del documento; `missing:<recurso>:<tipo>[:<período>]` en una fila faltante. */
  id: z.string(),
  resource: documentOwnerSchema,
  type: documentTypeSchema,
  /** `valid` | `expiring` (vence en ≤ 30 días) | `expired` | `missing` | `rejected`. */
  status: documentStatusSchema,
  /** Estado de la web tal cual (aprobado, presentado, rechazado, vencido, pendiente = faltante). */
  state: labeledStatusSchema,
  /** Vencimiento `YYYY-MM-DD` (día argentino); null si no vence o no hay documento. */
  validity: nullableText,
  period: nullableText,
  /** Tiene ficha (`/documents/{resource}/{id}`): solo los documentos reales, no las filas faltantes. */
  hasDetail: z.boolean(),
});

/** Conteo por estado de los documentos del listado (antes de filtrar por `status`); `total` = suma de todos. */
export const documentsSummarySchema = z.object({
  valid: z.number().int(),
  expiring: z.number().int(),
  expired: z.number().int(),
  missing: z.number().int(),
  rejected: z.number().int(),
  total: z.number().int(),
});

export const documentListResponseSchema = z.object({
  items: z.array(documentListItemSchema),
  nextCursor: z.string().nullable(),
  /** Total con los filtros aplicados; solo en la primera página (sin `cursor`). */
  total: z.number().int().nullable(),
  /** Revisión 2: solo en la primera página. */
  summary: documentsSummarySchema.nullable().optional(),
});

export const EXPIRY_BUCKETS = ['overdue', 'thisWeek', 'thisMonth', 'later'] as const;

/** Respuesta de `group=expiry`: cada agrupación con su conteo y su página; `nextCursor` sigue DENTRO de la agrupación. */
export const documentGroupedListResponseSchema = z.object({
  groups: z.array(
    z.object({
      key: z.enum(EXPIRY_BUCKETS),
      label: z.string(),
      count: z.number().int(),
      items: z.array(documentListItemSchema),
      nextCursor: z.string().nullable(),
    })
  ),
  /** Filas que no entran en ninguna agrupación: faltantes y documentos sin vencimiento. */
  excluded: z.object({ missing: z.number().int(), noExpiry: z.number().int() }),
  summary: documentsSummarySchema.nullable().optional(),
});

export const documentFiltersResponseSchema = z.object({
  /** Clases de recurso que el usuario puede ver, con los períodos habilitados de cada una. */
  resources: z.array(
    z.object({
      value: z.enum(DOCUMENT_RESOURCES),
      label: z.string(),
      periods: z.array(z.enum(['permanent', 'monthly'])),
    })
  ),
  statuses: z.array(z.object({ value: documentStatusSchema, label: z.string() })),
  types: z.array(
    z.object({ id: z.string().uuid(), name: z.string(), resource: z.enum(DOCUMENT_RESOURCES), monthly: z.boolean() })
  ),
  /** Revisión 2: clientes de la empresa, para el filtro `customerId`. */
  customers: z.array(z.object({ id: z.string().uuid(), name: z.string() })).optional(),
});

// ─── Ficha ────────────────────────────────────────────────────────────────────

export const documentDetailResponseSchema = z.object({
  id: z.string().uuid(),
  resource: documentOwnerSchema,
  type: documentTypeSchema,
  status: documentStatusSchema,
  state: labeledStatusSchema,
  validity: nullableText,
  period: nullableText,
  /** Fecha de carga (`YYYY-MM-DD`, día argentino). */
  uploadedAt: z.string(),
  denyReason: nullableText,
  /** N° de póliza (solo documentos de equipos). */
  policyNumber: nullableText,
  /** Hay archivo: se pide el enlace firmado con `GET /documents/{resource}/{id}/file`. */
  hasFile: z.boolean(),
  /** Revisión 2 (opcionales). Quién subió el documento (null si no se guardó). */
  uploadedBy: nullableText.optional(),
  /** Estado de revisión guardado (pendiente / presentado / aprobado / rechazado) con el motivo del rechazo. La web NO guarda quién aprobó. */
  review: z.object({ code: z.string(), label: z.string(), tone: z.enum(['ok', 'warn', 'danger', 'neutral']), reason: nullableText }).optional(),
  /** A cuántos recursos aplica el tipo de este documento y cuántos están al día (vigentes o por vencer). */
  appliesTo: z.object({ total: z.number().int(), upToDate: z.number().int() }).optional(),
  /** Por qué se pide el tipo de documento. */
  conditions: z
    .object({
      scope: z.enum(['all', 'conditions', 'none']),
      /** «Todo el personal», «Todos los equipos»...; null cuando hay condiciones. */
      allText: nullableText,
      criteria: z.array(z.object({ key: z.string(), label: z.string(), values: z.array(z.string()) })),
      multiresource: z.boolean(),
      mandatory: z.boolean(),
      /** Documento de baja (solo se pide a recursos dados de baja). */
      downDocument: z.boolean(),
    })
    .optional(),
  /** Historial de movimientos del documento (más nuevo primero, hasta 20). Vacío en documentos de la empresa (no se registra). */
  versions: z.array(z.object({ at: z.string(), by: nullableText })).optional(),
});

/** Enlace de descarga del archivo: URL relativa al servidor, firmada y de vida corta. */
export const documentFileLinkResponseSchema = z.object({
  url: z.string(),
  expiresAt: z.string(),
  fileName: z.string(),
});
