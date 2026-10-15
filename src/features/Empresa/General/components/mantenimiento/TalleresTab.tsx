import { getTablePreferences } from '@/shared/actions/table-preferences';
import { fetchAllWorkshops } from '../../actions/workshops.server';
import { TalleresTabClient } from './talleres/TalleresTabClient';

/**
 * Sección Talleres, montable por sí sola.
 *
 * Antes venía empaquetada con Sectores dentro de `MantenimientoTab`, que tenía su propio
 * `TabsManagerClient` con `paramName="mantenimiento-subtab"`. Al unificar las 4 subtabs de
 * configuración de mantenimiento en una sola fila, ese manager intermedio dejó de tener
 * sentido: habría dado dos filas de pestañas anidadas.
 *
 * La promesa de `fetchAllWorkshops()` se pasa SIN await a propósito: el cliente la consume
 * con `use()`, así el componente no bloquea el render de la sección.
 */
function TalleresTab() {
  const workshops = fetchAllWorkshops();
  const preferences = getTablePreferences('workshops');

  return <TalleresTabClient workshops={workshops} preferences={preferences} />;
}

export default TalleresTab;
