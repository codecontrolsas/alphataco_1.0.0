'use server';

import { canForms, requireFormsPermission } from '@/features/Formularios/lib/access.server';
import { Logger } from '@/lib/logger';
import {
  NULL_FILTER_VALUE,
  buildDateRangeFiltersWhere,
  buildSearchWhere,
  buildTextFiltersWhere,
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

const logger = new Logger('Formularios/list/actions.server');

// ============================================================================
// CONSTANTES
// ============================================================================

/** Columnas con filtro de texto libre (IDs de columna == campo en Prisma) */
const TEXT_FILTER_COLUMNS = ['name', 'description', 'code'];

/** Columnas con filtro de rango de fechas */
const DATE_RANGE_COLUMNS = ['created_at'];

/** Columnas facetadas */
const FACET_COLUMNS = ['is_active', 'source'];

/** Únicas claves de URL que filtran esta tabla; el resto se descarta antes de armar el `where`. */
const ALLOWED_FILTER_KEYS = new Set([...FACET_COLUMNS, ...TEXT_FILTER_COLUMNS, ...dateRangeKeys(DATE_RANGE_COLUMNS)]);

/**
 * Las dos fuentes (custom_form legacy + checklist_templates) se unen, ordenan y paginan EN MEMORIA:
 * por eso cada una se trae con tope. Si una fuente lo alcanza, el listado queda truncado a sus filas
 * más recientes (se avisa por log).
 */
const UNION_MAX_ROWS_PER_SOURCE = 2_000;

/** Tope de filas de un export: más que esto no se descarga entero (se pide acotar con filtros). */
const EXPORT_MAX_ROWS = 10_000;

/** Campos válidos para sort (whitelist explícita; el orden se resuelve en memoria). */
const VALID_SORT_FIELDS = new Set([
  'name',
  'created_at',
  'is_active',
  'total_responses',
  'source',
  'code',
  'description',
]);

type FormSource = 'checklist_template' | 'custom_form';

// ============================================================================
// TIPOS INTERNOS
// ============================================================================

type ListState = ReturnType<typeof parseSearchParams>;

function parseListState(searchParams: DataTableSearchParams | undefined): ListState {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

// ============================================================================
// WHERE (compartido entre listado, export y facets)
// ============================================================================

/** Condiciones de `is_active` (nullable en checklist_templates) a partir de los valores del filtro. */
function buildIsActiveCondition(values: string[] | undefined) {
  if (!values?.length) return null;
  const conditions: { is_active: boolean | null }[] = [];
  if (values.includes('true')) conditions.push({ is_active: true });
  if (values.includes('false')) conditions.push({ is_active: false });
  if (values.includes(NULL_FILTER_VALUE)) conditions.push({ is_active: null });
  if (!conditions.length) return null;
  return conditions.length === 1 ? conditions[0] : { OR: conditions };
}

/**
 * Resuelve qué fuentes entran y con qué `where`. custom_form no tiene `is_active` (siempre activo), `code`
 * ni columna `description` (vive en el JSON `form`): un filtro por `code` la excluye, y uno por `description`
 * busca en el JSON (sensible a mayúsculas, limitación del filtro JSON de Prisma).
 */
function buildWhereClause(state: ListState, companyId: string) {
  const sourceFilter = state.filters['source'];
  const isActiveValues = state.filters['is_active'];

  const includeChecklist = !sourceFilter?.length || sourceFilter.includes('checklist_template');
  const customFormMatchesActive = !isActiveValues?.length || isActiveValues.includes('true');
  const codeFilter = state.filters['code']?.[0];
  const includeCustomForm =
    (!sourceFilter?.length || sourceFilter.includes('custom_form')) && customFormMatchesActive && !codeFilter;

  const dateFiltersWhere = buildDateRangeFiltersWhere(state.filters, DATE_RANGE_COLUMNS);
  const isActiveCondition = buildIsActiveCondition(isActiveValues);

  const checklistWhere = withCompany(
    {
      ...buildSearchWhere(state.search, ['name', 'description', 'code']),
      ...buildTextFiltersWhere(state.filters, TEXT_FILTER_COLUMNS),
      ...dateFiltersWhere,
      // En AND: la condición puede ser un OR y pisaría el OR de la búsqueda global.
      ...(isActiveCondition ? { AND: [isActiveCondition] } : {}),
    },
    companyId
  );

  const descriptionFilter = state.filters['description']?.[0];
  const customFormWhere = withCompany(
    {
      ...buildSearchWhere(state.search, ['name']),
      ...buildTextFiltersWhere(state.filters, ['name']),
      ...dateFiltersWhere,
      ...(descriptionFilter ? { form: { path: ['description'], string_contains: descriptionFilter } } : {}),
    },
    companyId
  );

  return { includeChecklist, includeCustomForm, checklistWhere, customFormWhere };
}

// ============================================================================
// FETCH + TRANSFORMACIÓN
// ============================================================================

function mapChecklistTemplate(t: {
  id: string;
  name: string;
  description: string | null;
  code: string;
  is_active: boolean | null;
  created_at: Date | null;
  _count: { checklist_answers: number };
}) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    code: t.code as string | null,
    source: 'checklist_template' as FormSource,
    is_active: t.is_active,
    created_at: t.created_at,
    total_responses: t._count.checklist_answers,
  };
}

function mapCustomForm(f: {
  id: string;
  name: string;
  form: unknown;
  created_at: Date;
  _count: { form_answers: number };
}): ReturnType<typeof mapChecklistTemplate> {
  const formData = f.form as Record<string, string> | null;
  return {
    id: f.id,
    name: formData?.title || f.name,
    description: formData?.description || null,
    code: null,
    source: 'custom_form',
    is_active: true, // custom_form no tiene is_active: siempre activo
    created_at: f.created_at,
    total_responses: f._count.form_answers,
  };
}

async function fetchForms(where: ReturnType<typeof buildWhereClause>, limit: number) {
  const [checklists, customForms] = await Promise.all([
    where.includeChecklist
      ? prisma.checklist_templates.findMany({
          where: where.checklistWhere,
          orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
          take: limit,
          select: {
            id: true,
            name: true,
            description: true,
            code: true,
            is_active: true,
            created_at: true,
            _count: { select: { checklist_answers: true } },
          },
        })
      : Promise.resolve([]),
    where.includeCustomForm
      ? prisma.custom_form.findMany({
          where: where.customFormWhere,
          orderBy: [{ created_at: 'desc' }, { id: 'asc' }],
          take: limit,
          select: {
            id: true,
            name: true,
            form: true,
            created_at: true,
            _count: { select: { form_answers: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    items: [...checklists.map(mapChecklistTemplate), ...customForms.map(mapCustomForm)],
    checklistCount: checklists.length,
    customFormCount: customForms.length,
  };
}

type FormRow = ReturnType<typeof mapChecklistTemplate>;

/** Comparador: inactivos siempre al final; luego los sorts del usuario (multi-sort) y por fecha desc. */
function compareForms(sorting: ListState['sorting']) {
  const userSorts = sorting.filter((s) => VALID_SORT_FIELDS.has(s.id));

  return (a: FormRow, b: FormRow) => {
    const aInactive = a.is_active === false;
    const bInactive = b.is_active === false;
    if (aInactive !== bInactive) return aInactive ? 1 : -1;

    for (const sort of userSorts) {
      const dir = sort.desc ? -1 : 1;
      const aVal = a[sort.id as keyof FormRow];
      const bVal = b[sort.id as keyof FormRow];

      if (aVal == null && bVal == null) continue;
      if (aVal == null) return dir;
      if (bVal == null) return -dir;

      let diff: number;
      if (aVal instanceof Date && bVal instanceof Date) diff = aVal.getTime() - bVal.getTime();
      else if (typeof aVal === 'number' && typeof bVal === 'number') diff = aVal - bVal;
      else if (typeof aVal === 'boolean' && typeof bVal === 'boolean') diff = Number(aVal) - Number(bVal);
      else diff = String(aVal).localeCompare(String(bVal), 'es', { sensitivity: 'base' });

      if (diff !== 0) return diff * dir;
    }

    return (b.created_at?.getTime() ?? 0) - (a.created_at?.getTime() ?? 0) || a.id.localeCompare(b.id);
  };
}

// ============================================================================
// PAGINATED QUERY
// ============================================================================

export async function getFormsPaginated(searchParams: DataTableSearchParams) {
  await requireFormsPermission('view');
  try {
    const state = parseListState(searchParams);
    const companyId = await getActiveCompanyId();

    const { items, checklistCount, customFormCount } = await fetchForms(
      buildWhereClause(state, companyId),
      UNION_MAX_ROWS_PER_SOURCE
    );
    if (checklistCount >= UNION_MAX_ROWS_PER_SOURCE || customFormCount >= UNION_MAX_ROWS_PER_SOURCE) {
      logger.warn('Listado de formularios truncado por el tope de la unión en memoria', {
        data: { companyId, checklistCount, customFormCount, limit: UNION_MAX_ROWS_PER_SOURCE },
      });
    }

    const sorted = items.sort(compareForms(state.sorting));

    // Paginación en memoria (se combinan 2 fuentes)
    const { skip, take } = clampedPageParams(state);
    return { data: sorted.slice(skip, skip + take), total: sorted.length };
  } catch (error) {
    logger.error('Error al obtener formularios paginados', { data: { error } });
    throw new Error('No se pudo obtener la lista de formularios. Intente nuevamente.');
  }
}

/** Fila del listado, inferida del retorno de la query (NUNCA tipada a mano). */
export type FormListItem = Awaited<ReturnType<typeof getFormsPaginated>>['data'][number];

// ============================================================================
// EXPORT QUERY (sin paginación, con tope)
// ============================================================================

/**
 * Filas del export con los mismos filtros de la tabla, hasta `EXPORT_MAX_ROWS`. Si se supera (o no hay
 * permiso) devuelve `{ ok: false, message }`: Next enmascara el mensaje de un error lanzado desde una server
 * action. El cliente lo abre con `unwrapExportResult`.
 */
export async function getAllFormsForExport(searchParams: DataTableSearchParams): Promise<ExportResult<FormListItem[]>> {
  try {
    if (!(await canForms('view'))) return { ok: false, message: 'No tenés permiso para exportar formularios' };

    const state = parseListState(searchParams);
    const companyId = await getActiveCompanyId();

    const { items } = await fetchForms(buildWhereClause(state, companyId), EXPORT_MAX_ROWS + 1);
    if (items.length > EXPORT_MAX_ROWS) {
      return {
        ok: false,
        message: `La exportación supera el máximo de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} filas. Aplicá filtros para acotarla.`,
      };
    }

    return { ok: true, data: items.sort(compareForms(state.sorting)) };
  } catch (error) {
    logger.error('Error al exportar formularios', { data: { error } });
    return { ok: false, message: 'No se pudo exportar la lista de formularios. Intente nuevamente.' };
  }
}

// ============================================================================
// SINGLE FACET (lazy-load, con cross-filtering)
// ============================================================================

type FacetResponse = { counts: Map<string, number> };

/**
 * Counts de UNA columna facetada, sin su propio filtro (cross-filter). `is_active` suma a checklist_templates
 * las plantillas custom_form (siempre activas); `source` cuenta cada fuente por separado.
 */
export async function getFormsSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResponse | null> {
  await requireFormsPermission('view');

  if (!FACET_COLUMNS.includes(columnId)) {
    logger.warn('getFormsSingleFacet: columnId desconocido', { data: { columnId } });
    return null;
  }

  try {
    const companyId = await getActiveCompanyId();
    const where = buildWhereClause(withoutOwnFilter(parseListState(searchParams), columnId), companyId);

    if (columnId === 'is_active') {
      const [checklistRows, customFormCount] = await Promise.all([
        where.includeChecklist
          ? prisma.checklist_templates.groupBy({ by: ['is_active'], where: where.checklistWhere, _count: true })
          : Promise.resolve([]),
        where.includeCustomForm ? prisma.custom_form.count({ where: where.customFormWhere }) : Promise.resolve(0),
      ]);

      return {
        counts: toFacetMap([
          ...checklistRows.map((row) => ({ key: row.is_active, count: row._count })),
          ...(customFormCount > 0 ? [{ key: true, count: customFormCount }] : []),
        ]),
      };
    }

    // source
    const [checklistCount, customFormCount] = await Promise.all([
      where.includeChecklist ? prisma.checklist_templates.count({ where: where.checklistWhere }) : Promise.resolve(0),
      where.includeCustomForm ? prisma.custom_form.count({ where: where.customFormWhere }) : Promise.resolve(0),
    ]);

    return {
      counts: toFacetMap([
        ...(checklistCount > 0 ? [{ key: 'checklist_template', count: checklistCount }] : []),
        ...(customFormCount > 0 ? [{ key: 'custom_form', count: customFormCount }] : []),
      ]),
    };
  } catch (error) {
    logger.error('Error al obtener facet de formularios', { data: { error, columnId } });
    return null;
  }
}
