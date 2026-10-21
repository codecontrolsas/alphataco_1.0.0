'use server';

import { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { configPermissionError, requireConfigTabPermission } from '../../lib/config-access.server';
import { issuesOfCargo, wouldCreateCycle } from './lib/org-chart-rules';
import {
  orgChartCargoSchema,
  orgChartCargoUpdateSchema,
  type OrgChartCargoInput,
  type OrgChartCargoUpdateInput,
} from './schemas/org-chart';

const logger = new Logger('features/Empresa/General/OrgChart');

/**
 * Resultado de las mutaciones del organigrama. El error viaja como dato: Next reemplaza el mensaje
 * de un `Error` lanzado en una Server Action por un texto genérico en producción.
 */
export type OrgChartMutationResult = { ok: true; id: string } | { ok: false; error: string };

const CARGO_SELECT = {
  id: true,
  sector_id: true,
  position_id: true,
  reports_to_id: true,
  sort_order: true,
  sector: { select: { is_active: true } },
  position: { select: { id: true, name: true, is_active: true, hierarchical_position_id: true } },
  employee: {
    select: {
      id: true,
      file: true,
      firstname: true,
      lastname: true,
      is_active: true,
      hierarchical_position: true,
      company_position: true,
    },
  },
} as const;

// ============================================================================
// LECTURAS
// ============================================================================

/**
 * Organigrama completo de la empresa activa: sectores (con su padre) y cargos (con puesto, titular
 * y los avisos de consistencia). Dos consultas en paralelo; el árbol se arma en el cliente.
 *
 * Se muestran los sectores activos y, además, los inactivos que todavía tienen cargos (para que esos
 * cargos no desaparezcan sin aviso) o de los que depende algún sector visible (para no cortar el árbol).
 */
export async function getOrgChart() {
  await requireConfigTabPermission('org-chart', 'view');
  try {
    const companyId = await getActiveCompanyId();
    const [sectors, cargos] = await Promise.all([
      prisma.hierarchy.findMany({
        where: { company_id: companyId },
        select: {
          id: true,
          name: true,
          is_active: true,
          parent_id: true,
          _count: { select: { org_chart_positions: true } },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.org_chart_positions.findMany({
        where: { company_id: companyId },
        select: CARGO_SELECT,
        orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
      }),
    ]);

    const parentOf = new Map(sectors.map((sector) => [sector.id, sector.parent_id]));
    const visible = new Set<string>();
    for (const sector of sectors) {
      if (sector.is_active === false && sector._count.org_chart_positions === 0) continue;
      // El sector y toda su cadena de padres (cortando si los datos tuvieran un ciclo).
      let current: string | null | undefined = sector.id;
      while (current && !visible.has(current)) {
        visible.add(current);
        current = parentOf.get(current);
      }
    }
    const visibleSectors = sectors.filter((sector) => visible.has(sector.id)).map(({ _count, ...sector }) => sector);

    return {
      sectors: visibleSectors,
      cargos: cargos.map(({ sector: _sector, ...cargo }) => ({
        ...cargo,
        position: { id: cargo.position.id, name: cargo.position.name ?? 'Sin nombre' },
        issues: issuesOfCargo({ ...cargo, sector: _sector }),
      })),
    };
  } catch (error) {
    logger.error('Error al obtener el organigrama', { data: { error } });
    throw error;
  }
}

/** Puestos activos que pertenecen al sector (mismo criterio que la ficha del empleado). */
export async function getOrgChartPositionOptions(sectorId: string) {
  await requireConfigTabPermission('org-chart', 'view');
  try {
    const companyId = await getActiveCompanyId();
    const positions = await prisma.company_positions.findMany({
      where: { company_id: companyId, is_active: true, hierarchical_position_id: { has: sectorId } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    return positions.map((position) => ({ id: position.id, name: position.name ?? 'Sin nombre' }));
  } catch (error) {
    logger.error('Error al obtener los puestos del sector', { data: { error, sectorId } });
    throw error;
  }
}

/**
 * Legajos que pueden ser titulares del cargo: activos, con ese sector y ese puesto en su ficha, y
 * que no sean titulares de otro cargo. `cargoId` es el cargo que se edita (su titular actual vale).
 */
export async function getOrgChartTitularOptions(sectorId: string, positionId: string, cargoId?: string) {
  await requireConfigTabPermission('org-chart', 'view');
  try {
    const companyId = await getActiveCompanyId();
    return await prisma.employees.findMany({
      where: {
        company_id: companyId,
        is_active: true,
        hierarchical_position: sectorId,
        company_position: positionId,
        org_chart_positions: { none: cargoId ? { id: { not: cargoId } } : {} },
      },
      select: { id: true, file: true, firstname: true, lastname: true },
      orderBy: [{ lastname: 'asc' }, { firstname: 'asc' }],
    });
  } catch (error) {
    logger.error('Error al obtener los titulares posibles', { data: { error, sectorId, positionId } });
    throw error;
  }
}

// ============================================================================
// VALIDACIÓN COMPARTIDA DE ALTA Y EDICIÓN
// ============================================================================

/**
 * Devuelve el mensaje del primer problema, o `null` si el cargo es válido para la empresa.
 *
 * `previous` es el cargo guardado (en una edición): si su sector y su puesto no cambian, no se exige
 * que sigan activos ni que el puesto siga en el sector. Así un cargo desfasado se puede corregir
 * (cambiarle el titular o el superior) sin obligar a tocar lo que lo desfasó.
 */
async function validateCargo(
  companyId: string,
  input: OrgChartCargoInput,
  previous?: { id: string; sector_id: string; position_id: string }
): Promise<string | null> {
  const cargoId = previous?.id;
  const keepsPlacement =
    !!previous && previous.sector_id === input.sector_id && previous.position_id === input.position_id;
  const [sector, position, reportsTo, employee] = await Promise.all([
    prisma.hierarchy.findFirst({
      where: { id: input.sector_id, company_id: companyId },
      select: { is_active: true },
    }),
    prisma.company_positions.findFirst({
      where: { id: input.position_id, company_id: companyId },
      select: { is_active: true, hierarchical_position_id: true },
    }),
    input.reports_to_id
      ? prisma.org_chart_positions.findFirst({
          where: { id: input.reports_to_id, company_id: companyId },
          select: { id: true },
        })
      : null,
    input.employee_id
      ? prisma.employees.findFirst({
          where: { id: input.employee_id, company_id: companyId },
          select: { is_active: true, hierarchical_position: true, company_position: true },
        })
      : null,
  ]);

  if (!sector) return 'El sector no existe.';
  if (!position) return 'El puesto no existe.';
  if (!keepsPlacement) {
    if (sector.is_active === false) return 'El sector está inactivo.';
    if (position.is_active === false) return 'El puesto está inactivo.';
    if (!position.hierarchical_position_id.includes(input.sector_id)) return 'El puesto no pertenece a este sector.';
  }

  if (input.reports_to_id) {
    if (!reportsTo) return 'El cargo superior no existe.';
    if (cargoId) {
      const all = await prisma.org_chart_positions.findMany({
        where: { company_id: companyId },
        select: { id: true, reports_to_id: true },
      });
      const parentOf = new Map(all.map((cargo) => [cargo.id, cargo.reports_to_id]));
      if (wouldCreateCycle(parentOf, cargoId, input.reports_to_id)) {
        return 'Un cargo no puede reportar a sí mismo ni a uno de los cargos que le reportan.';
      }
    }
  }

  if (input.employee_id) {
    if (!employee) return 'El legajo no existe.';
    if (employee.is_active === false) return 'El legajo está dado de baja.';
    if (employee.hierarchical_position !== input.sector_id || employee.company_position !== input.position_id) {
      return 'El legajo no tiene este sector y este puesto en su ficha.';
    }
  }

  return null;
}

const DUPLICATE_TITULAR = 'Ese legajo ya es titular de otro cargo.';

function isDuplicateTitular(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// ============================================================================
// MUTACIONES
// ============================================================================

export async function createOrgChartCargo(input: OrgChartCargoInput): Promise<OrgChartMutationResult> {
  const denied = await configPermissionError('org-chart', 'create');
  if (denied) return { ok: false, error: denied };

  const parsed = orgChartCargoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    const companyId = await getActiveCompanyId();
    const invalid = await validateCargo(companyId, parsed.data);
    if (invalid) return { ok: false, error: invalid };

    // Al final de los cargos del sector.
    const last = await prisma.org_chart_positions.aggregate({
      where: { company_id: companyId, sector_id: parsed.data.sector_id },
      _max: { sort_order: true },
    });

    const created = await prisma.org_chart_positions.create({
      data: { ...parsed.data, sort_order: (last._max.sort_order ?? -1) + 1 },
      select: { id: true },
    });
    return { ok: true, id: created.id };
  } catch (error) {
    if (isDuplicateTitular(error)) return { ok: false, error: DUPLICATE_TITULAR };
    logger.error('Error al crear el cargo', { data: { error } });
    return { ok: false, error: 'No se pudo crear el cargo. Intentá nuevamente.' };
  }
}

export async function updateOrgChartCargo(input: OrgChartCargoUpdateInput): Promise<OrgChartMutationResult> {
  const denied = await configPermissionError('org-chart', 'update');
  if (denied) return { ok: false, error: denied };

  const parsed = orgChartCargoUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' };

  try {
    const companyId = await getActiveCompanyId();
    const { id, ...data } = parsed.data;
    const owned = await prisma.org_chart_positions.findFirst({
      where: { id, company_id: companyId },
      select: { id: true, sector_id: true, position_id: true },
    });
    if (!owned) return { ok: false, error: 'El cargo no existe.' };

    const invalid = await validateCargo(companyId, data, owned);
    if (invalid) return { ok: false, error: invalid };

    await prisma.org_chart_positions.update({ where: { id }, data, select: { id: true } });
    return { ok: true, id };
  } catch (error) {
    if (isDuplicateTitular(error)) return { ok: false, error: DUPLICATE_TITULAR };
    logger.error('Error al actualizar el cargo', { data: { error } });
    return { ok: false, error: 'No se pudo actualizar el cargo. Intentá nuevamente.' };
  }
}

/**
 * Elimina un cargo. Los cargos que le reportaban pasan a reportarle a su superior, para que la
 * cadena de mando no quede cortada (en una sola transacción).
 */
export async function deleteOrgChartCargo(id: string): Promise<OrgChartMutationResult> {
  const denied = await configPermissionError('org-chart', 'delete');
  if (denied) return { ok: false, error: denied };

  try {
    const companyId = await getActiveCompanyId();
    const cargo = await prisma.org_chart_positions.findFirst({
      where: { id, company_id: companyId },
      select: { id: true, reports_to_id: true },
    });
    if (!cargo) return { ok: false, error: 'El cargo no existe.' };

    await prisma.$transaction([
      prisma.org_chart_positions.updateMany({
        where: { reports_to_id: id, company_id: companyId },
        data: { reports_to_id: cargo.reports_to_id },
      }),
      prisma.org_chart_positions.delete({ where: { id } }),
    ]);
    return { ok: true, id };
  } catch (error) {
    logger.error('Error al eliminar el cargo', { data: { error, id } });
    return { ok: false, error: 'No se pudo eliminar el cargo. Intentá nuevamente.' };
  }
}

// ============================================================================
// TIPOS
// ============================================================================

export type OrgChartData = Awaited<ReturnType<typeof getOrgChart>>;
export type OrgChartSector = OrgChartData['sectors'][number];
export type OrgChartCargo = OrgChartData['cargos'][number];
export type OrgChartPositionOption = Awaited<ReturnType<typeof getOrgChartPositionOptions>>[number];
export type OrgChartTitularOption = Awaited<ReturnType<typeof getOrgChartTitularOptions>>[number];
