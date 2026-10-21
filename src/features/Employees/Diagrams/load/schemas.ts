import { argentinaDate } from '@/shared/lib/argentina-time';
import { z } from 'zod';
import { uuidLike } from '../lib/diagram-ids';
import {
  INDIVIDUAL_MAX_TOTAL_DAYS,
  MASSIVE_MAX_EMPLOYEES,
  MASSIVE_MAX_RANGES,
  MASSIVE_MAX_TOTAL_DAYS,
} from '../lib/massive-limits';
import { dateToIsoDay, findRangesIssue, type IsoRange } from '../lib/massive-ranges';

/**
 * Esquemas de las cargas de diagramas. Sin directiva: los comparten los formularios (cliente) y las
 * server actions (servidor), así la validación que ve el usuario es la que se hace cumplir.
 */

// ─── Piezas comunes ─────────────────────────────────────────────────────────

/** Empleado elegido: el id viaja al servidor y la etiqueta (`[legajo] Apellido, Nombre`) queda para los chips. */
export const employeeOptionSchema = z.object({ id: z.string().min(1), label: z.string() });
export type EmployeeOption = z.infer<typeof employeeOptionSchema>;

const calendarRangeSchema = z.object({
  from: z.date({ required_error: 'Elegí la fecha desde', invalid_type_error: 'Elegí la fecha desde' }),
  to: z.date({ required_error: 'Elegí la fecha hasta', invalid_type_error: 'Elegí la fecha hasta' }),
});

type CalendarRange = z.infer<typeof calendarRangeSchema>;

function toIsoRanges(ranges: readonly CalendarRange[]): IsoRange[] {
  return ranges.map((range) => ({ from: dateToIsoDay(range.from), to: dateToIsoDay(range.to) }));
}

function addRangesIssues(
  ctx: z.RefinementCtx,
  ranges: readonly CalendarRange[],
  limits: { maxRanges: number; maxTotalDays: number }
) {
  const issue = findRangesIssue(toIsoRanges(ranges), limits);
  if (!issue) return;
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message: issue.message,
    path: issue.index === null ? ['dateRanges'] : ['dateRanges', issue.index],
  });
}

// ─── Carga individual ───────────────────────────────────────────────────────

/** Formulario de la carga individual: un empleado, una novedad y uno o más rangos (se admiten fechas pasadas). */
export const individualLoadSchema = z
  .object({
    employees: z
      .array(employeeOptionSchema)
      .min(1, 'Elegí un empleado')
      .max(1, 'La carga individual es para un solo empleado'),
    diagramTypeId: z.string().min(1, 'Elegí un tipo de novedad'),
    dateRanges: z.array(calendarRangeSchema),
    /** Comentario general de la carga. Se replica en todos los días, salvo los que se personalicen. */
    comments: z.string().max(500, 'El comentario no puede superar 500 caracteres'),
    customizeComments: z.boolean(),
  })
  .superRefine((data, ctx) => {
    addRangesIssues(ctx, data.dateRanges, {
      maxRanges: MASSIVE_MAX_RANGES,
      maxTotalDays: INDIVIDUAL_MAX_TOTAL_DAYS,
    });
  });

export type IndividualLoadValues = z.infer<typeof individualLoadSchema>;

/** Decisión sobre cada día en la revisión de la carga individual. */
export const REVIEW_ACTIONS = ['create', 'skip', 'replace', 'keep'] as const;

export const individualReviewSchema = z.object({
  days: z.array(
    z.object({
      /** `YYYY-MM-DD` */
      date: z.string(),
      /** Id de la novedad ya cargada ese día, o `null` si el día está libre. */
      existingId: z.string().nullable(),
      previousName: z.string().nullable(),
      previousColor: z.string().nullable(),
      action: z.enum(REVIEW_ACTIONS),
      comments: z.string().max(500, 'El comentario no puede superar 500 caracteres'),
    })
  ),
});

export type IndividualReviewValues = z.infer<typeof individualReviewSchema>;

// ─── Carga masiva ───────────────────────────────────────────────────────────

/** Formulario de la carga masiva (cliente): rangos como fechas del calendario, desde hoy en adelante. */
export const massiveLoadFormSchema = z
  .object({
    mode: z.enum(['diagram', 'novelty']),
    employees: z
      .array(employeeOptionSchema)
      .min(1, 'Elegí al menos un empleado')
      .max(MASSIVE_MAX_EMPLOYEES, `Máximo ${MASSIVE_MAX_EMPLOYEES} empleados`),
    workDiagramId: z.string(),
    activeNoveltyId: z.string(),
    diagramTypeId: z.string(),
    dateRanges: z.array(calendarRangeSchema),
  })
  .superRefine((data, ctx) => {
    addRangesIssues(ctx, data.dateRanges, {
      maxRanges: data.mode === 'diagram' ? 1 : MASSIVE_MAX_RANGES,
      maxTotalDays: MASSIVE_MAX_TOTAL_DAYS,
    });

    const today = argentinaDate();
    data.dateRanges.forEach((range, index) => {
      if (dateToIsoDay(range.from) < today) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Solo fechas desde hoy en adelante',
          path: ['dateRanges', index],
        });
      }
    });

    if (data.mode === 'diagram') {
      if (!data.workDiagramId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Elegí un diagrama de trabajo', path: ['workDiagramId'] });
      } else if (!data.activeNoveltyId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Elegí la novedad de los días activos',
          path: ['activeNoveltyId'],
        });
      }
    } else if (!data.diagramTypeId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Elegí una novedad', path: ['diagramTypeId'] });
    }
  });

export type MassiveLoadFormValues = z.infer<typeof massiveLoadFormSchema>;

const isoDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const isoRangeSchema = z.object({ from: isoDaySchema, to: isoDaySchema });

const massiveBaseSchema = z.object({
  employeeIds: z
    .array(uuidLike)
    .min(1, 'Debe seleccionar al menos un empleado')
    .max(MASSIVE_MAX_EMPLOYEES * 10),
  ranges: z.array(isoRangeSchema).min(1).max(MASSIVE_MAX_RANGES),
});

/** Parámetros que viajan al servidor para revisar o procesar una carga masiva. */
export const massiveLoadParamsSchema = z.discriminatedUnion('mode', [
  massiveBaseSchema.extend({
    mode: z.literal('diagram'),
    workDiagramId: uuidLike,
    activeNoveltyId: uuidLike.optional(),
  }),
  massiveBaseSchema.extend({ mode: z.literal('novelty'), diagramTypeId: uuidLike }),
]);

export type MassiveLoadParams = z.infer<typeof massiveLoadParamsSchema>;

export type MassiveConflictResolution = 'skip' | 'update';
