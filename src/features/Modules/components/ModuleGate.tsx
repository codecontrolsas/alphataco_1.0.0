import type { ReactNode } from 'react';
import type { ModuleKey } from '../catalog';
import { isModuleEnabled } from '../server/modules.server';

/**
 * Muestra `children` solo si la clave está encendida para la empresa activa (F3). Es para lo que NO pasa por un permiso
 * (los permisos ya excluyen las pestañas de los módulos apagados): un chip, una tarjeta o un botón cruzado entre módulos.
 *
 * Componente de servidor: una sola consulta por request (`getEnabledModules`, con `cache()`). Para un componente de
 * cliente, calcular el booleano en el padre de servidor y pasarlo como prop (sin provider de cliente). Si lee la base
 * fuera de un `<Suspense>`, envolverlo en uno (con `cacheComponents` el build lo exige).
 */
export async function ModuleGate({
  module,
  children,
  fallback = null,
}: {
  module: ModuleKey;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return (await isModuleEnabled(module)) ? children : fallback;
}
