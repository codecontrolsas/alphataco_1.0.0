'use server';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { Logger } from '@/lib/logger';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { computeDiagramIndicators, computeEmployeeIndicators } from '../lib/rrhh-indicators.server';
import type { DiagramIndicatorResult, EmployeeIndicatorResult } from './types';

const logger = new Logger('features/Dashboard/Principal/rrhh');

/**
 * Personal del dashboard principal: indicador de uso y distribución por diagrama.
 *
 * Perímetro: la empresa sale de `getActiveCompanyId()`. Los `positionIds` que manda el
 * cliente sólo acotan el listado y se sanean antes de entrar al SQL — ver
 * `lib/position-filter`, que además deja el filtro fallando CERRADO.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Indicadores
// ─────────────────────────────────────────────────────────────────────────────

/** Indicador de uso de personal: operativos (con diagrama de trabajo hoy) vs. usados en el parte. */
export async function getEmployeeIndicators(positionIds?: string[]): Promise<EmployeeIndicatorResult> {
  await requireDashboardView('principal');
  logger.debug('Obteniendo indicadores de empleados', { data: { positionIds } });

  try {
    return await computeEmployeeIndicators(await getActiveCompanyId(), positionIds);
  } catch (error) {
    logger.error('Error al obtener indicadores de empleados', { data: { error } });
    // Sin dato no hay 0: un indicador en 0 % se leería como "nadie está en operación".
    throw error;
  }
}

/** Cantidad de empleados por tipo de diagrama para el día de hoy. */
export async function getDiagramIndicators(positionIds?: string[]): Promise<DiagramIndicatorResult[]> {
  await requireDashboardView('principal');
  logger.debug('Obteniendo indicadores de diagramas', { data: { positionIds } });

  try {
    return await computeDiagramIndicators(await getActiveCompanyId(), positionIds);
  } catch (error) {
    logger.error('Error al obtener indicadores de diagramas', { data: { error } });
    throw error;
  }
}

/**
 * Puestos de la empresa activa, para el filtro del tablero.
 *
 * Perímetro: `company_positions` tiene `company_id`; antes se devolvían los puestos de
 * TODAS las empresas, que además son los valores que el filtro manda de vuelta.
 */
export async function getAllPositions() {
  await requireDashboardView('principal');
  logger.debug('Obteniendo todas las posiciones');

  try {
    const companyId = await getActiveCompanyId();

    return await prisma.company_positions.findMany({
      where: withCompany({}, companyId),
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener posiciones', { data: { error } });
    throw error;
  }
}
