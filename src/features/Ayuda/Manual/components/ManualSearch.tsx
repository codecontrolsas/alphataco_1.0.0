'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { searchManual, type ManualSearchResults } from '../actions/search-manual';
import { manualHref } from '../lib/manual-urls';

const DEBOUNCE_MS = 250;
const MIN_QUERY = 2;

type SearchResult = ManualSearchResults[number];

function resultHref(result: SearchResult): string {
  return manualHref(result.slug, result.headingId);
}

/** El atajo `/` no puede robarle la tecla a alguien que está escribiendo en otro campo. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/**
 * Buscador del manual: combobox con lista de resultados (el foco queda en el campo y las flechas
 * mueven la opción activa). Busca en el servidor sobre las guías que el usuario puede abrir.
 *
 * El debounce vive en el handler del input: lo que se escribe se ve al instante y la consulta sale
 * cuando el usuario deja de tipear, sin un efecto que reaccione al estado.
 */
export function ManualSearch({ size = 'default' }: { size?: 'default' | 'lg' }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseId = useId();
  const listId = `${baseId}-results`;

  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const enabled = query.length >= MIN_QUERY;
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: ['manual-search', query],
    queryFn: () => searchManual(query),
    enabled,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const results = enabled ? data ?? [] : [];
  const showPanel = enabled && input.trim().length >= MIN_QUERY;
  const pending = isFetching || input.trim() !== query;

  // Suscripción a un evento del documento: el uso legítimo de un efecto.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleChange(value: string) {
    setInput(value);
    setActiveIndex(-1);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setQuery(value.trim()), DEBOUNCE_MS);
  }

  function clear() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setInput('');
    setQuery('');
    setActiveIndex(-1);
  }

  /**
   * Enter abre el resultado como un clic en su enlace: así pasa por el mismo camino que el mouse (el `onClick` del
   * enlace limpia la búsqueda y el clic burbujea hasta el panel móvil del índice, que se cierra al tocar un enlace).
   */
  function goTo(index: number) {
    const option = document.getElementById(`${baseId}-option-${index}`);
    if (option instanceof HTMLAnchorElement) {
      option.click();
      return;
    }
    clear();
    router.push(resultHref(results[index]));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (input) {
        event.preventDefault();
        clear();
      } else {
        inputRef.current?.blur();
      }
      return;
    }
    if (!showPanel || results.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      goTo(Math.max(0, activeIndex));
    }
  }

  const statusText = !showPanel
    ? ''
    : pending
      ? 'Buscando…'
      : isError
        ? 'No se pudo buscar.'
        : results.length === 0
          ? `Sin resultados para «${query}».`
          : `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`;

  const large = size === 'lg';

  return (
    <div className="w-full">
      <label
        htmlFor={`${baseId}-input`}
        className={large ? 'sr-only' : 'mb-1.5 block text-xs font-medium text-muted-foreground'}
      >
        Buscar en el manual
      </label>
      <div
        className={cn(
          'flex items-center gap-2 border border-input bg-background px-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
          large ? 'h-12' : 'h-9'
        )}
      >
        {pending && showPanel ? (
          <Loader2
            aria-hidden
            className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        ) : (
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          type="search"
          name="q"
          role="combobox"
          aria-expanded={showPanel && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${baseId}-option-${activeIndex}` : undefined}
          aria-describedby={`${baseId}-hint`}
          autoComplete="off"
          enterKeyHint="search"
          placeholder={large ? 'Ej.: cómo cargar un parte diario' : 'Buscar…'}
          value={input}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            'min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden',
            large ? 'md:text-base' : 'md:text-sm'
          )}
        />
        {!input && (
          <kbd
            aria-hidden
            className="hidden border border-b-2 border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground sm:inline-block"
          >
            /
          </kbd>
        )}
      </div>
      <p id={`${baseId}-hint`} className="sr-only">
        Escribí al menos dos letras. Usá las flechas para recorrer los resultados y Enter para abrir uno. Atajo: tecla
        barra.
      </p>

      {/* La región de estado existe siempre: una que se monta y desmonta no se anuncia. */}
      <p role="status" className={cn('text-xs text-muted-foreground tabular-nums', showPanel ? 'mt-2' : 'sr-only')}>
        {statusText}
      </p>

      {showPanel && !pending && isError && (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>
          Reintentar
        </Button>
      )}

      {showPanel && !pending && !isError && results.length === 0 && (
        <div className="mt-2 border border-dashed p-3 text-sm text-muted-foreground">
          <p>Probá con otra palabra o con el nombre de la pantalla, tal como aparece en el menú.</p>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={clear}>
            Limpiar búsqueda
          </Button>
        </div>
      )}

      <ul
        id={listId}
        role="listbox"
        aria-label="Resultados de la búsqueda"
        className={cn(
          'mt-2 divide-y border bg-card',
          (!showPanel || results.length === 0) && 'hidden',
          pending && 'opacity-60'
        )}
      >
        {showPanel &&
          results.map((result, index) => (
            <li key={`${result.slug}-${result.headingId ?? ''}`} role="none">
              <Link
                id={`${baseId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                tabIndex={-1}
                href={resultHref(result)}
                onClick={clear}
                onMouseMove={() => setActiveIndex(index)}
                className={cn(
                  'block px-3 py-2.5 outline-none',
                  index === activeIndex ? 'bg-accent' : 'hover:bg-accent'
                )}
              >
                <span className="block font-medium text-foreground">{result.title}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {result.sectionTitle}
                  {result.heading ? ` › ${result.heading}` : ''}
                </span>
                <span
                  className={cn('mt-1 block text-sm text-muted-foreground', large ? 'line-clamp-2' : 'line-clamp-3')}
                >
                  {result.snippet.map((part, partIndex) =>
                    part.match ? (
                      <mark key={partIndex} className="bg-warn-subtle text-foreground">
                        {part.text}
                      </mark>
                    ) : (
                      <span key={partIndex}>{part.text}</span>
                    )
                  )}
                </span>
              </Link>
            </li>
          ))}
      </ul>
    </div>
  );
}
