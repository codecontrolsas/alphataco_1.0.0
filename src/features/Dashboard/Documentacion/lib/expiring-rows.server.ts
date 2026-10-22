import 'server-only';

import { requireDashboardView } from '@/features/Dashboard/lib/permissions.server';
import { loadEmployeeDocumentRows } from '@/features/Documentacion/DocumentosEmpleados/lib/employee-document-rows.server';
import { loadEquipmentDocumentRows } from '@/features/Documentacion/DocumentosEquipos/lib/equipment-document-rows.server';
import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { cache } from 'react';
import { selectExpiringRows } from './expiring-documents.server';

/**
 * Filas de la lista "Vencimientos > Personal": documentos de empleados activos que ya vencieron o vencen
 * en los próximos 30 días (motor de cumplimiento, hora argentina), sin faltantes ni "ya no aplica".
 *
 * Memoizado por request: la lista, las facetas y el contador de la vista comparten UNA sola carga.
 */
export const loadEmployeeExpiringRows = cache(async () => {
  await requireDashboardView('empleados');
  const [companyId, canViewPrivate] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('documentacion', 'documentos-de-empleados', 'view_private'),
  ]);
  return selectExpiringRows(await loadEmployeeDocumentRows(companyId, false, canViewPrivate, ''));
});

/** Ídem para equipos (vista "Vencimientos > Equipos"). */
export const loadVehicleExpiringRows = cache(async () => {
  await requireDashboardView('vehiculos');
  const [companyId, canViewPrivate] = await Promise.all([
    getActiveCompanyId(),
    checkPermissionServer('documentacion', 'documentos-de-equipos', 'view_private'),
  ]);
  return selectExpiringRows(await loadEquipmentDocumentRows(companyId, false, canViewPrivate, ''));
});
