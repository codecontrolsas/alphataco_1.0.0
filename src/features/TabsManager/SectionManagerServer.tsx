import type { ModuleSlug } from '@/features/Permissions/permissions-map';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { resolveActiveEntry } from './lib/resolve-active';
import type { SectionManagerServerProps } from './types';

/**
 * SectionManagerServer — monta UNA sección de un módulo, sin barra de pestañas.
 *
 * La navegación entre secciones la hace el sidebar (un sub-item por sección, `?tab=<value>`).
 * Bajo `md`, donde el sidebar está oculto, el `PageHeader` ofrece un selector de secciones.
 * Los contadores de sección viven como badges en los sub-items del sidebar.
 *
 * Se resuelve la sección activa en el servidor y solo se renderiza esa.
 */
export async function SectionManagerServer<M extends ModuleSlug = ModuleSlug>({
  paramName,
  tabs,
  defaultTab,
  searchParams,
  permissions,
  actions,
}: SectionManagerServerProps<M>) {
  const resolvedSearchParams = await searchParams;
  const { visible: visibleTabs, active: activeTab } = resolveActiveEntry(
    tabs,
    permissions,
    resolvedSearchParams,
    paramName,
    defaultTab
  );

  if (!activeTab) {
    return (
      <StateBlock variant="noperm" title="Sin acceso" description="No tenés permisos para ver ninguna sección acá." />
    );
  }

  const navItems = visibleTabs.map((tab) => ({ value: tab.value, label: tab.label, href: tab.href }));
  const hasMultiple = visibleTabs.length > 1;

  return (
    <div className="flex h-full flex-col gap-4">
      {(!activeTab.hideTitle || actions || hasMultiple) && (
        <PageHeader
          title={activeTab.hideTitle ? null : activeTab.label}
          description={activeTab.description}
          actions={actions}
          sections={hasMultiple ? { items: navItems, activeValue: activeTab.value, paramName } : undefined}
        />
      )}

      {activeTab.content}
    </div>
  );
}
