import 'server-only';

import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';

/** Lectura de Gráficos de KPIs: exige `view` en Configuración › KPIs › Gráficos. */
export async function assertCanViewKpiCharts(): Promise<void> {
  if (!(await checkPermissionServer('configuracion', 'graficos', 'view'))) {
    throw new Error('No tenés permiso para ver los gráficos de KPIs');
  }
}
