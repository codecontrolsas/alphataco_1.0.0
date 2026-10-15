'use server';

import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { callScalar } from '@/shared/lib/sql';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { CreateKPIInput, KPI, KPIRevision, UpdateKPIInput, UpdateKPINumberInput } from '../types';

const logger = new Logger('KPIs/actions');

/**
 * Perímetro de los KPIs.
 *
 * La empresa sale SIEMPRE de `getActiveCompanyId()`; antes cada action leía a mano la
 * cookie de empresa. Los ids de KPI llegan del cliente, así que todas las lecturas y
 * escrituras van acotadas a la empresa activa: sin esto, con el uuid de un KPI ajeno se
 * podía leer, editar o dar de baja el indicador de otra empresa.
 */
async function assertKpiInActiveCompany(kpiId: string): Promise<string> {
  const companyId = await getActiveCompanyId();

  const kpi = await prisma.kpis.findFirst({ where: { id: kpiId, company_id: companyId }, select: { id: true } });
  if (!kpi) throw new Error('El KPI no pertenece a la empresa activa');

  return companyId;
}

const KPI_SELECT = {
  id: true,
  company_id: true,
  name: true,
  code: true,
  number: true,
  validity_date: true,
  calculation_formula: true,
  technical_support: true,
  improvement_opportunities: true,
  filters: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} as const;

type KpiRow = Prisma.kpisGetPayload<{ select: typeof KPI_SELECT }>;

const KPI_REVISION_SELECT = {
  id: true,
  kpi_id: true,
  previous_number: true,
  new_number: true,
  previous_validity_date: true,
  new_validity_date: true,
  change_reason: true,
  changed_by: true,
  is_active: true,
  created_at: true,
} as const;

type KpiRevisionRow = Prisma.kpi_revisionsGetPayload<{ select: typeof KPI_REVISION_SELECT }>;

/**
 * Columna `@db.Date` de Postgres → `YYYY-MM-DD`.
 *
 * Prisma devuelve esas columnas como `Date` a medianoche UTC. Si sale el ISO completo, el
 * modal (que corre en el navegador y formatea con `moment`) la interpreta en la zona local
 * y en UTC-3 muestra el día anterior. Misma convención que `Mantenimiento/utils/dateFormat`.
 */
function toDateOnly(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

/** Columna `timestamptz` → ISO completo: acá la hora sí es parte del dato. */
function toTimestamp(value: Date | null | undefined, fallback?: string): string | null {
  if (!value) return fallback ?? null;
  return value.toISOString();
}

/** Fila de Prisma → DTO de la UI. */
function mapKPIRowToKPI(row: KpiRow): KPI {
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    code: row.code,
    number: row.number,
    validity_date: toDateOnly(row.validity_date) as string,
    calculation_formula: row.calculation_formula,
    technical_support: row.technical_support ?? true,
    improvement_opportunities: row.improvement_opportunities,
    filters: (row.filters ?? null) as Record<string, unknown> | null,
    is_active: row.is_active ?? true,
    created_at: toTimestamp(row.created_at, new Date().toISOString()) as string,
    updated_at: toTimestamp(row.updated_at, new Date().toISOString()) as string,
  };
}

function mapKPIRevisionRowToKPIRevision(row: KpiRevisionRow): KPIRevision {
  return {
    id: row.id,
    kpi_id: row.kpi_id,
    previous_number: row.previous_number,
    new_number: row.new_number,
    previous_validity_date: toDateOnly(row.previous_validity_date),
    new_validity_date: toDateOnly(row.new_validity_date),
    change_reason: row.change_reason,
    changed_by: row.changed_by,
    is_active: row.is_active ?? true,
    created_at: toTimestamp(row.created_at, new Date().toISOString()) as string,
  };
}

/**
 * `filters` del formulario → valor para la columna `jsonb`.
 *
 * Sin filtros va `Prisma.DbNull`, que escribe NULL. Devolver `undefined` haría que Prisma
 * OMITA el campo, así que un `filters: null` no podría limpiar lo guardado — y PostgREST
 * sí escribía NULL. Hoy el tipo del input no admite null, pero la trampa queda cerrada.
 */
function toFiltersInput(filters: Record<string, unknown> | null | undefined) {
  return filters ? (filters as Prisma.InputJsonValue) : Prisma.DbNull;
}

/**
 * Revisiones activas de un KPI, de la más nueva a la más vieja.
 * Perímetro: el KPI tiene que ser de la empresa activa.
 */
export async function fetchKPIRevisions(kpi_id: string): Promise<KPIRevision[]> {
  if (!(await checkPermissionServer('configuracion', 'indicadores', 'view'))) {
    throw new Error('No tenés permiso para ver los indicadores');
  }
  try {
    await assertKpiInActiveCompany(kpi_id);

    const rows = await prisma.kpi_revisions.findMany({
      where: { kpi_id, is_active: true },
      select: KPI_REVISION_SELECT,
      orderBy: { created_at: 'desc' },
    });

    return rows.map(mapKPIRevisionRowToKPIRevision);
  } catch (error) {
    logger.error('Error fetching KPI revisions', { data: { error, kpi_id } });
    return [];
  }
}

/** Resultado «sin permiso»: misma forma que un error de la acción, la UI lo muestra en el toast. */
const FORBIDDEN_RESULT = { data: null, error: { message: 'No tenés permiso para modificar los KPIs' } } as const;

/**
 * Crea un KPI en la empresa activa.
 * El código lo genera la función SQL `generate_kpi_code(company_uuid)` (vía `callScalar`).
 */
export async function createKPI(input: CreateKPIInput): Promise<{ data: KPI | null; error: unknown }> {
  if (!(await checkPermissionServer('configuracion', 'kpis', 'create'))) return FORBIDDEN_RESULT;
  try {
    const companyId = await getActiveCompanyId();

    const generatedCode = await callScalar('generate_kpi_code', [{ uuid: companyId }], z.string().nullable());

    const created = await prisma.kpis.create({
      data: {
        company_id: companyId,
        name: input.name,
        code: generatedCode || 'KPI-0001',
        number: input.number || null,
        validity_date: new Date(input.validity_date),
        calculation_formula: input.calculation_formula,
        technical_support: input.technical_support ?? true,
        improvement_opportunities: null,
        filters: toFiltersInput(input.filters),
        is_active: input.is_active ?? true,
      },
      select: KPI_SELECT,
    });

    revalidatePath('/dashboard');
    return { data: mapKPIRowToKPI(created), error: null };
  } catch (error) {
    logger.error('Error creating KPI', { data: { error } });
    return { data: null, error };
  }
}

/** Campos que el formulario de edición puede tocar. */
const UPDATABLE_FIELDS = [
  'name',
  'number',
  'calculation_formula',
  'technical_support',
  'improvement_opportunities',
  'filters',
  'is_active',
] as const satisfies readonly (keyof UpdateKPIInput)[];

/**
 * Edita un KPI de la empresa activa (sólo los campos presentes en el input).
 */
export async function updateKPI(input: UpdateKPIInput): Promise<{ data: KPI | null; error: unknown }> {
  if (!(await checkPermissionServer('configuracion', 'kpis', 'update'))) return FORBIDDEN_RESULT;
  try {
    await assertKpiInActiveCompany(input.id);

    const updateData: Prisma.kpisUpdateInput = {};
    for (const field of UPDATABLE_FIELDS) {
      const value = input[field];
      if (value === undefined) continue;
      if (field === 'filters') {
        updateData.filters = toFiltersInput(value as Record<string, unknown>);
      } else {
        Object.assign(updateData, { [field]: value });
      }
    }

    const updated = await prisma.kpis.update({ where: { id: input.id }, data: updateData, select: KPI_SELECT });

    revalidatePath('/dashboard');
    return { data: mapKPIRowToKPI(updated), error: null };
  } catch (error) {
    logger.error('Error updating KPI', { data: { error, id: input.id } });
    return { data: null, error };
  }
}

/**
 * Cambia número y vigencia de un KPI y deja la revisión correspondiente.
 *
 * La actualización y la revisión van en una transacción: antes la revisión se insertaba
 * después y, si fallaba, el KPI quedaba cambiado sin rastro de quién lo hizo.
 */
export async function updateKPINumber(input: UpdateKPINumberInput): Promise<{ data: KPI | null; error: unknown }> {
  if (!(await checkPermissionServer('configuracion', 'kpis', 'update'))) return FORBIDDEN_RESULT;
  try {
    const credentialId = await getSessionUserId();
    if (!credentialId) return { data: null, error: { message: 'User not authenticated' } };

    await assertKpiInActiveCompany(input.kpi_id);

    const currentKPI = await prisma.kpis.findUnique({
      where: { id: input.kpi_id },
      select: { number: true, validity_date: true },
    });
    if (!currentKPI) return { data: null, error: { message: 'KPI not found' } };

    const newValidityDate = new Date(input.new_validity_date);

    const updatedKPI = await prisma.$transaction(async (tx) => {
      const updated = await tx.kpis.update({
        where: { id: input.kpi_id },
        data: { number: input.new_number, validity_date: newValidityDate },
        select: KPI_SELECT,
      });

      await tx.kpi_revisions.create({
        data: {
          kpi_id: input.kpi_id,
          previous_number: currentKPI.number,
          new_number: input.new_number,
          previous_validity_date: currentKPI.validity_date,
          new_validity_date: newValidityDate,
          change_reason: input.change_reason,
          // FK a `profile.credential_id`: es el id de sesión, no `profile.id`.
          changed_by: credentialId,
        },
      });

      return updated;
    });

    revalidatePath('/dashboard');
    return { data: mapKPIRowToKPI(updatedKPI), error: null };
  } catch (error) {
    logger.error('Error updating KPI number', { data: { error, kpi_id: input.kpi_id } });
    return { data: null, error };
  }
}
