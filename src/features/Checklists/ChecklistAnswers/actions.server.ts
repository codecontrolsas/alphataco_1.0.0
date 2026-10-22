'use server';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import {
  buildDateRangeFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
  NULL_FILTER_VALUE,
  parseSearchParams,
} from '@/shared/components/common/DataTable/helpers';
import type { DataTableSearchParams } from '@/shared/components/common/DataTable/types';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { toFacetMap, withoutOwnFilter } from '@/shared/lib/table-facets';
import { dateRangeKeys, sanitizeFilters } from '@/shared/lib/table-filters';
import { clampedPageParams } from '@/shared/lib/table-pagination';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { normalizeResult } from './utils';

const logger = new Logger('ChecklistAnswers/actions.server');

/** Permiso de la pantalla de respuestas de un checklist (módulo `formularios`, tab `formularios`). */
const MODULE_SLUG = 'formularios';
const TAB_SLUG = 'formularios';

/** Tope de filas de un export: más que esto no se descarga entero (se pide acotar con filtros). */
const EXPORT_MAX_ROWS = 10_000;

/**
 * Empresa activa, tras comprobar el permiso de lectura y que la plantilla pedida le pertenece.
 *
 * `templateId` llega del cliente en las actions de esta tabla (son endpoints públicos
 * sin RLS): sin esta verificación, cualquier UUID de plantilla dejaba consultar las
 * respuestas de otra empresa. Devuelve `null` si no hay permiso o la plantilla no es de la empresa activa.
 */
async function resolveTemplateCompanyId(templateId: string): Promise<string | null> {
  if (!(await checkPermissionServer(MODULE_SLUG, TAB_SLUG, 'view'))) return null;

  const company_id = await getActiveCompanyId();
  const template = await prisma.checklist_templates.findFirst({
    where: withCompany({ id: templateId }, company_id),
    select: { id: true },
  });
  if (!template) {
    logger.warn('Plantilla de checklist fuera de la empresa activa', { data: { templateId, company_id } });
    return null;
  }
  return company_id;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Campos directos de checklist_answers que se pueden ordenar server-side */
const VALID_SORT_FIELDS = new Set(['created_at', 'result', 'kilometraje', 'horometro']);

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['created_at'];

/** Columnas con filtro de texto individual */
const TEXT_FILTER_COLUMNS = ['observations'];

/** Columnas facetadas (cada una se resuelve a mano en `buildWhereClause`). */
const FACET_COLUMNS = ['result', 'equipment_id', 'user_id', 'chofer', 'customer_id'];

/** `fileNumber` = legajo del chofer (coincidencia exacta). */
const ALLOWED_FILTER_KEYS = new Set([
  ...FACET_COLUMNS,
  ...TEXT_FILTER_COLUMNS,
  'fileNumber',
  ...dateRangeKeys(DATE_RANGE_COLUMNS),
]);

/** Relación del chofer (FK `chofer_employee_id` → employees). */
const CHOFER_RELATION = 'employees_checklist_answers_chofer_employee_idToemployees' as const;

// ============================================================================
// SELECT COMÚN
// ============================================================================

const CHECKLIST_ANSWER_SELECT = {
  id: true,
  created_at: true,
  result: true,
  answer_data: true,
  observations: true,
  equipment_id: true,
  user_id: true,
  // FK directa de chofer y columnas GENERATED desde JSONB
  chofer_employee_id: true,
  customer_id: true,
  kilometraje: true,
  horometro: true,
  // Legajo del chofer (columna separada + filtro propio)
  [CHOFER_RELATION]: { select: { file: true } },
  // Relación equipo (vehicle)
  vehicles: {
    select: {
      id: true,
      domain: true,
      serie: true,
      intern_number: true,
      brand_vehicles: { select: { name: true } },
      model_vehicles: { select: { name: true } },
    },
  },
  // Relación usuario
  profile: {
    select: {
      id: true,
      fullname: true,
    },
  },
} as const;

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

type ListState = ReturnType<typeof parseSearchParams>;

function parseListState(searchParams: DataTableSearchParams): ListState {
  return sanitizeFilters(parseSearchParams(searchParams), ALLOWED_FILTER_KEYS);
}

/** FK UUID nullable con "Sin asignar": `{ campo: { in } }`, `{ campo: null }` o ambos en un OR. */
function buildNullableFkCondition(
  field: 'equipment_id' | 'user_id' | 'customer_id' | 'chofer_employee_id',
  values: string[] | undefined
): Prisma.checklist_answersWhereInput | null {
  if (!values?.length) return null;
  const realValues = values.filter((v) => v !== NULL_FILTER_VALUE);
  const includesNull = values.includes(NULL_FILTER_VALUE);
  if (includesNull && realValues.length > 0) {
    return { OR: [{ [field]: { in: realValues } }, { [field]: null }] } as Prisma.checklist_answersWhereInput;
  }
  if (includesNull) return { [field]: null } as Prisma.checklist_answersWhereInput;
  return { [field]: { in: realValues } } as Prisma.checklist_answersWhereInput;
}

/** Resultado con valores inconsistentes en la base (B/M/passed/failed/null). */
function buildResultCondition(values: string[] | undefined): Prisma.checklist_answersWhereInput | null {
  if (!values?.length) return null;
  const nonNullValues: string[] = [];
  let includesNull = false;
  for (const v of values) {
    if (v === NULL_FILTER_VALUE) includesNull = true;
    else if (v === 'passed') nonNullValues.push('B', 'passed');
    else if (v === 'failed') nonNullValues.push('M', 'failed');
  }
  if (includesNull && nonNullValues.length > 0) return { OR: [{ result: { in: nonNullValues } }, { result: null }] };
  if (includesNull) return { result: null };
  return { result: { in: nonNullValues } };
}

/** Legajo del chofer: coincidencia EXACTA (el legajo es corto; `contains` mezclaría 1, 10, 100...). */
function buildFileNumberCondition(values: string[] | undefined): Prisma.checklist_answersWhereInput | null {
  const file = values?.[0]?.trim();
  if (!file) return null;
  return { [CHOFER_RELATION]: { is: { file: { equals: file } } } };
}

/**
 * WHERE compartido entre paginado, export y facetas. Todo (perímetro `template_id` + `company_id`, búsqueda,
 * filtros) va dentro de UN solo `AND`: sin RLS el perímetro va explícito y ningún filtro puede pisarlo.
 */
function buildWhereClause(templateId: string, companyId: string, state: ListState) {
  return composeConditions(
    withCompany({ template_id: templateId }, companyId),
    buildSearchWhere(state.search, []),
    buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS),
    buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS),
    buildResultCondition(state.filters.result),
    buildNullableFkCondition('equipment_id', state.filters.equipment_id),
    buildNullableFkCondition('user_id', state.filters.user_id),
    buildNullableFkCondition('customer_id', state.filters.customer_id),
    buildNullableFkCondition('chofer_employee_id', state.filters.chofer),
    buildFileNumberCondition(state.filters.fileNumber)
  );
}

function composeConditions(...parts: ReadonlyArray<object | null | undefined>) {
  const conditions = parts.filter((part): part is object => part != null && Object.keys(part).length > 0);
  return { AND: conditions as Prisma.checklist_answersWhereInput[] };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getChecklistAnswersPaginated(searchParams: DataTableSearchParams, templateId: string) {
  try {
    const companyId = await resolveTemplateCompanyId(templateId);
    if (!companyId) return { data: [], total: 0 };

    const state = parseListState(searchParams);
    const { skip, take } = clampedPageParams(state);
    const where = buildWhereClause(templateId, companyId, state);

    // Multi-sort — solo campos válidos
    const resolvedSorts: Record<string, unknown>[] = [];
    for (const s of state.sorting) {
      if (VALID_SORT_FIELDS.has(s.id)) {
        resolvedSorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
      }
    }
    const safeOrderBy = [...resolvedSorts, { created_at: 'desc' as const }, { id: 'asc' as const }];

    const [data, total] = await Promise.all([
      prisma.checklist_answers.findMany({
        skip,
        take,
        orderBy: safeOrderBy,
        where,
        select: CHECKLIST_ANSWER_SELECT,
      }),
      prisma.checklist_answers.count({ where }),
    ]);

    return { data, total };
  } catch (error) {
    logger.error('Error al obtener respuestas de checklist paginadas', { data: { error } });
    throw new Error('No se pudo obtener la lista de respuestas. Intente nuevamente.');
  }
}

export type ChecklistAnswerListItem = Awaited<ReturnType<typeof getChecklistAnswersPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación, con tope)
// ============================================================================

/**
 * Filas del export con los mismos filtros de la tabla, hasta `EXPORT_MAX_ROWS`. Si se supera (o no hay
 * permiso) devuelve `{ ok: false, message }`: Next enmascara el mensaje de un error lanzado desde una
 * server action. El cliente lo abre con `unwrapExportResult`.
 */
export async function getAllChecklistAnswersForExport(
  searchParams: DataTableSearchParams,
  templateId: string
): Promise<ExportResult<ChecklistAnswerListItem[]>> {
  try {
    const companyId = await resolveTemplateCompanyId(templateId);
    if (!companyId) return { ok: false, message: 'No tenés permiso para exportar las respuestas de este checklist' };

    const where = buildWhereClause(templateId, companyId, parseListState(searchParams));

    const data = await prisma.checklist_answers.findMany({
      where,
      orderBy: [{ created_at: 'desc' as const }, { id: 'asc' as const }],
      select: CHECKLIST_ANSWER_SELECT,
      take: EXPORT_MAX_ROWS + 1,
    });

    if (data.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación supera el máximo de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }
    return { ok: true, data };
  } catch (error) {
    logger.error('Error al exportar respuestas de checklist', { data: { error } });
    return { ok: false, message: 'No se pudo exportar la lista de respuestas. Intente nuevamente.' };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filtering)
// ============================================================================

type FacetOption = { id: string; name: string | null };
type FacetResponse = { counts: Map<string, number>; resolvedOptions?: FacetOption[] };

/**
 * Counts (y opciones) de UNA columna facetada, sin su propio filtro (cross-filter).
 * `result` devuelve las claves normalizadas `passed`/`failed` y `NULL_FILTER_VALUE` para "pendiente".
 */
export async function getChecklistAnswersSingleFacet(
  columnId: string,
  searchParams: DataTableSearchParams | undefined,
  templateId: string
): Promise<FacetResponse | null> {
  if (!FACET_COLUMNS.includes(columnId)) {
    logger.warn('getChecklistAnswersSingleFacet: columnId desconocido', { data: { columnId } });
    return null;
  }

  try {
    const companyId = await resolveTemplateCompanyId(templateId);
    if (!companyId) return { counts: new Map() };

    const state = withoutOwnFilter(parseListState(searchParams ?? {}), columnId);
    const where = buildWhereClause(templateId, companyId, state);

    switch (columnId) {
      case 'result': {
        const rows = await prisma.checklist_answers.groupBy({ by: ['result'], where, _count: true });
        const counts = new Map<string, number>();
        for (const { result, _count } of rows) {
          const normalized = normalizeResult(result);
          const key = normalized === 'pending' ? NULL_FILTER_VALUE : normalized;
          counts.set(key, (counts.get(key) ?? 0) + _count);
        }
        return { counts };
      }

      case 'equipment_id': {
        const rows = await prisma.checklist_answers.groupBy({ by: ['equipment_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.equipment_id, count: r._count })));
        const ids = rows.map((r) => r.equipment_id);
        const vehicles =
          ids.length > 0
            ? await prisma.vehicles.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: { id: true, domain: true, serie: true, intern_number: true },
              })
            : [];
        const resolvedOptions = vehicles.map((v) => ({
          id: v.id,
          name: v.domain
            ? `${v.domain}${v.intern_number ? ` - ${v.intern_number}` : ''}`
            : `${v.serie ?? ''}${v.intern_number ? ` - ${v.intern_number}` : ''}`,
        }));
        return { counts, resolvedOptions };
      }

      case 'user_id': {
        const rows = await prisma.checklist_answers.groupBy({ by: ['user_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.user_id, count: r._count })));
        const ids = rows.map((r) => r.user_id).filter((id): id is string => id != null);
        const profiles =
          ids.length > 0
            ? await prisma.profile.findMany({ where: { id: { in: ids } }, select: { id: true, fullname: true } })
            : [];
        return { counts, resolvedOptions: profiles.map((p) => ({ id: p.id, name: p.fullname ?? p.id })) };
      }

      case 'chofer': {
        const rows = await prisma.checklist_answers.groupBy({ by: ['chofer_employee_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.chofer_employee_id, count: r._count })));
        const ids = rows.map((r) => r.chofer_employee_id).filter((id): id is string => id != null);
        const employees =
          ids.length > 0
            ? await prisma.employees.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: { id: true, firstname: true, lastname: true, file: true },
              })
            : [];
        // Etiqueta [legajo] Apellido Nombre (el legajo identifica a la persona; el nombre puede repetirse)
        const resolvedOptions = employees.map((e) => ({
          id: e.id,
          name: `[${e.file ?? '—'}] ${e.lastname ?? ''} ${e.firstname ?? ''}`.trim(),
        }));
        return { counts, resolvedOptions };
      }

      default: {
        // customer_id — columna GENERATED desde JSONB
        const rows = await prisma.checklist_answers.groupBy({ by: ['customer_id'], where, _count: true });
        const counts = toFacetMap(rows.map((r) => ({ key: r.customer_id, count: r._count })));
        const ids = rows.map((r) => r.customer_id).filter((id): id is string => id != null);
        const customers =
          ids.length > 0
            ? await prisma.customers.findMany({
                where: { id: { in: ids }, company_id: companyId },
                select: { id: true, name: true },
              })
            : [];
        return { counts, resolvedOptions: customers.map((c) => ({ id: c.id, name: c.name })) };
      }
    }
  } catch (error) {
    logger.error('Error al obtener facet de respuestas de checklist', { data: { error, columnId } });
    return { counts: new Map() };
  }
}
