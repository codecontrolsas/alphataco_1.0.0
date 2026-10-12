'use client';

import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useDebouncedValue } from '@/shared/hooks/use-debounced-value';
import { useQuery } from '@tanstack/react-query';
import { Building2, CornerDownLeft, Package, Search, Truck, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { searchGlobalResources } from '../actions/global-search';

export type SearchScreen = { label: string; href: string };

interface GlobalSearchProps {
  /** Pantallas que el usuario puede abrir, resueltas en el servidor con la regla del menú. */
  screens: SearchScreen[];
  /** Qué tipos de registro puede buscar (según los módulos a los que tiene acceso). */
  scopes: { people: boolean; fleet: boolean; clients: boolean };
}

/** Compara sin tildes ni mayúsculas: "deposito" encuentra "Depósito". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function placeholderFor(scopes: GlobalSearchProps['scopes']): string {
  const parts = [
    scopes.people && 'legajo o nombre',
    scopes.fleet && 'dominio o interno',
    scopes.clients && 'cliente',
  ].filter(Boolean);
  return parts.length ? `Ir a… ${parts.join(', ')} o pantalla` : 'Ir a una pantalla';
}

/**
 * Buscador "Ir a…" del encabezado (mapa v2, aprobado el 2026-10-10): un solo lugar para llegar a una
 * persona, una unidad, un cliente o una pantalla, con Ctrl/Cmd+K desde cualquier parte.
 */
export function GlobalSearch({ screens, scopes }: GlobalSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const searchesRecords = scopes.people || scopes.fleet || scopes.clients;

  // Atajo global: suscripción a un evento del DOM, uso válido de useEffect.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['global-search', debouncedQuery],
    queryFn: () => searchGlobalResources(debouncedQuery),
    enabled: open && searchesRecords && debouncedQuery.length >= 2,
    staleTime: 30 * 1000,
  });

  const needle = normalize(query.trim());
  const matchingScreens = needle ? screens.filter((screen) => normalize(screen.label).includes(needle)) : screens;
  const hasRecords = !!data && data.people.length + data.units.length + data.auxiliary.length + data.clients.length > 0;
  const waiting = searchesRecords && query.trim().length >= 2 && (isFetching || debouncedQuery !== query.trim());

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setQuery('');
  };

  const go = (href: string) => {
    handleOpenChange(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-9 items-center gap-2 rounded-md border px-2.5 text-sm transition-colors md:w-64 lg:w-80"
        aria-label="Ir a… (Ctrl+K)"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden flex-1 truncate text-left md:inline">Ir a…</span>
        <kbd className="border-border bg-muted hidden rounded border px-1.5 font-mono text-[11px] md:inline">Ctrl K</kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Ir a…"
        description="Buscá una persona, una unidad, un cliente o una pantalla."
        shouldFilter={false}
      >
        {/* El filtrado lo hacemos nosotros: las personas/unidades/clientes ya vienen filtrados del
            servidor y cmdk los volvería a filtrar por el texto visible (que no incluye el CUIL). */}
        <CommandInput value={query} onValueChange={setQuery} placeholder={placeholderFor(scopes)} />
        <CommandList className="max-h-[min(420px,60vh)]">
          {!waiting && !hasRecords && matchingScreens.length === 0 && (
            // Sin CommandEmpty: con shouldFilter=false cmdk no recalcula su contador al desmontar ítems.
            <p className="text-muted-foreground px-3 py-6 text-center text-sm" role="status">
              {isError ? 'No pudimos buscar. Probá de nuevo.' : `No encontramos nada con «${query.trim()}».`}
            </p>
          )}
          {waiting && !hasRecords && (
            <div className="text-muted-foreground px-3 py-4 text-sm" role="status">
              Buscando…
            </div>
          )}

          {data && data.people.length > 0 && (
            <CommandGroup heading="Personas">
              {data.people.map((person) => (
                <CommandItem
                  key={person.id}
                  value={`person-${person.id}`}
                  onSelect={() => go(`/dashboard/employee/action?action=view&employee_id=${person.id}`)}
                >
                  <User />
                  <span className="text-muted-foreground font-mono tabular-nums">{person.file}</span>
                  <span className="truncate">
                    {person.lastname}, {person.firstname}
                  </span>
                  {person.is_active === false && <span className="text-muted-foreground ml-auto text-xs">Egresado</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data && data.units.length > 0 && (
            <CommandGroup heading="Unidades">
              {data.units.map((unit) => (
                <CommandItem
                  key={unit.id}
                  value={`unit-${unit.id}`}
                  onSelect={() => go(`/dashboard/equipment/action?action=view&id=${unit.id}`)}
                >
                  <Truck />
                  <span className="font-mono">{unit.domain ?? unit.serie ?? 'Sin dominio'}</span>
                  {unit.intern_number && <span className="text-muted-foreground">Interno {unit.intern_number}</span>}
                  {unit.is_active === false && (
                    <span className="text-muted-foreground ml-auto text-xs">Fuera de flota</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data && data.auxiliary.length > 0 && (
            <CommandGroup heading="Equipos auxiliares">
              {data.auxiliary.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`aux-${item.id}`}
                  onSelect={() => go(`/dashboard/equipment/action?action=view&id=${item.id}&type=other`)}
                >
                  <Package />
                  <span>{item.intern_number ? `Interno ${item.intern_number}` : 'Sin interno'}</span>
                  {item.serial_number && <span className="text-muted-foreground font-mono">{item.serial_number}</span>}
                  {item.is_active === false && (
                    <span className="text-muted-foreground ml-auto text-xs">Fuera de flota</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {data && data.clients.length > 0 && (
            <CommandGroup heading="Clientes">
              {data.clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={`client-${client.id}`}
                  onSelect={() => go(`/dashboard/configuration/customers/action?action=view&id=${client.id}`)}
                >
                  <Building2 />
                  <span className="truncate">{client.name}</span>
                  {client.is_active === false && <span className="text-muted-foreground ml-auto text-xs">Inactivo</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {matchingScreens.length > 0 && (
            <CommandGroup heading="Pantallas">
              {matchingScreens.map((screen) => (
                <CommandItem key={screen.href} value={`screen-${screen.href}`} onSelect={() => go(screen.href)}>
                  <CornerDownLeft />
                  <span>{screen.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
