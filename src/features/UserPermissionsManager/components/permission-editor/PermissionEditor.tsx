'use client';

import { useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { applyPreset, applyToggle, pairFromKey, permissionKey, type PermissionIndex } from '../../lib/permission-rules';
import { searchPermissions } from '../../lib/permission-search';
import { diffAgainstRoles, getModuleAccess, summarizeAccess } from '../../lib/permission-summary';
import type { PermissionModule, PermissionPair, PermissionPreset } from '../../lib/permission-types';
import { ModulePanel, type UserModeHandlers } from './ModulePanel';
import { ModuleRail, ModuleSelect, SUMMARY_VIEW, type RailEntry } from './ModuleRail';
import { PermissionSearch } from './PermissionSearch';
import { RoleSummary } from './RoleSummary';

interface CommonProps {
  modules: PermissionModule[];
  index: PermissionIndex;
  disabled?: boolean;
  /** Guardando: se atenúa el panel */
  busy?: boolean;
  /** Contenido extra al final de un módulo, por slug (ej. tipos de equipamiento en Mantenimiento) */
  moduleAddons?: Partial<Record<string, ReactNode>>;
}

interface RoleModeProps extends CommonProps {
  mode: 'role';
  permissions: PermissionPair[];
  onPermissionsChange: (permissions: PermissionPair[]) => void;
}

interface UserModeProps extends CommonProps {
  mode: 'user';
  /** Acceso efectivo del usuario (roles + ajustes) */
  effective: ReadonlySet<string>;
  /** Lo que le dan sus roles, sin ajustes */
  fromRoles: ReadonlySet<string>;
  user: UserModeHandlers & { applyPreset: (tabIds: string[], preset: PermissionPreset) => void };
}

export type PermissionEditorProps = RoleModeProps | UserModeProps;

/**
 * Editor de permisos compartido por el rol y por el usuario: rail de módulos con su estado,
 * buscador, panel con las vistas del módulo y sus acciones (qué habilita cada una), y un
 * resumen en lenguaje natural. En modo rol edita un borrador; en modo usuario cada cambio
 * se guarda al instante (lo resuelve quien pasa `user`).
 */
export function PermissionEditor(props: PermissionEditorProps) {
  const { modules, index, disabled = false, busy = false, moduleAddons } = props;
  const [selected, setSelected] = useState<string>(() => modules[0]?.id ?? SUMMARY_VIEW);
  const [query, setQuery] = useState('');
  const [onlyGranted, setOnlyGranted] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const rolePermissions = props.mode === 'role' ? props.permissions : null;
  const roleGranted = useMemo(
    () => new Set((rolePermissions ?? []).map((p) => permissionKey(p.tabId, p.actionId))),
    [rolePermissions]
  );
  const granted: ReadonlySet<string> = props.mode === 'role' ? roleGranted : props.effective;

  const search = useMemo(() => searchPermissions(modules, deferredQuery), [modules, deferredQuery]);

  const entries: RailEntry[] = useMemo(
    () =>
      modules
        .map((module) => ({
          module,
          access: getModuleAccess(index, module, granted),
          matches: search ? search.byModule.get(module.id)?.tabIds.size ?? 0 : null,
        }))
        .filter((entry) => entry.matches === null || entry.matches > 0),
    [modules, index, granted, search]
  );

  // Con búsqueda, si el módulo elegido no tiene coincidencias se muestra el primero que sí.
  const activeView =
    selected === SUMMARY_VIEW || entries.some((entry) => entry.module.id === selected)
      ? selected
      : entries[0]?.module.id ?? SUMMARY_VIEW;
  const activeModule = modules.find((module) => module.id === activeView) ?? null;

  const handlePreset = (tabIds: string[], preset: PermissionPreset) => {
    if (disabled) return;
    if (props.mode === 'role') {
      props.onPermissionsChange(toPairs(applyPreset(granted, index, tabIds, preset)));
    } else {
      props.user.applyPreset(tabIds, preset);
    }
  };

  const handleToggle = (key: string, on: boolean) => {
    if (disabled || props.mode !== 'role') return;
    props.onPermissionsChange(toPairs(applyToggle(granted, index, key, on)));
  };

  const summaryLead =
    props.mode === 'user' ? <UserDiffLead {...diffAgainstRoles(index, props.effective, props.fromRoles)} /> : null;

  const railProps = {
    entries,
    selected: activeView,
    summaryLabel: 'Qué puede hacer',
    onSelect: setSelected,
  };

  return (
    <div className="@container space-y-4">
      <PermissionSearch
        query={query}
        onQueryChange={setQuery}
        resultCount={search ? search.total : null}
        onlyGranted={onlyGranted}
        onOnlyGrantedChange={setOnlyGranted}
        onlyGrantedLabel="Solo con acceso"
      />

      <div className="grid gap-4 @3xl:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="@3xl:hidden">
          <ModuleSelect {...railProps} />
        </div>
        <nav
          aria-label="Módulos del editor de permisos"
          className="hidden @3xl:sticky @3xl:top-0 @3xl:block @3xl:max-h-[calc(100dvh-10rem)] @3xl:self-start @3xl:overflow-y-auto @3xl:pr-1"
        >
          <ModuleRail {...railProps} />
        </nav>

        <div
          className={busy || query !== deferredQuery ? 'min-w-0 opacity-70 transition-opacity' : 'min-w-0'}
          aria-busy={busy}
        >
          {activeView === SUMMARY_VIEW || !activeModule ? (
            <RoleSummary
              summaries={summarizeAccess(index, modules, granted)}
              totalModules={modules.length}
              emptyTitle={props.mode === 'role' ? 'Este rol todavía no habilita nada' : 'Este usuario no tiene acceso'}
              lead={summaryLead}
              onOpenModule={setSelected}
            />
          ) : (
            <ModulePanel
              key={activeModule.id}
              module={activeModule}
              index={index}
              granted={granted}
              search={search?.byModule.get(activeModule.id) ?? null}
              onlyGranted={onlyGranted}
              disabled={disabled}
              addon={activeModule.slug ? moduleAddons?.[activeModule.slug] : undefined}
              onPreset={handlePreset}
              role={props.mode === 'role' ? { onToggle: handleToggle } : undefined}
              user={props.mode === 'user' ? props.user : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function toPairs(keys: ReadonlySet<string>): PermissionPair[] {
  return Array.from(keys, pairFromKey);
}

function UserDiffLead({ extra, removed }: { extra: number; removed: number }) {
  if (extra === 0 && removed === 0) {
    return <p className="text-muted-foreground text-sm">Tiene exactamente lo que le dan sus roles.</p>;
  }
  return (
    <p className="text-sm tabular-nums">
      Diferencias con sus roles:{' '}
      {extra > 0 ? <span className="text-ok-subtle-foreground font-medium">+{extra} concedidos</span> : null}
      {extra > 0 && removed > 0 ? ' · ' : null}
      {removed > 0 ? <span className="text-danger font-medium">−{removed} quitados</span> : null}
    </p>
  );
}
