import { z } from 'zod';

/**
 * Contrato de Empleados de `/api/mobile/v1` (solo lectura). Módulo sin directivas: lo usan las rutas y sirve de fuente
 * para los tipos de la app. Cada respuesta tiene su schema; las rutas validan la salida contra él antes de enviarla,
 * así un cambio de forma rompe acá y no en el teléfono.
 */

const uuid = z.string().uuid();

// ─── Entrada ──────────────────────────────────────────────────────────────────

export const EMPLOYEE_SORTS = ['name', 'file', 'admission'] as const;
export const EMPLOYEE_LIST_MAX = 50;

export const employeeListQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  sectorId: uuid.optional(),
  positionId: uuid.optional(),
  customerId: uuid.optional(),
  docStatus: z.enum(['Completo', 'Completo_con_doc_vencida', 'Incompleto', 'Avalado', 'No_avalado']).optional(),
  sort: z.enum(EMPLOYEE_SORTS).default('name'),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(EMPLOYEE_LIST_MAX).default(30),
});

export type EmployeeListQuery = z.output<typeof employeeListQuerySchema>;

// ─── Piezas comunes ───────────────────────────────────────────────────────────

/** Tono de un estado: la app lo pinta con su tema, sin conocer las reglas. */
export const toneSchema = z.enum(['ok', 'warn', 'danger', 'neutral']);

export const labeledStatusSchema = z.object({ code: z.string(), label: z.string(), tone: toneSchema });

/** URLs prefirmadas de la foto (vencen en `expiresAt`). `version` cambia si cambia la foto: es la clave de caché. */
export const employeePhotoSchema = z
  .object({
    version: z.string(),
    thumbUrl: z.string(),
    url: z.string(),
    expiresAt: z.string(),
  })
  .nullable();

// ─── Listado ──────────────────────────────────────────────────────────────────

export const employeeListItemSchema = z.object({
  id: uuid,
  fileNumber: z.string(),
  fullName: z.string(),
  position: z.string().nullable(),
  sector: z.string().nullable(),
  isActive: z.boolean(),
  docStatus: labeledStatusSchema.nullable(),
  photo: employeePhotoSchema,
});

export const employeeListResponseSchema = z.object({
  items: z.array(employeeListItemSchema),
  nextCursor: z.string().nullable(),
  /** Total con los filtros aplicados; solo en la primera página (sin `cursor`). */
  total: z.number().int().nullable(),
});

export const employeeFiltersResponseSchema = z.object({
  statuses: z.array(z.object({ value: z.enum(['active', 'inactive']), label: z.string() })),
  sectors: z.array(z.object({ id: uuid, name: z.string() })),
  positions: z.array(z.object({ id: uuid, name: z.string() })),
  customers: z.array(z.object({ id: uuid, name: z.string() })),
  docStatuses: z.array(z.object({ value: z.string(), label: z.string() })),
});

// ─── Legajo ───────────────────────────────────────────────────────────────────

const nullableText = z.string().nullable();

export const employeeDetailResponseSchema = z.object({
  id: uuid,
  fileNumber: z.string(),
  fullName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  isActive: z.boolean(),
  position: nullableText,
  sector: nullableText,
  docStatus: labeledStatusSchema.nullable(),
  termination: z.object({ date: nullableText, reason: nullableText }).nullable(),
  photo: employeePhotoSchema,
  /** Bloques incluidos según permisos: un bloque sin permiso NO viaja (ni vacío). */
  personal: z
    .object({
      documentType: nullableText,
      documentNumber: nullableText,
      cuil: nullableText,
      birthDate: nullableText,
      gender: nullableText,
      nationality: nullableText,
      birthCountry: nullableText,
      maritalStatus: nullableText,
      educationLevel: nullableText,
    })
    .optional(),
  contact: z
    .object({
      phone: nullableText,
      email: nullableText,
      address: nullableText,
      city: nullableText,
      province: nullableText,
      postalCode: nullableText,
    })
    .optional(),
  work: z
    .object({
      admissionDate: nullableText,
      contractType: nullableText,
      workDiagram: nullableText,
      normalHours: nullableText,
      guild: nullableText,
      covenant: nullableText,
      category: nullableText,
      costCenter: nullableText,
      costType: nullableText,
      customers: z.array(z.string()),
      aptitudes: z.array(z.string()),
      workshopSectors: z.array(z.string()),
    })
    .optional(),
  /** Secciones que se piden aparte (`/documents`, `/diagram`, `/clothing`): `true` si el usuario puede verlas. */
  sections: z.object({ documents: z.boolean(), diagram: z.boolean(), clothing: z.boolean() }),
});

export const employeeDocumentSchema = z.object({
  id: z.string(),
  type: z.string(),
  monthly: z.boolean(),
  mandatory: z.boolean(),
  state: labeledStatusSchema,
  validity: nullableText,
  period: nullableText,
  expiringSoon: z.boolean(),
  notApplicable: z.boolean(),
  denyReason: nullableText,
});

export const employeeDocumentsResponseSchema = z.object({
  /** null = el usuario no puede ver ese grupo (distinto de lista vacía). */
  permanent: z.array(employeeDocumentSchema).nullable(),
  monthly: z.array(employeeDocumentSchema).nullable(),
  summary: z.object({ total: z.number(), missing: z.number(), expired: z.number(), expiringSoon: z.number() }),
});

export const employeeDiagramResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  days: z.array(
    z.object({
      date: z.string(),
      type: z.string(),
      shortName: nullableText,
      color: nullableText,
      comments: nullableText,
    })
  ),
});

export const employeeClothingResponseSchema = z.object({
  deliveries: z.array(
    z.object({
      id: uuid,
      deliveredAt: z.string(),
      type: z.string(),
      cancelled: z.boolean(),
      items: z.array(z.object({ name: z.string(), quantity: z.number(), size: nullableText })),
    })
  ),
});
