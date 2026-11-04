import { z } from 'zod';
import { labeledStatusSchema } from './employees';

/**
 * Contrato de Capacitaciones (HSE) de `/api/mobile/v1` (solo lectura, revisión 3). Módulo sin directivas. Las rutas
 * validan la salida contra estos schemas antes de responder.
 */

const uuid = z.string().uuid();
const nullableText = z.string().nullable();

export const TRAINING_LIST_MAX = 50;

// ─── Entrada ──────────────────────────────────────────────────────────────────

/** Estado agregado de una capacitación (ver `aggregateStatusOf`) y de una persona frente a ella. */
export const TRAINING_STATUS_FILTERS = ['valid', 'expiring', 'expired', 'pending'] as const;

export const trainingListQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  /** Estado agregado: `expired` (alguien con la aprobación vencida) · `pending` (alguien sin aprobar) · `expiring` · `valid` (todos al día). */
  status: z.enum(TRAINING_STATUS_FILTERS).optional(),
  /** Capacitaciones que aplican a ese sector (destinatario «Sector» o «Todo el personal»). */
  sectorId: uuid.optional(),
  /** Capacitaciones que aplican a ese puesto (destinatario «Puesto» o «Todo el personal»). */
  positionId: uuid.optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(TRAINING_LIST_MAX).default(30),
});
export type TrainingListQuery = z.output<typeof trainingListQuerySchema>;

export const trainingPeopleQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(TRAINING_STATUS_FILTERS).optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(TRAINING_LIST_MAX).default(30),
});
export type TrainingPeopleQuery = z.output<typeof trainingPeopleQuerySchema>;

// ─── Piezas comunes ───────────────────────────────────────────────────────────

/** Cobertura: aprobados vigentes sobre las personas a las que aplica (asignaciones sin archivar). */
const coverageSchema = z.object({
  approved: z.number().int(),
  applies: z.number().int(),
  /** Aprobaciones vencidas (la persona tiene que volver a rendir). */
  expired: z.number().int(),
  /** Aprobaciones vigentes que vencen en ≤ 30 días. */
  expiring: z.number().int(),
  /** Sin aprobar: pendiente, rindiendo o sin intentos. */
  pending: z.number().int(),
});

const kindSchema = z.object({ code: z.string(), label: z.string() });

// ─── Listado ──────────────────────────────────────────────────────────────────

export const trainingListItemSchema = z.object({
  id: uuid,
  title: z.string(),
  kind: kindSchema,
  /** Meses de vigencia de la aprobación; null = no vence. */
  validityMonths: z.number().int().nullable(),
  coverage: coverageSchema,
  /** Estado agregado: vencida si alguien tiene la aprobación vencida; si no, pendiente si falta aprobar a alguien; por vencer; vigente. `none` = nadie la tiene asignada. */
  status: labeledStatusSchema,
  /** Próxima sesión presencial (día argentino). Solo viaja con permiso sobre las actas; null si no hay una programada. */
  nextSession: z.object({ date: z.string(), location: nullableText }).nullable().optional(),
});

export const trainingListResponseSchema = z.object({
  items: z.array(trainingListItemSchema),
  nextCursor: z.string().nullable(),
  /** Con los filtros aplicados; solo en la primera página. */
  total: z.number().int().nullable(),
  /**
   * Solo en la primera página. Sobre las capacitaciones que cumplen `q`, `sectorId` y `positionId` (sin `status`, para
   * usarlo de tarjetas-filtro): `coverage` = % de aprobados vigentes sobre las personas a las que aplica (null si
   * nadie), `expired` y `expiring` = aprobaciones (personas), no capacitaciones.
   */
  totals: z
    .object({
      coverage: z.number().nullable(),
      expired: z.number().int(),
      expiring: z.number().int(),
    })
    .nullable(),
});

// ─── Detalle ──────────────────────────────────────────────────────────────────

const mediaTypeSchema = z.enum(['video', 'pdf', 'image', 'document', 'link', 'other']);

export const trainingDetailResponseSchema = z.object({
  id: uuid,
  title: z.string(),
  description: nullableText,
  kind: kindSchema,
  status: labeledStatusSchema,
  publishedAt: nullableText,
  summary: z.object({
    /** Cómo se aprueba: % de puntos del examen. */
    passingScore: z.number().int(),
    maxAttempts: z.number().int(),
    timeLimitMinutes: z.number().int().nullable(),
    shuffleQuestions: z.boolean(),
    /** Renovación: meses de vigencia de la aprobación; null = no vence. */
    validityMonths: z.number().int().nullable(),
  }),
  /** A quién aplica (destinatarios). */
  audience: z.array(z.object({ kind: z.enum(['all', 'position', 'sector', 'employee']), label: z.string() })),
  coverage: coverageSchema,
  /** Solo con permiso sobre las actas (sesiones presenciales). Más nueva primero, hasta 20. */
  sessions: z
    .array(
      z.object({
        id: uuid,
        number: z.number().int(),
        date: z.string(),
        status: labeledStatusSchema,
        modality: kindSchema,
        location: nullableText,
        durationMinutes: z.number().int().nullable(),
        instructors: z.array(z.object({ name: z.string(), kind: z.enum(['internal', 'external']) })),
        attendance: z.object({ present: z.number().int(), registered: z.number().int() }),
        /** Hay acta en PDF (el archivo se ve en la web: la app no tiene todavía enlace firmado). */
        hasMinutes: z.boolean(),
        upcoming: z.boolean(),
      })
    )
    .optional(),
  /**
   * Material de estudio: solo metadatos. `url` viaja únicamente en los enlaces externos (la web los muestra tal cual);
   * los archivos se sirven por la sesión web y no tienen enlace firmado móvil.
   */
  content: z.object({
    required: z.number().int(),
    materials: z.array(
      z.object({
        id: uuid,
        title: z.string(),
        kind: z.enum(['file', 'link']),
        mediaType: mediaTypeSchema,
        fileName: nullableText,
        fileSize: z.number().int().nullable(),
        url: nullableText,
        required: z.boolean(),
        /** Cuántas personas lo marcaron como leído. */
        viewedBy: z.number().int(),
      })
    ),
  }),
  /** Examen: sin preguntas, opciones ni respuestas correctas. */
  exam: z.object({
    questions: z.number().int(),
    totalPoints: z.number().int(),
    /** Resultados agregados por número de intento (solo los enviados). */
    results: z.array(
      z.object({
        attempt: z.number().int(),
        submitted: z.number().int(),
        passed: z.number().int(),
        averageScore: z.number().nullable(),
      })
    ),
  }),
  /** Constancias emitidas (firmadas por quien aprobó y no anuladas). */
  certificate: z.object({ issued: z.number().int(), lastIssuedAt: nullableText }).nullable(),
});

// ─── Personas ─────────────────────────────────────────────────────────────────

export const trainingPersonSchema = z.object({
  id: uuid,
  employee: z.object({
    id: uuid,
    fileNumber: z.string(),
    fullName: z.string(),
    position: nullableText,
    isActive: z.boolean(),
  }),
  status: labeledStatusSchema,
  /** Estado guardado de la asignación: `pending`, `in_progress`, `passed`, `failed` o `expired`. */
  result: z.string(),
  attempts: z.object({ used: z.number().int(), max: z.number().int() }),
  /** % del último intento. */
  score: z.number().nullable(),
  lastAttemptAt: nullableText,
  approvedAt: nullableText,
  expiresAt: nullableText,
  /** Días que faltan para el vencimiento (negativo = vencida hace N días); null si no vence o no está aprobada. */
  daysLeft: z.number().int().nullable(),
});

export const trainingPeopleResponseSchema = z.object({
  items: z.array(trainingPersonSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int().nullable(),
});
