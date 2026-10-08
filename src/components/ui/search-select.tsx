'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, XIcon } from 'lucide-react';
import { useDeferredValue, useId, useMemo, useRef, useState, type MouseEvent } from 'react';

import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useResponsiveDialogSurface } from '@/components/ui/responsive-dialog-context';
import { SearchSelectDrawer } from '@/components/ui/search-select-drawer';
import {
  EMPTY_RESULT,
  filterIndexed,
  getStatusText,
  indexOptions,
  OptionText,
  SearchSelectList,
  type SearchSelectAllState,
  type SearchSelectListState,
} from '@/components/ui/search-select-list';
import { cn } from '@/lib/utils';
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '@/shared/hooks/use-media-query';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { formatCount, type CountNoun } from '@/shared/utils/formatters';

export type SearchSelectValue = string | number;

export type SearchSelectOption<V extends SearchSelectValue = string> = {
  value: V;
  /** Texto principal; también es lo que se busca. */
  label: string;
  /** Va antes del label, en mono, y se busca: legajo, dominio, interno, CUIT. */
  code?: string;
  /** Segunda línea en caption (puesto, tipo de equipo). */
  description?: string;
  /** Términos extra de búsqueda. */
  keywords?: string[];
  /** Encabezado de grupo. */
  group?: string;
  disabled?: boolean;
  /** Marca no bloqueante, ej. "No afectado al cliente". */
  hint?: string;
};

type LocalSource<V extends SearchSelectValue> = { options: SearchSelectOption<V>[] };

type AsyncSource<V extends SearchSelectValue> = {
  /** Server action de búsqueda. Lo que devuelve se muestra tal cual: el cliente no vuelve a filtrarlo. */
  search: (query: string, signal: AbortSignal) => Promise<SearchSelectOption<V>[]>;
  /** Primitivos; se le agrega el texto buscado. */
  queryKey: readonly unknown[];
  /** Default 0: sin texto trae la primera página. */
  minChars?: number;
  /** Lo ya elegido, para mostrar sus labels sin buscarlos. */
  selectedOptions: SearchSelectOption<V>[];
};

type SearchSelectBaseProps = {
  placeholder: string;
  /** Default "Buscar…"; empleados: "Buscar por legajo o nombre…". */
  searchPlaceholder?: string;
  /** Default "Sin resultados para «texto»". */
  emptyMessage?: string;
  /** "equipo" / "equipos": arma "Mostrando 50 de 387 equipos". */
  noun: CountNoun;
  /** Tope de opciones renderizadas. Default 50. */
  limit?: number;
  disabled?: boolean;
  /** Opciones locales todavía cargando. */
  loading?: boolean;
  id?: string;
  name?: string;
  className?: string;
  'data-testid'?: string;
  /** Sin `<FormLabel>` asociado por `id`, el control necesita un nombre propio (si falta se usa el placeholder). */
  'aria-label'?: string;
  /** Los inyecta `FormControl` (shadcn) por Slot. */
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
};

type SingleProps<V extends SearchSelectValue> = {
  multiple?: false;
  value: V | null;
  onChange: (value: V | null) => void;
  clearable?: boolean;
};

type MultipleProps<V extends SearchSelectValue> = {
  multiple: true;
  value: V[];
  onChange: (value: V[]) => void;
  max?: number;
  /** Al llegar al tope: ignorar la nueva (default) o reemplazar la más vieja. */
  onMax?: 'ignore' | 'replace-oldest';
  /** "Seleccionar todo (x/y)" sobre las opciones habilitadas visibles. */
  selectAll?: boolean;
};

export type SearchSelectProps<V extends SearchSelectValue = string> = (LocalSource<V> | AsyncSource<V>) &
  SearchSelectBaseProps &
  (SingleProps<V> | MultipleProps<V>);

const DEFAULT_LIMIT = 50;
const DEBOUNCE_MS = 300;
const ASYNC_STALE_TIME = 60_000;
const VISIBLE_CHIPS = 2;
const NO_OPTIONS: never[] = [];

const TRIGGER_SLOT = 'search-select-trigger';

/**
 * Selector con búsqueda, simple o múltiple, con opciones locales o buscadas en el servidor.
 * Desktop: popover del ancho del campo. Mobile (< 768px): panel inferior (drawer anidado si ya está en uno).
 * Devuelve el mismo valor que recibe (`V | null` o `V[]`): las altas/bajas M:M se calculan afuera.
 */
export function SearchSelect<V extends SearchSelectValue = string>(props: SearchSelectProps<V>) {
  const {
    placeholder,
    searchPlaceholder = 'Buscar…',
    emptyMessage,
    noun,
    limit = DEFAULT_LIMIT,
    disabled = false,
    loading = false,
    id,
    name,
    className,
  } = props;
  const isAsync = 'search' in props;
  const minChars = isAsync ? (props.minChars ?? 0) : 0;
  const singleValue = props.multiple ? null : (props.value ?? null);
  const multipleValue = props.multiple ? props.value : null;
  const selectedValues = useMemo<V[]>(
    () => multipleValue ?? (singleValue === null ? NO_OPTIONS : [singleValue]),
    [multipleValue, singleValue]
  );

  const [open, setOpen] = useState(false);
  const [openedAsDrawer, setOpenedAsDrawer] = useState(false);
  const [search, setSearch] = useState('');
  // Opciones elegidas desde una búsqueda async: su label sigue visible aunque cambie el texto buscado.
  const [rememberedOptions, setRememberedOptions] = useState<ReadonlyMap<V, SearchSelectOption<V>>>(() => new Map());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const contentId = useId();

  const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY);
  const surface = useResponsiveDialogSurface();

  // Local: filtro diferido (`rerender-use-deferred-value`). Async: debounce antes de pedir.
  const deferredSearch = useDeferredValue(search);
  const debouncedSearch = useDebouncedValue(search.trim(), isAsync ? DEBOUNCE_MS : 0);
  const belowMinChars = isAsync && search.trim().length < minChars;

  const query = useQuery({
    queryKey: isAsync ? [...props.queryKey, debouncedSearch] : ['search-select', 'local'],
    queryFn: ({ signal }) => (isAsync ? props.search(debouncedSearch, signal) : Promise.resolve(NO_OPTIONS)),
    enabled: isAsync && open && debouncedSearch.length >= minChars,
    placeholderData: keepPreviousData,
    staleTime: ASYNC_STALE_TIME,
    // Sin reintento automático (el default del QueryClient es 1): el error y "Reintentar" aparecen enseguida.
    retry: false,
  });

  const localOptions = isAsync ? NO_OPTIONS : props.options;
  const index = useMemo(() => indexOptions(localOptions), [localOptions]);
  const localResult = useMemo(
    () => (open ? filterIndexed(index, deferredSearch, limit) : EMPTY_RESULT),
    [open, index, deferredSearch, limit]
  );

  const asyncOptions = isAsync && !belowMinChars ? (query.data ?? NO_OPTIONS) : NO_OPTIONS;
  const visible = isAsync ? asyncOptions.slice(0, limit) : localResult.visible;
  const total = isAsync ? asyncOptions.length : localResult.total;

  // Lookup de labels para el trigger y los chips (`js-index-maps`).
  const selectedOptionsProp = isAsync ? props.selectedOptions : NO_OPTIONS;
  const optionsByValue = useMemo(() => {
    const map = new Map<V, SearchSelectOption<V>>(rememberedOptions);
    for (const option of localOptions) map.set(option.value, option);
    for (const option of selectedOptionsProp) map.set(option.value, option);
    return map;
  }, [localOptions, selectedOptionsProp, rememberedOptions]);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

  function handleOpenChange(next: boolean) {
    if (next) {
      if (disabled) return;
      // El modo se fija al abrir: rotar el teléfono con el panel abierto no lo cambia de superficie.
      setOpenedAsDrawer(isMobile);
    } else {
      setSearch('');
    }
    setOpen(next);
  }

  function remember(option: SearchSelectOption<V>) {
    if (!isAsync) return;
    setRememberedOptions((prev) => new Map(prev).set(option.value, option));
  }

  function handleSelect(option: SearchSelectOption<V>) {
    if (option.disabled) return;
    if (!props.multiple) {
      remember(option);
      if (props.value !== option.value) props.onChange(option.value);
      handleOpenChange(false);
      return;
    }
    const current = props.value;
    if (current.includes(option.value)) {
      props.onChange(current.filter((value) => value !== option.value));
      return;
    }
    remember(option);
    if (props.max !== undefined && current.length >= props.max) {
      if (props.onMax !== 'replace-oldest') return;
      props.onChange([...current.slice(current.length - props.max + 1), option.value]);
      return;
    }
    props.onChange([...current, option.value]);
  }

  function removeValue(value: V) {
    if (props.multiple) props.onChange(props.value.filter((item) => item !== value));
  }

  const maxReached = props.multiple && props.max !== undefined && props.value.length >= props.max;

  let selectAll: SearchSelectAllState | null = null;
  if (props.multiple && props.selectAll) {
    const { value: current, onChange, max } = props;
    const enabled = visible.filter((option) => !option.disabled);
    const selectedCount = enabled.reduce((count, option) => count + (selectedSet.has(option.value) ? 1 : 0), 0);
    if (enabled.length > 0) {
      selectAll = {
        selected: selectedCount,
        total: enabled.length,
        onToggle: () => {
          if (selectedCount === enabled.length) {
            const visibleSet = new Set(enabled.map((option) => option.value));
            onChange(current.filter((value) => !visibleSet.has(value)));
            return;
          }
          const missing = enabled.filter((option) => !selectedSet.has(option.value)).map((option) => option.value);
          const room = max === undefined ? missing.length : Math.max(0, max - current.length);
          onChange([...current, ...missing.slice(0, room)]);
        },
      };
    }
  }

  const listState: SearchSelectListState =
    !isAsync && loading ? 'loading' : isAsync && query.isError ? 'error' : 'ready';
  const searching = isAsync && !belowMinChars && (query.isFetching || search.trim() !== debouncedSearch);

  const statusText = getStatusText({
    state: listState,
    belowMinChars,
    minChars,
    searching,
    search: search.trim(),
    total,
    shown: visible.length,
    maxReached: maxReached && props.onMax !== 'replace-oldest' ? (props.max ?? 0) : null,
    emptyMessage,
    noun,
  });

  const ariaLabel = props['aria-label'] ?? (id ? undefined : placeholder);
  const selectedOption = !props.multiple && props.value != null ? optionsByValue.get(props.value) : undefined;
  const hasValue = selectedValues.length > 0;
  const showClear = !props.multiple && props.clearable === true && hasValue && !disabled;

  // Un clic en el borde, el chevron o el hueco entre chips abre igual que el trigger (los botones de los chips no).
  function handleFieldClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('button')) return;
    triggerRef.current?.click();
  }

  const list = (
    <SearchSelectList
      variant={openedAsDrawer ? 'drawer' : 'popover'}
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder={searchPlaceholder}
      statusText={statusText}
      options={visible}
      selected={selectedSet}
      onSelect={handleSelect}
      selectAll={selectAll}
      state={listState}
      onRetry={() => void query.refetch()}
      onBackspaceEmpty={props.multiple && props.value.length > 0 ? () => removeValue(props.value[props.value.length - 1]) : null}
    />
  );

  return (
    <>
      <Popover open={open && !openedAsDrawer} onOpenChange={handleOpenChange}>
        <PopoverAnchor asChild>
          <div
            ref={fieldRef}
            data-slot="search-select"
            data-testid={props['data-testid']}
            data-disabled={disabled || undefined}
            data-invalid={props['aria-invalid'] || undefined}
            onClick={handleFieldClick}
            className={cn(
              'border-input bg-card dark:bg-background hover:border-fg-subtle flex min-h-8 w-full min-w-0 items-center gap-1.5 border px-2.5 text-sm transition-[border-color] duration-(--duration-fast) pointer-coarse:min-h-11',
              'has-[[data-slot=search-select-trigger]:focus-visible]:outline-ring has-[[data-slot=search-select-trigger]:focus-visible]:outline-2 has-[[data-slot=search-select-trigger]:focus-visible]:outline-offset-2 has-[[data-slot=search-select-trigger]:focus-visible]:outline-solid',
              'data-[invalid]:border-danger data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
              className
            )}
          >
            <PopoverTrigger asChild>
              <button
                ref={triggerRef}
                id={id}
                type="button"
                role="combobox"
                data-slot={TRIGGER_SLOT}
                aria-expanded={open}
                aria-controls={open ? contentId : undefined}
                aria-label={ariaLabel}
                aria-invalid={props['aria-invalid']}
                aria-describedby={props['aria-describedby']}
                aria-busy={loading || undefined}
                disabled={disabled}
                className="flex min-h-7 min-w-0 flex-1 items-center text-left outline-none focus-visible:outline-none disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="text-muted-foreground truncate">Cargando…</span>
                ) : props.multiple ? (
                  <span className={cn('truncate', hasValue ? 'tabular-nums' : 'text-muted-foreground')}>
                    {hasValue ? formatCount(props.value.length, noun) : placeholder}
                  </span>
                ) : selectedOption ? (
                  <span className="min-w-0" title={selectedOption.label}>
                    <OptionText code={selectedOption.code} label={selectedOption.label} />
                  </span>
                ) : hasValue ? (
                  <span className="text-muted-foreground truncate">Opción no disponible</span>
                ) : (
                  <span className="text-muted-foreground truncate">{placeholder}</span>
                )}
              </button>
            </PopoverTrigger>
            {props.multiple && hasValue ? (
              <SelectedChips
                values={props.value}
                optionsByValue={optionsByValue}
                onRemove={removeValue}
                disabled={disabled}
              />
            ) : null}
            {showClear ? (
              <button
                type="button"
                aria-label="Limpiar selección"
                onClick={() => {
                  if (props.multiple) return;
                  props.onChange(null);
                  triggerRef.current?.focus();
                }}
                className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex size-6 shrink-0 items-center justify-center pointer-coarse:size-11"
              >
                <XIcon aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
            <ChevronDownIcon aria-hidden="true" className="text-muted-foreground size-4 shrink-0 opacity-50" />
            {name ? <HiddenInputs name={name} values={selectedValues} /> : null}
          </div>
        </PopoverAnchor>
        {open && !openedAsDrawer ? (
          <PopoverContent
            id={contentId}
            align="start"
            // Se abre cientos de veces por día: sin animación de entrada ni de salida.
            className="w-(--radix-popover-trigger-width) min-w-60 p-0 data-[state=closed]:animate-none data-[state=open]:animate-none"
            onInteractOutside={(event) => {
              // El campo es el ancla, no el trigger: un clic en él lo maneja `handleFieldClick`.
              if (event.target instanceof Node && fieldRef.current?.contains(event.target)) event.preventDefault();
            }}
          >
            {list}
          </PopoverContent>
        ) : null}
      </Popover>
      {openedAsDrawer ? (
        <SearchSelectDrawer
          open={open}
          onOpenChange={handleOpenChange}
          nested={surface === 'drawer'}
          title={props['aria-label'] ?? placeholder}
          contentId={contentId}
          doneCount={props.multiple ? props.value.length : null}
        >
          {open ? list : null}
        </SearchSelectDrawer>
      ) : null}
    </>
  );
}

function SelectedChips<V extends SearchSelectValue>({
  values,
  optionsByValue,
  onRemove,
  disabled,
}: {
  values: V[];
  optionsByValue: ReadonlyMap<V, SearchSelectOption<V>>;
  onRemove: (value: V) => void;
  disabled: boolean;
}) {
  const shown = values.slice(0, VISIBLE_CHIPS);
  const hidden = values.length - shown.length;

  return (
    <span className="flex min-w-0 shrink items-center gap-1">
      {shown.map((value) => {
        const label = optionsByValue.get(value)?.label ?? 'Opción no disponible';
        return (
          <span
            key={String(value)}
            data-slot="search-select-chip"
            title={label}
            className="border-border-strong bg-muted text-caption inline-flex h-6 max-w-32 min-w-0 items-center gap-0.5 border pl-1.5"
          >
            <span className="truncate">{label}</span>
            <button
              type="button"
              aria-label={`Quitar «${label}»`}
              disabled={disabled}
              onClick={() => onRemove(value)}
              // 20px a la vista; con puntero grueso, 44×44 de área táctil: ancho real + extensión vertical por `::after`
              // (no se extiende a los costados para no pisar el chip vecino).
              className="text-muted-foreground hover:text-foreground hover:bg-accent relative inline-flex size-5 shrink-0 items-center justify-center disabled:pointer-events-none pointer-coarse:w-11 pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-3"
            >
              <XIcon aria-hidden="true" className="size-3" />
            </button>
          </span>
        );
      })}
      {hidden > 0 ? <span className="text-caption text-muted-foreground shrink-0 tabular-nums">+{hidden}</span> : null}
    </span>
  );
}

function HiddenInputs<V extends SearchSelectValue>({ name, values }: { name: string; values: V[] }) {
  if (values.length === 0) return <input type="hidden" name={name} value="" />;
  return (
    <>
      {values.map((value) => (
        <input key={String(value)} type="hidden" name={name} value={String(value)} />
      ))}
    </>
  );
}
