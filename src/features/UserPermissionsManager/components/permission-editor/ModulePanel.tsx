'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { getModuleIcon } from '@/shared/constants/module-icons';
import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { sortActions } from '../../lib/action-order';
import {
  countDependentsOfView,
  keysOfTabs,
  moduleTabIds,
  permissionKey,
  type PermissionIndex,
} from '../../lib/permission-rules';
import type { ModuleSearchResult } from '../../lib/permission-search';
import {
  MODULE_STATUS_LABEL,
  getGroupAccess,
  summarizeModule,
  summarizeModuleBrief,
  type ModuleAccess,
} from '../../lib/permission-summary';
import type {
  OverrideState,
  PermissionModule,
  PermissionPreset,
  PermissionTab,
  RoleSourceRef,
} from '../../lib/permission-types';
import { RoleActionToggle, UserActionToggle } from './ActionToggle';
import { InheritedNotes, getInheritedNotes } from './permission-notes';

export interface RoleModeHandlers {
  onToggle: (key: string, on: boolean) => void;
}

export interface UserModeHandlers {
  getState: (key: string) => OverrideState;
  roleSources: ReadonlyMap<string, RoleSourceRef[]>;
  overrides: ReadonlyMap<string, boolean>;
  setState: (key: string, state: OverrideState) => void;
  resetOverrides: (tabIds: string[]) => void;
}

interface ModulePanelProps {
  module: PermissionModule;
  index: PermissionIndex;
  granted: ReadonlySet<string>;
  search: ModuleSearchResult | null;
  onlyGranted: boolean;
  disabled: boolean;
  addon?: ReactNode;
  onPreset: (tabIds: string[], preset: PermissionPreset) => void;
  role?: RoleModeHandlers;
  user?: UserModeHandlers;
}

const PRESET_LABELS: Record<PermissionPreset, string> = { none: 'Sin acceso', view: 'Solo ver', all: 'Todo' };

const STATUS_TO_PRESET: Record<ModuleAccess['status'], PermissionPreset | ''> = {
  none: 'none',
  view: 'view',
  full: 'all',
  custom: '',
};

/** Sangría por nivel de la vista dentro de su sección (clases completas). */
const DEPTH_INDENT: Record<number, string> = {
  0: '',
  1: '@xl:border-l @xl:pl-5',
  2: '@xl:border-l @xl:pl-10',
};

function PresetGroup({
  access,
  label,
  disabled,
  onPreset,
}: {
  access: ModuleAccess;
  label: string;
  disabled: boolean;
  onPreset: (preset: PermissionPreset) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={STATUS_TO_PRESET[access.status]}
      disabled={disabled}
      aria-label={label}
      onValueChange={(value) => {
        if (value) onPreset(value as PermissionPreset);
      }}
      className="flex-wrap"
    >
      {(Object.keys(PRESET_LABELS) as PermissionPreset[]).map((preset) => (
        <ToggleGroupItem key={preset} value={preset} className="h-9 text-xs">
          {PRESET_LABELS[preset]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

type Row = { tab: PermissionTab; depth: number; parents: string[] };

function flattenSection(section: PermissionTab): Row[] {
  const rows: Row[] = [];
  const visit = (tab: PermissionTab, depth: number, parents: string[]) => {
    rows.push({ tab, depth, parents });
    for (const subtab of tab.subtabs) visit(subtab, depth + 1, [...parents, tab.name]);
  };
  visit(section, 0, []);
  return rows;
}

/** Vistas (pestañas) de un módulo, agrupadas por sección, con sus acciones y atajos. */
export function ModulePanel({
  module,
  index,
  granted,
  search,
  onlyGranted,
  disabled,
  addon,
  onPreset,
  role,
  user,
}: ModulePanelProps) {
  const Icon = getModuleIcon(module.slug);
  const allTabIds = moduleTabIds(index, module);
  const moduleAccess = getGroupAccess(index, allTabIds, granted);
  const summary = summarizeModule(module, granted);

  const isRowVisible = (tab: PermissionTab) => {
    if (search && !search.tabIds.has(tab.id)) return false;
    if (onlyGranted && !tab.actions.some((action) => granted.has(permissionKey(tab.id, action.id)))) return false;
    return tab.actions.length > 0 || tab.subtabs.length === 0;
  };

  const sections = module.tabs
    .map((section) => ({ section, rows: flattenSection(section).filter((row) => isRowVisible(row.tab)) }))
    .filter(({ rows }) => rows.length > 0);

  const renderActions = (tab: PermissionTab) => {
    if (tab.actions.length === 0) {
      return <p className="text-muted-foreground text-xs">Esta vista no tiene acciones propias.</p>;
    }
    return (
      <div className="grid gap-2 @lg:grid-cols-2 @4xl:grid-cols-3">
        {sortActions(tab.actions).map((action) => {
          const key = permissionKey(tab.id, action.id);
          const isGranted = granted.has(key);
          const highlighted = search?.actionKeys.has(key) ?? false;

          if (user) {
            return (
              <UserActionToggle
                key={action.id}
                action={action}
                tabName={tab.name}
                state={user.getState(key)}
                effective={isGranted}
                roles={user.roleSources.get(key) ?? []}
                disabled={disabled}
                highlighted={highlighted}
                onStateChange={(state) => user.setState(key, state)}
              />
            );
          }

          const dependents = action.slug === 'view' && isGranted ? countDependentsOfView(granted, index, tab.id) : 0;
          return (
            <RoleActionToggle
              key={action.id}
              action={action}
              tabName={tab.name}
              pressed={isGranted}
              disabled={disabled}
              highlighted={highlighted}
              hint={
                dependents > 0
                  ? dependents === 1
                    ? 'Sin esto se pierde 1 permiso activo'
                    : `Sin esto se pierden ${dependents} permisos activos`
                  : null
              }
              onPressedChange={(on) => role?.onToggle(key, on)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="@container space-y-4">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-balance">{module.name}</h3>
              <p className="text-muted-foreground text-sm tabular-nums">
                {MODULE_STATUS_LABEL[moduleAccess.status]} · {moduleAccess.granted} de {moduleAccess.total} permisos
              </p>
            </div>
          </div>
          <PresetGroup
            access={moduleAccess}
            label={`Atajos para todo ${module.name}`}
            disabled={disabled}
            onPreset={(preset) => onPreset(allTabIds, preset)}
          />
        </div>
        <p className="text-muted-foreground line-clamp-3 text-sm text-pretty">
          {summary.length > 0 ? `${summarizeModuleBrief(summary)}.` : 'Sin acceso a ninguna vista de este módulo.'}
        </p>
      </header>

      {sections.length === 0 ? (
        <StateBlock
          variant="empty"
          title={
            search ? 'Ninguna vista de este módulo coincide con la búsqueda' : 'Sin vistas con acceso en este módulo'
          }
          className="rounded-xl border border-dashed"
        />
      ) : (
        sections.map(({ section, rows }) => {
          const sectionTabIds = index.tabs.get(section.id)?.subtreeIds ?? [section.id];
          const sectionAccess = getGroupAccess(index, sectionTabIds, granted);
          const overrideCount = user
            ? keysOfTabs(index, sectionTabIds).filter((key) => user.overrides.has(key)).length
            : 0;

          return (
            <SectionCard
              key={section.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {section.name}
                  <Badge variant="outline" className="font-normal tabular-nums">
                    {sectionAccess.granted}/{sectionAccess.total}
                  </Badge>
                </span>
              }
              description={section.description}
              className="overflow-hidden"
            >
              <div className="@container space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <PresetGroup
                    access={sectionAccess}
                    label={`Atajos para ${section.name}`}
                    disabled={disabled}
                    onPreset={(preset) => onPreset(sectionTabIds, preset)}
                  />
                  {user && overrideCount > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={disabled}
                      onClick={() => user.resetOverrides(sectionTabIds)}
                      className="h-9"
                    >
                      <RotateCcw aria-hidden="true" className="size-3.5" />
                      Volver a lo de sus roles ({overrideCount})
                    </Button>
                  ) : null}
                </div>
                {rows.map(({ tab, depth, parents }) => (
                  <div key={tab.id} className={cn('space-y-2.5', DEPTH_INDENT[Math.min(depth, 2)])}>
                    {depth > 0 ? (
                      <div>
                        {depth > 1 ? (
                          <p className="text-muted-foreground text-xs">{parents.slice(1).join(' › ')}</p>
                        ) : null}
                        <h4 className="text-sm font-semibold">{tab.name}</h4>
                        {tab.description ? (
                          <p className="text-muted-foreground text-xs text-pretty">{tab.description}</p>
                        ) : null}
                      </div>
                    ) : null}
                    <InheritedNotes notes={getInheritedNotes(module.slug, tab.slug)} />
                    {renderActions(tab)}
                  </div>
                ))}
              </div>
            </SectionCard>
          );
        })
      )}

      {addon && !search && !onlyGranted ? <SectionCard>{addon}</SectionCard> : null}
    </div>
  );
}
