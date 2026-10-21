'use server';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import type { DataTableSearchParams, FacetResult } from '@/shared/components/common/DataTable';
import {
  buildSearchWhere,
  buildTextFiltersWhere,
  parseSearchParams,
  stateToPrismaParams,
} from '@/shared/components/common/DataTable/helpers';
import { ExportTooLargeError } from '@/shared/lib/export-batches';
import type { ExportResult } from '@/shared/lib/export-result';
import { prisma } from '@/shared/lib/prisma';
import { sanitizeFilters } from '@/shared/lib/table-filters';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { errorMessage, fail, ok, type ActionResult } from '../lib/action-result';
import { assertComercialView, requireComercialPermission } from '../lib/require-permission.server';
import { measureUnitFormSchema, type MeasureUnitFormValues } from '../schemas/measure-unit';

const logger = new Logger('features/Empresa/Clientes/measure-units');

const COMERCIAL_PATH = '/dashboard/comercial';

/**
 * Unidades de medida: catálogo POR EMPRESA (`company_id` obligatorio, lo completa la base desde la empresa activa).
 */
export async function getMeasureUnits() {
  await assertComercialView(['mensure_units', 'service', 'items-contrato']);
  const companyId = await getActiveCompanyId();
  try {
    return await prisma.measure_units.findMany({ where: { company_id: companyId }, orderBy: { unit: 'asc' } });
  } catch (error) {
    logger.error('Error al obtener unidades de medida', { data: { error } });
    throw error;
  }
}

export type MeasureUnitRow = Awaited<ReturnType<typeof getMeasureUnits>>[number];

// ============================================================================
// Tabla paginada (Comercial › Unidades de medida)
// ============================================================================

const TABLE_TAB = 'mensure_units';
const VALID_SORT_FIELDS = new Set(['simbol', 'unit', 'tipo']);
const ALLOWED_FILTER_KEYS = new Set(['simbol', 'unit', 'tipo']);
const EXPORT_MAX_ROWS = 10_000;

function parseState(searchParams: DataTableSearchParams | undefined) {
  return sanitizeFilters(parseSearchParams(searchParams ?? {}), ALLOWED_FILTER_KEYS);
}

/** Mismo where para lista, export y facets. */
function buildWhereClause(companyId: string, state: ReturnType<typeof parseState>) {
  const tipo = state.filters['tipo'];
  return {
    AND: [
      { company_id: companyId },
      buildSearchWhere(state.search, ['simbol', 'unit', 'tipo']),
      buildTextFiltersWhere(state.filters, ['simbol', 'unit']),
      tipo?.length ? { tipo: { in: tipo } } : {},
    ],
  };
}

function buildOrderBy(state: ReturnType<typeof parseState>) {
  const sorts: Array<Record<string, 'asc' | 'desc'>> = [];
  for (const s of state.sorting) {
    if (VALID_SORT_FIELDS.has(s.id)) sorts.push({ [s.id]: s.desc ? 'desc' : 'asc' });
  }
  return [...sorts, { unit: 'asc' as const }, { id: 'asc' as const }];
}

const LIST_SELECT = { id: true, simbol: true, unit: true, tipo: true } as const;

export async function getMeasureUnitsPaginated(searchParams: DataTableSearchParams) {
  await assertComercialView([TABLE_TAB]);
  const companyId = await getActiveCompanyId();
  try {
    const state = parseState(searchParams);
    const { skip, take } = stateToPrismaParams(state);
    const where = buildWhereClause(companyId, state);
    const [data, total] = await Promise.all([
      prisma.measure_units.findMany({ where, orderBy: buildOrderBy(state), skip, take, select: LIST_SELECT }),
      prisma.measure_units.count({ where }),
    ]);
    return { data, total };
  } catch (error) {
    logger.error('Error al obtener la lista de unidades de medida', { data: { error } });
    throw new Error('No se pudo obtener la lista. Intente nuevamente.');
  }
}

export type MeasureUnitListItem = Awaited<ReturnType<typeof getMeasureUnitsPaginated>>['data'][number];

export async function getAllMeasureUnitsForExport(
  searchParams: DataTableSearchParams
): Promise<ExportResult<MeasureUnitListItem[]>> {
  await assertComercialView([TABLE_TAB]);
  const companyId = await getActiveCompanyId();
  try {
    const state = parseState(searchParams);
    const rows = await prisma.measure_units.findMany({
      where: buildWhereClause(companyId, state),
      orderBy: buildOrderBy(state),
      select: LIST_SELECT,
      take: EXPORT_MAX_ROWS + 1,
    });
    if (rows.length > EXPORT_MAX_ROWS) {
      throw new ExportTooLargeError(
        `Hay más de ${EXPORT_MAX_ROWS.toLocaleString('es-AR')} unidades con los filtros actuales. Acote la exportación con filtros.`
      );
    }
    return { ok: true, data: rows };
  } catch (error) {
    logger.error('Error al exportar unidades de medida', { data: { error } });
    return {
      ok: false,
      message:
        error instanceof ExportTooLargeError
          ? error.message
          : 'No se pudo exportar la lista de unidades. Intente nuevamente.',
    };
  }
}

/** Counts + opciones de UNA columna, con cross-filter (todos los filtros activos salvo el propio). */
export async function getMeasureUnitSingleFacet(
  columnId: string,
  searchParams?: DataTableSearchParams
): Promise<FacetResult | null> {
  await assertComercialView([TABLE_TAB]);
  const companyId = await getActiveCompanyId();
  try {
    const state = parseState(searchParams);
    const crossState = { ...state, filters: { ...state.filters } };
    delete crossState.filters[columnId];
    const where = buildWhereClause(companyId, crossState);

    if (columnId !== 'tipo') return null;
    const rows = await prisma.measure_units.groupBy({ by: ['tipo'], where, _count: true, orderBy: { tipo: 'asc' } });
    return {
      options: rows.map((r) => ({ value: r.tipo, label: r.tipo })),
      counts: new Map(rows.map((r) => [r.tipo, r._count])),
    };
  } catch (error) {
    logger.error('Error al obtener faceta de unidades de medida', { data: { error, columnId } });
    return null;
  }
}

export async function createMeasureUnit(input: MeasureUnitFormValues): Promise<ActionResult<{ id: number }>> {
  const parsed = measureUnitFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const permissionError = await requireComercialPermission('mensure_units', 'create');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();

  try {
    const existing = await prisma.measure_units.findFirst({
      where: { company_id: companyId, simbol: parsed.data.simbol },
      select: { id: true },
    });
    if (existing) return fail('Ya existe una unidad de medida con este símbolo');

    const created = await prisma.measure_units.create({ data: parsed.data, select: { id: true } });
    logger.info('Unidad de medida creada', { data: { id: created.id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id: created.id });
  } catch (error) {
    logger.error('Error al crear unidad de medida', { data: { error } });
    return fail(errorMessage(error, 'Error del servidor al crear la unidad de medida'));
  }
}

export async function updateMeasureUnit(
  id: number,
  input: MeasureUnitFormValues
): Promise<ActionResult<{ id: number }>> {
  const parsed = measureUnitFormSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Datos inválidos');
  const permissionError = await requireComercialPermission('mensure_units', 'update');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();

  try {
    const existing = await prisma.measure_units.findFirst({
      where: { company_id: companyId, simbol: parsed.data.simbol, id: { not: id } },
      select: { id: true },
    });
    if (existing) return fail('Ya existe otra unidad de medida con este símbolo');

    await prisma.measure_units.update({ where: { id, company_id: companyId }, data: parsed.data });
    logger.info('Unidad de medida actualizada', { data: { id } });
    revalidatePath(COMERCIAL_PATH);
    return ok({ id });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('Unidad de medida no encontrada');
    }
    logger.error('Error al actualizar unidad de medida', { data: { error, id } });
    return fail(errorMessage(error, 'Error del servidor al actualizar la unidad de medida'));
  }
}

export async function deleteMeasureUnit(id: number): Promise<ActionResult> {
  const permissionError = await requireComercialPermission('mensure_units', 'delete');
  if (permissionError) return fail(permissionError);
  const companyId = await getActiveCompanyId();
  try {
    const inUse = await prisma.service_items.count({ where: { item_measure_units: id, company_id: companyId } });
    if (inUse > 0) {
      return fail(`No se puede eliminar: la unidad está en uso por ${inUse} item${inUse === 1 ? '' : 's'} de contrato`);
    }
    await prisma.measure_units.delete({ where: { id, company_id: companyId } });
    logger.info('Unidad de medida eliminada', { data: { id } });
    revalidatePath(COMERCIAL_PATH);
    return ok(null);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return fail('Unidad de medida no encontrada');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return fail('No se puede eliminar esta unidad de medida porque está siendo utilizada');
    }
    logger.error('Error al eliminar unidad de medida', { data: { error, id } });
    return fail(errorMessage(error, 'Error del servidor al eliminar la unidad de medida'));
  }
}
