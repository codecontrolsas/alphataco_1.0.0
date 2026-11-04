import { z } from 'zod';

/**
 * Contrato de la Búsqueda global de `/api/mobile/v1` (solo lectura, revisión 3). Módulo sin directivas.
 *
 * Una consulta, grupos por tipo con máximo 5 resultados y su `total`. Un grupo para el que el usuario no tiene permiso
 * (o cuyo módulo está apagado) NO aparece: ni vacío ni con error.
 */

export const SEARCH_GROUP_LIMIT = 5;
export const SEARCH_MIN_LENGTH = 2;

export const SEARCH_GROUP_TYPES = ['employees', 'equipment', 'documents', 'trainings', 'daily-reports', 'modules'] as const;
export type SearchGroupType = (typeof SEARCH_GROUP_TYPES)[number];

export const searchQuerySchema = z.object({
  q: z.string().trim().min(SEARCH_MIN_LENGTH, `La búsqueda necesita al menos ${SEARCH_MIN_LENGTH} caracteres.`).max(60),
});
export type SearchQuery = z.output<typeof searchQuerySchema>;

const nullableText = z.string().nullable();
const uuid = z.string().uuid();

const employeeResultSchema = z.object({
  id: uuid,
  fileNumber: z.string(),
  fullName: z.string(),
  position: nullableText,
  sector: nullableText,
  isActive: z.boolean(),
});

const equipmentResultSchema = z.object({
  id: uuid,
  kind: z.enum(['vehicle', 'other']),
  identifier: z.string(),
  domain: nullableText,
  internNumber: nullableText,
  type: nullableText,
  brand: nullableText,
  model: nullableText,
  isActive: z.boolean(),
});

const documentResultSchema = z.object({
  id: z.string(),
  type: z.string(),
  resource: z.object({
    kind: z.enum(['employee', 'equipment', 'company']),
    id: z.string(),
    name: z.string(),
    fileNumber: nullableText,
  }),
  status: z.enum(['valid', 'expiring', 'expired', 'missing', 'rejected']),
  validity: nullableText,
  /** Los faltantes no tienen ficha. */
  hasDetail: z.boolean(),
});

const trainingResultSchema = z.object({ id: uuid, title: z.string(), kind: z.object({ code: z.string(), label: z.string() }) });

const dailyReportResultSchema = z.object({
  id: uuid,
  date: z.string(),
  status: z.string(),
  rowCount: z.number().int(),
});

const moduleResultSchema = z.object({ key: z.string(), name: z.string() });

const group = <T extends z.ZodTypeAny, Type extends SearchGroupType>(type: Type, item: T) =>
  z.object({ type: z.literal(type), total: z.number().int(), items: z.array(item).max(SEARCH_GROUP_LIMIT) });

export const searchResponseSchema = z.object({
  q: z.string(),
  groups: z.array(
    z.discriminatedUnion('type', [
      group('employees', employeeResultSchema),
      group('equipment', equipmentResultSchema),
      group('documents', documentResultSchema),
      group('trainings', trainingResultSchema),
      group('daily-reports', dailyReportResultSchema),
      group('modules', moduleResultSchema),
    ])
  ),
  /** Grupos permitidos que fallaron al calcularse (la app los puede reintentar); el resto de la respuesta es válida. */
  failed: z.array(z.enum(SEARCH_GROUP_TYPES)),
});

