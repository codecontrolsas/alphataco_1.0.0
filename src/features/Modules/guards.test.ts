import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { moduleForExternalResource } from './catalog';

/**
 * Lista CERRADA de las guardas de módulo de F3.3 (jobs, APIs, archivos, rutas públicas y actions sin permisos). Un test de
 * texto: falla si alguien saca la guarda de un punto de entrada, o agrega una ruta de API sin dueño. No reemplaza a las
 * pruebas de comportamiento (jobs, handlers); evita que el cableado se pierda sin que ninguna lo note.
 *
 * Las actions con permisos (`checkPermissionServer`, `denyUnless`, `assert*Allowed`) NO están acá: `get_user_permissions`
 * ya excluye las pestañas de un módulo apagado (capa 1), así que se cortan solas.
 */
const SRC = path.resolve(__dirname, '../..');

function read(relative: string): string {
  return readFileSync(path.join(SRC, relative), 'utf8');
}

function routeFiles(dir: string): string[] {
  const absolute = path.join(SRC, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const full = path.join(absolute, entry);
    const relative = path.join(dir, entry);
    return statSync(full).isDirectory() ? routeFiles(relative) : entry === 'route.ts' ? [relative] : [];
  });
}

describe('guardas de módulo (F3.3)', () => {
  it('todo recurso de la API externa tiene una clave dueña en el catálogo', () => {
    const resources = readdirSync(path.join(SRC, 'app/api/external/v1'));
    expect(resources.length).toBeGreaterThan(0);
    for (const resource of resources) {
      expect(moduleForExternalResource(resource), `recurso ${resource} sin dueño`).not.toBeNull();
    }
  });

  it('toda ruta autenticada de la API móvil declara su `module`', () => {
    const exempt = ['capabilities', 'session', 'me'];
    const missing = routeFiles('app/api/mobile/v1').filter((file) => {
      if (exempt.some((name) => file.includes(`/v1/${name}/`))) return false;
      const source = read(file);
      return !/module: '[a-z]+'/.test(source) && !source.includes('employeeSectionRoute(');
    });
    expect(missing).toEqual([]);
    expect(read('features/MobileApi/employees/routes.ts')).toContain("module: 'empleados'");
  });

  const closedList: [string, string[]][] = [
    ['features/Jobs/lib/per-company.ts', ['moduleForJob(params.job)', 'readEnabledModules']],
    ['features/Jobs/jobs/daily-indicators.ts', ["has('operaciones')", 'uuidArray']],
    ['features/ExternalApi/lib/handler.ts', ['moduleForExternalResource(endpoint)', 'MODULE_DISABLED']],
    ['features/MobileApi/lib/handler.ts', ["enabled.has('movil')", 'MODULE_DISABLED']],
    ['app/api/mobile/v1/capabilities/route.ts', ['mobileModulesFor(']],
    ['app/api/mobile/v1/me/route.ts', ['mobileModulesFor(']],
    ['features/MobileApi/employees/queries.server.ts', ["isModuleEnabledForCompany('documentacion'"]],
    ['app/api/files/[bucket]/[...path]/route.ts', ['moduleForBucket(bucket)', 'isModuleEnabledForCompany']],
    ['shared/actions/storage.server.ts', ['moduleForBucket(', 'isModuleEnabled(owner)']],
    ['app/maintenance/page.tsx', ["requireInstanceRoute('/maintenance')"]],
    ['app/maintenance/equipment/[id]/page.tsx', ['requireEquipmentRoute(']],
    ['app/maintenance/equipment/[id]/checklists/page.tsx', ['requireEquipmentRoute(']],
    ['app/maintenance/equipment/[id]/checklists/[checklistId]/page.tsx', ['requireEquipmentRoute(']],
    ['app/maintenance/equipment/[id]/request/page.tsx', ['requireEquipmentRoute(']],
    ['app/maintenance/equipment/[id]/tire-service/page.tsx', ['requireEquipmentRoute(']],
    ['app/operator/page.tsx', ["requireInstanceRoute('/operator')"]],
    ['app/operator/login/page.tsx', ["requireInstanceRoute('/operator')"]],
    ['app/operator/(panel)/layout.tsx', ["requireCompanyRoute('/operator'"]],
    ['app/clothing/page.tsx', ["requireInstanceRoute('/clothing')"]],
    ['app/clothing/login/page.tsx', ["requireInstanceRoute('/clothing')"]],
    ['app/clothing/(panel)/layout.tsx', ["requireCompanyRoute('/clothing'"]],
    ['app/portal/activate/page.tsx', ['assertPortalEnabled(null)']],
    ['features/Portal/actions/session.server.ts', ['isPortalEnabled(employee.company_id)']],
    ['features/Portal/actions/perimeter.ts', ["ModuleDisabledError('portal')"]],
    ['features/OperatorPanel/actions/perimeter.ts', ["isModuleEnabledForCompany('mantenimiento'"]],
    ['features/Clothing/actions/perimeter.ts', ["isModuleEnabledForCompany('indumentaria'"]],
    ['features/Mantenimiento/actions/maintenance-actions.ts', ["isRouteEnabledForCompany('/maintenance'"]],
    ['features/Mantenimiento/shared/resource-access.server.ts', ['options?.modules', 'ModuleDisabledError']],
    ['features/Mantenimiento/shared/utils/uploadRepairImages.ts', ["modules: ['mantenimiento']"]],
    ['features/Mantenimiento/Gomeria/Ordenes/utils/uploadDiscardPhoto.ts', ["modules: ['gomeria']"]],
    ['features/Mantenimiento/Gomeria/Ordenes/actions/tire-service-qr.server.ts', ["modules: ['gomeria']"]],
    ['features/Mantenimiento/NuevoPedido/actions/requests.server.ts', ["modules: ['mantenimiento']"]],
    ['features/Mantenimiento/NuevoPedido/actions/orders.server.ts', ["modules: ['mantenimiento']"]],
    ['features/Mantenimiento/SolicitudesMantenimiento/actions/mutations.server.ts', ["modules: ['mantenimiento']"]],
    ['features/Checklists/actions/actionsServer.ts', ["modules: ['checklists', 'formularios']"]],
  ];

  it.each(closedList)('%s conserva su guarda', (file, expected) => {
    const source = read(file);
    for (const fragment of expected) expect(source, `${file} perdió «${fragment}»`).toContain(fragment);
  });
});
