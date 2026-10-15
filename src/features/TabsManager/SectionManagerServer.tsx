import { createTabVisibilityChecker } from '@/features/Permissions/lib/tab-visibility';
import type { ModuleSlug } from '@/features/Permissions/permissions-map';
import { SectionNav } from './components/SectionNav';
import type { SectionManagerServerProps } from './types';

/**
 * SectionManagerServer — monta UNA sección de un módulo, sin barra de pestañas.
 *
 * Reemplaza a `TabsManagerServer` en el primer nivel de los 9 módulos. La navegación entre
 * secciones la hace el sidebar (un sub-item por sección, `?tab=<value>`), así que una fila de
 * pestañas arriba sería la misma navegación dibujada por segunda vez.
 *
 * Además de lo visual, el cambio es de rendimiento y es el motivo de fondo: `TabsManagerServer`
 * entrega TODAS las tabs a un Client Component, y pasarle elementos de servidor como props
 * obliga a renderizarlos a todos. Medido en Mantenimiento (7 secciones), el payload traía las
 * siete y el DOM montaba una. Acá se resuelve la sección activa en el servidor y sólo se
 * renderiza esa: el resto queda como objetos que nadie arma.
 *
 * El array `tabs` de cada módulo NO cambia: sigue siendo la declaración de sus secciones, que es
 * lo que alimenta los permisos y lo que el sidebar espeja.
 */
export async function SectionManagerServer<M extends ModuleSlug = ModuleSlug>({
  paramName,
  tabs,
  defaultTab,
  searchParams,
  permissions,
  actions,
  sectionNav = false,
}: SectionManagerServerProps<M>) {
  const resolvedSearchParams = await searchParams;

  // Misma regla que usa el sidebar para decidir qué secciones ofrece.
  const isTabVisible = createTabVisibilityChecker(permissions);

  const visibleTabs = tabs.filter((tab) => {
    // Sin moduleSlug/tabSlug no hay permiso que verificar: se muestra siempre.
    if (!tab.moduleSlug || !tab.tabSlug) return true;
    return isTabVisible(String(tab.moduleSlug), String(tab.tabSlug));
  });

  if (visibleTabs.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <p className="text-muted-foreground font-medium">Sin acceso</p>
          <p className="text-muted-foreground text-sm">No tenés permisos para ver ninguna sección acá.</p>
        </div>
      </div>
    );
  }

  // Mismo criterio que tenía la barra de pestañas: manda la URL; si el valor no existe o el
  // usuario no puede verlo, cae a la primera sección visible (que es el `defaultTab` declarado
  // en los 9 módulos, verificado uno por uno).
  const paramValue = resolvedSearchParams[paramName];
  const requested = typeof paramValue === 'string' ? paramValue : defaultTab;
  const activeTab = visibleTabs.find((tab) => tab.value === requested) ?? visibleTabs[0];

  return (
    <div className="flex h-full flex-col gap-4">
      {(!activeTab.hideTitle || actions) && (
        <div className="flex items-center justify-between gap-4">
          {!activeTab.hideTitle && <h1 className="text-2xl font-semibold tracking-tight">{activeTab.label}</h1>}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {sectionNav && visibleTabs.length > 1 && (
        <SectionNav
          paramName={paramName}
          activeValue={activeTab.value}
          ariaLabel="Secciones"
          items={visibleTabs.map((tab) => ({ value: tab.value, label: tab.label, counter: tab.navCounter }))}
        />
      )}

      {activeTab.content}
    </div>
  );
}
