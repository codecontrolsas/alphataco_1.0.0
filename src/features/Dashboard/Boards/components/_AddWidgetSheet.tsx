'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { WIDGET_SECTIONS, type WidgetSection } from '@/features/Dashboard/lib/widget-registry';
import { Check, Plus, Search } from 'lucide-react';
import { useId, useState } from 'react';
import type { CatalogWidget } from './_DashboardBoard';

interface AddWidgetSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: readonly CatalogWidget[];
  /** Widgets que ya están en el borrador del tablero. */
  placedIds: ReadonlySet<string>;
  onAdd: (widget: CatalogWidget) => void;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Catálogo de widgets que el usuario puede ver, agrupado por sección, con buscador. */
export function AddWidgetSheet({ open, onOpenChange, catalog, placedIds, onAdd }: AddWidgetSheetProps) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const needle = normalize(query.trim());

  const matches = needle
    ? catalog.filter((widget) =>
        normalize(`${widget.title} ${widget.description} ${WIDGET_SECTIONS[widget.section]}`).includes(needle)
      )
    : catalog;

  const sections = (Object.keys(WIDGET_SECTIONS) as WidgetSection[])
    .map((section) => ({ section, widgets: matches.filter((widget) => widget.section === section) }))
    .filter((group) => group.widgets.length > 0);

  const available = catalog.filter((widget) => !placedIds.has(widget.id)).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="px-4 pt-6 pb-3 sm:px-6">
          <SheetTitle>Agregar widget</SheetTitle>
          <SheetDescription>
            <span className="tabular-nums">{available}</span> de <span className="tabular-nums">{catalog.length}</span>{' '}
            widgets disponibles para agregar
          </SheetDescription>
        </SheetHeader>

        <div className="border-b px-4 pb-3 sm:px-6">
          <label htmlFor={searchId} className="sr-only">
            Buscar widget
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por nombre o sección"
              className="pl-9"
              autoComplete="off"
            />
          </div>
          <p role="status" className="text-muted-foreground mt-2 text-xs tabular-nums">
            {needle ? `${matches.length} de ${catalog.length} widgets` : ''}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {sections.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Ningún widget coincide con «{query.trim()}».
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {sections.map(({ section, widgets }) => (
                <section key={section} aria-labelledby={`${searchId}-${section}`}>
                  <h3
                    id={`${searchId}-${section}`}
                    className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase"
                  >
                    {WIDGET_SECTIONS[section]}
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {widgets.map((widget) => {
                      const placed = placedIds.has(widget.id);
                      return (
                        <li key={widget.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{widget.title}</p>
                            <p className="text-muted-foreground text-xs">{widget.description}</p>
                          </div>
                          {placed ? (
                            <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs">
                              <Check aria-hidden="true" className="size-3.5" />
                              En el tablero
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              onClick={() => onAdd(widget)}
                              aria-label={`Agregar «${widget.title}»`}
                            >
                              <Plus aria-hidden="true" className="size-4" />
                              Agregar
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
