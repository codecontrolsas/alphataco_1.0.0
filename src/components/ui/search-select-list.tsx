'use client';

import { CheckIcon } from 'lucide-react';
import { useMemo, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { SearchSelectOption, SearchSelectValue } from '@/components/ui/search-select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCount, formatNumber, type CountNoun } from '@/shared/utils/formatters';

/** Estado de "Seleccionar todo" sobre las opciones habilitadas que se ven en la lista. */
export type SearchSelectAllState = { selected: number; total: number; onToggle: () => void };

export type SearchSelectListState = 'ready' | 'loading' | 'error';

type SearchSelectListProps<V extends SearchSelectValue> = {
  variant: 'popover' | 'drawer';
  search: string;
  onSearchChange: (search: string) => void;
  searchPlaceholder: string;
  /** Texto de la línea de estado. Vacío = no hay nada que decir (la región sigue montada). */
  statusText: string;
  options: SearchSelectOption<V>[];
  selected: ReadonlySet<V>;
  onSelect: (option: SearchSelectOption<V>) => void;
  selectAll: SearchSelectAllState | null;
  state: SearchSelectListState;
  onRetry: () => void;
  /** Backspace con el buscador vacío (en múltiple quita el último elegido). */
  onBackspaceEmpty: (() => void) | null;
};

const SELECT_ALL_VALUE = '__search-select-all__';
const SKELETON_ROWS = [0, 1, 2];

/**
 * Buscador + aviso + lista. La comparten el popover (desktop) y el drawer (mobile).
 * El filtro lo hace `SearchSelect` (local) o el servidor (async): cmdk nunca vuelve a filtrar (`shouldFilter={false}`).
 */
export function SearchSelectList<V extends SearchSelectValue>({
  variant,
  search,
  onSearchChange,
  searchPlaceholder,
  statusText,
  options,
  selected,
  onSelect,
  selectAll,
  state,
  onRetry,
  onBackspaceEmpty,
}: SearchSelectListProps<V>) {
  const groups = useMemo(() => groupOptions(options), [options]);
  const isDrawer = variant === 'drawer';

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && search === '' && onBackspaceEmpty) onBackspaceEmpty();
  }

  return (
    <Command
      shouldFilter={false}
      loop
      className={cn(
        'bg-transparent',
        isDrawer ? 'min-h-0 flex-1 [&_[data-slot=command-input-wrapper]]:h-11 [&_[data-slot=command-input-wrapper]]:px-4' : ''
      )}
    >
      <CommandInput
        value={search}
        onValueChange={onSearchChange}
        onKeyDown={handleKeyDown}
        placeholder={searchPlaceholder}
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={isDrawer ? 'h-11' : ''}
      />
      {/* Fuera del área que scrollea y siempre montada: una región `status` que aparece y desaparece no se anuncia. */}
      <p
        role="status"
        aria-live="polite"
        data-slot="search-select-status"
        className={cn(
          'text-caption text-muted-foreground tabular-nums',
          statusText ? 'border-border border-b px-3 py-1.5' : 'sr-only',
          isDrawer && statusText ? 'px-4' : ''
        )}
      >
        {statusText}
      </p>
      <CommandList
        aria-busy={state === 'loading' ? true : undefined}
        className={isDrawer ? 'max-h-none min-h-0 flex-1' : ''}
      >
        {state === 'loading' ? (
          <div className="flex flex-col gap-1 p-1" aria-hidden="true">
            {SKELETON_ROWS.map((row) => (
              <Skeleton key={row} className="h-8 w-full" />
            ))}
          </div>
        ) : state === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-2 px-3 py-4 text-sm">
            <span>No se pudieron cargar las opciones.</span>
            <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            {selectAll ? (
              <CommandGroup>
                <CommandItem
                  value={SELECT_ALL_VALUE}
                  onSelect={selectAll.onToggle}
                  aria-checked={selectAll.selected === selectAll.total}
                  className={isDrawer ? 'min-h-11' : ''}
                >
                  <CheckMark checked={selectAll.selected === selectAll.total} />
                  <span>Seleccionar todo</span>
                  <span className="text-muted-foreground ml-auto tabular-nums">
                    {selectAll.selected}/{selectAll.total}
                  </span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {groups.map((group) => (
              <CommandGroup key={group.heading ?? ''} heading={group.heading ?? undefined}>
                {group.options.map((option) => (
                  <SearchSelectItem
                    key={String(option.value)}
                    option={option}
                    checked={selected.has(option.value)}
                    onSelect={onSelect}
                    tall={isDrawer}
                  />
                ))}
              </CommandGroup>
            ))}
          </>
        )}
      </CommandList>
    </Command>
  );
}

function SearchSelectItem<V extends SearchSelectValue>({
  option,
  checked,
  onSelect,
  tall,
}: {
  option: SearchSelectOption<V>;
  checked: boolean;
  onSelect: (option: SearchSelectOption<V>) => void;
  tall: boolean;
}) {
  return (
    <CommandItem
      value={String(option.value)}
      disabled={option.disabled}
      onSelect={() => onSelect(option)}
      aria-checked={checked}
      data-checked={checked || undefined}
      title={option.label}
      className={tall ? 'min-h-11' : ''}
    >
      <CheckMark checked={checked} />
      <span className="flex min-w-0 flex-1 flex-col">
        <OptionText code={option.code} label={option.label} />
        {option.description ? (
          <span className="text-caption text-muted-foreground truncate">{option.description}</span>
        ) : null}
      </span>
      {option.hint ? <span className="text-caption text-warning-text shrink-0">{option.hint}</span> : null}
    </CommandItem>
  );
}

function CheckMark({ checked }: { checked: boolean }) {
  return <CheckIcon aria-hidden="true" className={cn('text-foreground size-4', checked ? 'opacity-100' : 'opacity-0')} />;
}

/** `[código] Label`, con el código en mono (legajo, dominio, interno, CUIT). Lo usan la lista y el trigger. */
export function OptionText({ code, label }: { code?: string; label: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5">
      {code ? <span className="data-code text-muted-foreground shrink-0">[{code}]</span> : null}
      <span className="truncate">{label}</span>
    </span>
  );
}

type OptionGroup<V extends SearchSelectValue> = { heading: string | null; options: SearchSelectOption<V>[] };

/** Agrupa por `group` respetando el orden en que aparece cada grupo (el filtro ya ordenó por relevancia). */
function groupOptions<V extends SearchSelectValue>(options: SearchSelectOption<V>[]): OptionGroup<V>[] {
  const byHeading = new Map<string | null, SearchSelectOption<V>[]>();
  for (const option of options) {
    const heading = option.group ?? null;
    const bucket = byHeading.get(heading);
    if (bucket) bucket.push(option);
    else byHeading.set(heading, [option]);
  }
  return Array.from(byHeading, ([heading, grouped]) => ({ heading, options: grouped }));
}

// ── Línea de estado ───────────────────────────────────────────────────────────

const CHARACTER_NOUN: CountNoun = { one: 'carácter', other: 'caracteres' };

type StatusInput = {
  state: SearchSelectListState;
  belowMinChars: boolean;
  minChars: number;
  searching: boolean;
  /** Texto buscado, ya recortado. */
  search: string;
  total: number;
  shown: number;
  /** Tope alcanzado en múltiple con `onMax="ignore"`; `null` si no aplica. */
  maxReached: number | null;
  emptyMessage: string | undefined;
  noun: CountNoun;
};

/** Qué dice la región `status` entre el buscador y la lista. Vacío cuando no hay nada que decir. */
export function getStatusText(input: StatusInput): string {
  const { state, search, total, noun } = input;
  if (state === 'loading') return 'Cargando…';
  if (input.belowMinChars) return `Escribí al menos ${formatCount(input.minChars, CHARACTER_NOUN)}.`;
  if (input.searching) return 'Buscando…';
  // El error se muestra dentro de la lista, con `role="alert"` y "Reintentar".
  if (state === 'error') return '';
  if (total === 0) {
    return search ? (input.emptyMessage ?? `Sin resultados para «${search}».`) : `No hay ${noun.other} para elegir.`;
  }
  if (input.maxReached !== null) return `Llegaste al máximo de ${formatCount(input.maxReached, noun)}.`;
  if (total > input.shown) {
    return `Mostrando ${formatNumber(input.shown)} de ${formatCount(total, noun)}. Escribí para afinar.`;
  }
  return '';
}

// ── Filtro local ──────────────────────────────────────────────────────────────

export type IndexedOption<V extends SearchSelectValue> = {
  option: SearchSelectOption<V>;
  label: string;
  code: string;
  haystack: string;
};

export type FilterResult<V extends SearchSelectValue> = { visible: SearchSelectOption<V>[]; total: number };

export const EMPTY_RESULT: FilterResult<never> = { visible: [], total: 0 };

const DIACRITICS_RE = /[\u0300-\u036f]/g;
const WHITESPACE_RE = /\s+/;

function normalize(text: string): string {
  return text.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();
}

/** Normaliza una vez por opción (no por tecla): acentos, mayúsculas y todos los campos buscables. */
export function indexOptions<V extends SearchSelectValue>(options: SearchSelectOption<V>[]): IndexedOption<V>[] {
  return options.map((option) => {
    const label = normalize(option.label);
    const code = option.code ? normalize(option.code) : '';
    const extra = [option.description, ...(option.keywords ?? [])].filter(Boolean).map((text) => normalize(String(text)));
    return { option, label, code, haystack: [code, label, ...extra].join(' ') };
  });
}

/** Todas las palabras tienen que aparecer; primero las que empiezan con el texto (label o código). */
export function filterIndexed<V extends SearchSelectValue>(
  index: IndexedOption<V>[],
  search: string,
  limit: number
): FilterResult<V> {
  const query = normalize(search.trim());
  if (!query) return { visible: index.slice(0, limit).map((entry) => entry.option), total: index.length };

  const tokens = query.split(WHITESPACE_RE);
  const prefixed: SearchSelectOption<V>[] = [];
  const rest: SearchSelectOption<V>[] = [];
  for (const entry of index) {
    if (!tokens.every((token) => entry.haystack.includes(token))) continue;
    if (entry.label.startsWith(query) || (entry.code !== '' && entry.code.startsWith(query))) prefixed.push(entry.option);
    else rest.push(entry.option);
  }

  const total = prefixed.length + rest.length;
  const visible =
    prefixed.length >= limit ? prefixed.slice(0, limit) : prefixed.concat(rest.slice(0, limit - prefixed.length));
  return { visible, total };
}
