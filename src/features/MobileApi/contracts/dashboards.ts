import { z } from 'zod';

/**
 * Contrato de Tableros de `/api/mobile/v1` (solo lectura, revisión 3). Módulo sin directivas.
 *
 * `/dashboards` lista los tableros que el usuario ve (los mismos que la web: predefinidos, propios y compartidos);
 * `/dashboards/{key}` trae los datos de sus widgets. Cada widget lleva `id`, `title`, `size` y, según el caso, `data`
 * (con la forma de `WIDGET_DATA_SCHEMAS[id]`, validada en el servidor antes de responder) o `error` (el widget falló: el
 * resto del tablero se entrega igual). Los widgets que la app no calcula van en `unsupportedWidgets`.
 */

const nullableText = z.string().nullable();
const toneSchema = z.enum(['ok', 'warn', 'danger', 'neutral']);

export const SIZE_VALUES = ['xs', 'sm', 'md', 'lg', 'xl', 'full'] as const;

export const dashboardListResponseSchema = z.object({
  items: z.array(
    z.object({
      /** uuid del tablero guardado o `tpl-<clave>` de un predefinido sin guardar (es lo que va en `/dashboards/{key}`). */
      key: z.string(),
      name: z.string(),
      description: nullableText,
      /** Posición en el selector de la web (0 = primero). */
      order: z.number().int(),
      /** Clave del predefinido del que sale (`resumen`, `dia`, `vencimientos`), o null si es un tablero propio. */
      template: nullableText,
      /** `default` predefinido · `own` propio · `shared` compartido por otro usuario. */
      scope: z.enum(['default', 'own', 'shared']),
      /** Dueño de un tablero compartido. */
      ownerName: nullableText,
      /** Widgets que el usuario ve en este tablero (los que su rol no ve no se cuentan). */
      widgetCount: z.number().int(),
    })
  ),
});

const widgetErrorSchema = z.object({ code: z.literal('WIDGET_ERROR'), message: z.string() });

export const dashboardWidgetSchema = z.object({
  id: z.string(),
  title: z.string(),
  size: z.enum(SIZE_VALUES),
  data: z.unknown().optional(),
  error: widgetErrorSchema.optional(),
});

export const dashboardDetailResponseSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: nullableText,
  /** Cuándo se calcularon los datos (hora argentina). */
  generatedAt: z.string(),
  widgets: z.array(dashboardWidgetSchema),
  /** Widgets del tablero que el usuario ve pero la app no calcula (para que ofrezca abrir la web). */
  unsupportedWidgets: z.array(z.object({ id: z.string(), title: z.string() })),
});

// ─── Datos de cada widget ─────────────────────────────────────────────────────

const count = z.number().int();
const percent = z.number().nullable();
const day = z.string();

const expiringSeriesSchema = z.object({
  /** Documentos que ya vencieron. */
  overdue: count,
  /** Documentos que vencen: índice = días que faltan (0 = hoy), 31 posiciones (hoy + 30 días). */
  byDay: z.array(count),
});

const complianceSourceSchema = z.object({ complete: count, expired: count, incomplete: count, total: count });

const expiringDocItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  /** Vencimiento (día argentino). */
  validity: nullableText,
  /** Días que faltan (negativo = vencido hace N días). */
  daysLeft: count.nullable(),
  state: z.object({ code: z.string(), tone: toneSchema }),
  /** Empleado (legajo siempre) o equipo, según el widget. */
  resource: z.object({ id: z.string(), identifier: z.string(), name: z.string() }),
});

const expiringDocsSchema = z.object({
  total: count,
  overdue: count,
  items: z.array(expiringDocItemSchema),
  /** Hay más filas que las devueltas (se entregan las 20 más urgentes). */
  truncated: z.boolean(),
});

const absenceSummarySchema = z.object({
  date: day,
  previousHeadcount: count,
  hires: count,
  terminations: count,
  headcount: count,
  absent: count,
  /** % de ausentismo; null si no hay dotación para medir. */
  absenteeism: percent,
});

const trendRangeSchema = z.object({ from: day, to: day, label: z.string() });

export const WIDGET_DATA_SCHEMAS = {
  'kpi-employees': z.object({ value: count }),
  'kpi-active-vehicles': z.object({ value: count }),
  'kpi-operative-fleet': z.object({ value: count, activeVehicles: count, outOfService: count }),
  'kpi-today-services': z.object({ date: day, value: count }),
  'kpi-operativity': z.object({
    percentage: percent,
    level: toneSchema,
    operative: count,
    total: count,
  }),
  'services-today': z.object({
    date: day,
    total: count,
    byType: z.array(z.object({ type: z.string(), count, percentage: z.number() })),
    byClient: z.array(
      z.object({
        client: z.string(),
        total: count,
        monthly: count,
        additional: count,
        statuses: z.array(z.object({ status: z.string(), count })),
      })
    ),
    /** Clientes que no entraron en `byClient` (se entregan los 20 con más servicios). */
    moreClients: count,
  }),
  'hr-today': z.object({
    date: day,
    withDiagram: count,
    inOperation: count,
    available: count,
    cancelled: count,
    /** % de uso (en operación / con diagrama de trabajo); null si no hay con quién medir. */
    usage: percent,
    diagrams: z.array(z.object({ id: z.string(), name: z.string(), color: nullableText, count })),
  }),
  'equipment-operation': z.object({
    date: day,
    active: count,
    inUse: count,
    cancelled: count,
    available: count,
    outOfService: count,
    fleet: count,
    operativity: percent,
    /** Por tipo de equipo (los 12 con más unidades). */
    byType: z.array(
      z.object({ type: z.string(), available: count, outOfService: count, working: count, cancelled: count })
    ),
  }),
  'document-compliance': z.object({
    /** Cada fuente viaja solo si el rol la ve (sin permiso, no se menciona). */
    employees: complianceSourceSchema.optional(),
    vehicles: complianceSourceSchema.optional(),
  }),
  'expiring-weeks': z.object({
    today: day,
    employees: expiringSeriesSchema.optional(),
    vehicles: expiringSeriesSchema.optional(),
    /** Cuatro semanas corridas desde hoy, con los dos tipos de recurso sumados. */
    weeks: z.array(z.object({ index: count, from: day, to: day, count, employees: count, vehicles: count })),
    /** Vencen entre el día 28 y el 30, fuera de las cuatro semanas. */
    remainder: count,
    overdue: count,
  }),
  'expiring-timeline': z.object({
    today: day,
    employees: expiringSeriesSchema.optional(),
    vehicles: expiringSeriesSchema.optional(),
  }),
  'expiring-employee-docs': expiringDocsSchema,
  'expiring-vehicle-docs': expiringDocsSchema,
  'attention-inbox': z.object({
    items: z.array(
      z.object({
        key: z.string(),
        module: z.string(),
        label: z.string(),
        count,
        tone: z.enum(['danger', 'warn', 'info']),
      })
    ),
    /** Fuentes que el rol ve y se pudieron calcular. */
    checked: count,
    failed: count,
    /** La app calcula solo los documentos vencidos; los contadores de Compras, Almacenes, Tesorería, Mantenimiento y Comercial quedan en la web. */
    partial: z.literal(true),
  }),
  'hr-summary': absenceSummarySchema.nullable(),
  'hr-absenteeism-trend': z.object({
    range: trendRangeSchema,
    points: z.array(z.object({ date: day, percentage: z.number() })),
  }),
  'hr-absence-reasons': z.object({
    date: day,
    departments: z.array(
      z.object({
        department: z.string(),
        total: count,
        reasons: z.array(z.object({ name: z.string(), count, color: nullableText })),
      })
    ),
  }),
  'hr-department-summary': z.object({
    date: day,
    items: z.array(
      z.object({ sector: z.string(), headcount: count, absent: count, percentage: z.number() })
    ),
  }),
  'hr-daily-absence': z.object({
    range: trendRangeSchema,
    items: z.array(
      z.object({
        date: day,
        headcount: count,
        hires: count,
        terminations: count,
        vacations: count,
        totalHeadcount: count,
        absent: count,
        percentage: z.number(),
      })
    ),
  }),
  'hr-distribution': z.object({
    byPosition: z.array(
      z.object({ position: nullableText, gender: nullableText, genderLabel: nullableText, count })
    ),
    byContract: z.array(z.object({ contract: nullableText, count })),
  }),
  'hr-headcount-trend': z.object({
    range: trendRangeSchema,
    points: z.array(z.object({ date: day, headcount: count, hires: count, terminations: count })),
  }),
  'hr-employee-absence': z.object({
    date: day,
    total: count,
    items: z.array(
      z.object({
        employeeId: z.string(),
        fileNumber: z.string(),
        name: z.string(),
        task: nullableText,
        line: nullableText,
        shift: nullableText,
        reason: nullableText,
        from: nullableText,
        to: nullableText,
        daysOut: count,
        notes: nullableText,
      })
    ),
    truncated: z.boolean(),
  }),
} as const;

export type SupportedWidgetId = keyof typeof WIDGET_DATA_SCHEMAS;

export const SUPPORTED_WIDGET_IDS = Object.keys(WIDGET_DATA_SCHEMAS) as SupportedWidgetId[];

export function isSupportedWidget(id: string): id is SupportedWidgetId {
  return Object.hasOwn(WIDGET_DATA_SCHEMAS, id);
}
