'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getModuleIcon } from '@/shared/constants/module-icons';
import { ListChecks } from 'lucide-react';
import { useRef, type KeyboardEvent } from 'react';
import { MODULE_STATUS_LABEL, type ModuleAccess, type ModuleAccessStatus } from '../../lib/permission-summary';
import type { PermissionModule } from '../../lib/permission-types';

/** Valor del rail que muestra el resumen en vez de un módulo. */
export const SUMMARY_VIEW = 'summary';

export interface RailEntry {
  module: PermissionModule;
  access: ModuleAccess;
  /** Coincidencias de la búsqueda en el módulo (null = sin búsqueda) */
  matches: number | null;
}

const STATUS_DOT: Record<ModuleAccessStatus, string> = {
  none: 'bg-muted-foreground/30',
  view: 'bg-info',
  full: 'bg-ok',
  custom: 'bg-warn',
};

function entryCaption(entry: RailEntry): string {
  if (entry.matches !== null) return `${entry.matches} ${entry.matches === 1 ? 'coincidencia' : 'coincidencias'}`;
  return MODULE_STATUS_LABEL[entry.access.status];
}

interface ModuleRailProps {
  entries: RailEntry[];
  selected: string;
  summaryLabel: string;
  onSelect: (value: string) => void;
}

/**
 * Lista de módulos del editor (desde anchos medianos): cada uno con su estado y "x de y"
 * permisos. Funciona con flechas arriba/abajo, Inicio y Fin (la selección sigue al foco).
 */
export function ModuleRail({ entries, selected, summaryLabel, onSelect }: ModuleRailProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const values = [SUMMARY_VIEW, ...entries.map((entry) => entry.module.id)];

  const focusValue = (value: string) => {
    onSelect(value);
    listRef.current?.querySelector<HTMLElement>(`[data-value="${value}"]`)?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = Math.max(0, values.indexOf(selected));
    const nextIndex =
      event.key === 'ArrowDown'
        ? Math.min(values.length - 1, currentIndex + 1)
        : event.key === 'ArrowUp'
          ? Math.max(0, currentIndex - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? values.length - 1
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    focusValue(values[nextIndex]);
  };

  const optionClass = (isSelected: boolean) =>
    cn(
      'focus-visible:ring-ring flex w-full min-h-11 items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2',
      isSelected ? 'bg-brand-subtle text-brand-subtle-foreground' : 'hover:bg-muted/70'
    );

  return (
    <div ref={listRef} role="listbox" aria-label="Módulos" onKeyDown={handleKeyDown} className="space-y-0.5">
      <button
        type="button"
        role="option"
        aria-selected={selected === SUMMARY_VIEW}
        tabIndex={selected === SUMMARY_VIEW ? 0 : -1}
        data-value={SUMMARY_VIEW}
        onClick={() => onSelect(SUMMARY_VIEW)}
        className={optionClass(selected === SUMMARY_VIEW)}
      >
        <ListChecks aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-medium">{summaryLabel}</span>
      </button>
      <div aria-hidden="true" className="bg-border my-1.5 h-px" />
      {entries.map((entry) => {
        const isSelected = selected === entry.module.id;
        const Icon = getModuleIcon(entry.module.slug);
        return (
          <button
            key={entry.module.id}
            type="button"
            role="option"
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            data-value={entry.module.id}
            onClick={() => onSelect(entry.module.id)}
            className={optionClass(isSelected)}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{entry.module.name}</span>
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden="true"
                  className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[entry.access.status])}
                />
                {entryCaption(entry)}
              </span>
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {entry.access.granted}/{entry.access.total}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Selector de módulo para anchos chicos, donde no entra el rail. */
export function ModuleSelect({ entries, selected, summaryLabel, onSelect }: ModuleRailProps) {
  return (
    <Select value={selected} onValueChange={onSelect}>
      <SelectTrigger aria-label="Módulo" className="h-11 w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SUMMARY_VIEW}>{summaryLabel}</SelectItem>
        {entries.map((entry) => (
          <SelectItem key={entry.module.id} value={entry.module.id}>
            {entry.module.name} · {entryCaption(entry)} ({entry.access.granted}/{entry.access.total})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
