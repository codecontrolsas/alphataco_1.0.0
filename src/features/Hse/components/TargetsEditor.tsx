'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Briefcase, Check, ChevronsUpDown, Network, Plus, User, Users, X, type LucideIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import type { HseDocumentFormOptions } from '../actions/queries.server';
import { HSE_TARGET_KIND_LABELS, type HseTargetKind } from '../lib/constants';
import type { HseTargetInput } from '../schemas/documents';

const KIND_ICONS: Record<HseTargetKind, LucideIcon> = {
  all: Users,
  position: Briefcase,
  sector: Network,
  employee: User,
};
const KINDS: HseTargetKind[] = ['all', 'position', 'sector', 'employee'];

type RefKind = Exclude<HseTargetKind, 'all'>;
const OPTION_KEY: Record<RefKind, 'positions' | 'sectors' | 'employees'> = {
  position: 'positions',
  sector: 'sectors',
  employee: 'employees',
};
const SEARCH_PLACEHOLDER: Record<RefKind, string> = {
  position: 'Buscar puesto…',
  sector: 'Buscar sector…',
  employee: 'Buscar por legajo o nombre…',
};

function targetKey(t: HseTargetInput) {
  return t.kind === 'all' ? 'all' : `${t.kind}:${t.refId}`;
}

/**
 * Destinatarios de un documento: todo el personal, puestos, sectores o empleados puntuales. Lista con quitar por fila y
 * un renglón para agregar (tipo + búsqueda). "Todo el personal" reemplaza al resto: ya los incluye.
 */
export function TargetsEditor({
  value,
  onChange,
  options,
  invalid,
}: {
  value: HseTargetInput[];
  onChange: (next: HseTargetInput[]) => void;
  options: HseDocumentFormOptions;
  invalid?: boolean;
}) {
  const kindId = useId();
  const [kind, setKind] = useState<HseTargetKind>('position');
  const [refId, setRefId] = useState('');
  const [open, setOpen] = useState(false);

  const labels = useMemo(() => {
    const map = new Map<string, string>();
    for (const key of ['positions', 'sectors', 'employees'] as const) {
      for (const o of options[key]) map.set(o.id, o.name ?? '');
    }
    return map;
  }, [options]);

  const hasAll = value.some((t) => t.kind === 'all');
  const chosen = new Set(value.map(targetKey));
  const refOptions = kind === 'all' ? [] : options[OPTION_KEY[kind]].filter((o) => !chosen.has(`${kind}:${o.id}`));
  const selectedLabel = refId ? labels.get(refId) : undefined;

  const add = () => {
    if (kind === 'all') {
      onChange([{ kind: 'all' }]);
      return;
    }
    if (!refId) return;
    onChange([...value.filter((t) => t.kind !== 'all'), { kind, refId }]);
    setRefId('');
  };

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p
          className={cn(
            'rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground',
            invalid && 'border-destructive'
          )}
        >
          Todavía no elegiste a quién aplica.
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-label="Destinatarios elegidos">
          {value.map((t) => {
            const Icon = KIND_ICONS[t.kind];
            const label =
              t.kind === 'all' ? HSE_TARGET_KIND_LABELS.all : labels.get(t.refId) ?? HSE_TARGET_KIND_LABELS[t.kind];
            return (
              <li
                key={targetKey(t)}
                className="flex max-w-full items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-3 pr-0.5 text-sm"
              >
                <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="sr-only">{HSE_TARGET_KIND_LABELS[t.kind]}:</span>
                <span className="truncate">{label}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 rounded-full"
                  aria-label={`Quitar ${label}`}
                  onClick={() => onChange(value.filter((x) => targetKey(x) !== targetKey(t)))}
                >
                  <X aria-hidden="true" className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {!hasAll && (
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor={kindId} className="text-xs text-muted-foreground">
              Agregar por
            </Label>
            <Select
              value={kind}
              onValueChange={(next) => {
                setKind(next as HseTargetKind);
                setRefId('');
              }}
            >
              <SelectTrigger id={kindId} className="min-h-11 sm:min-h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {HSE_TARGET_KIND_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind !== 'all' ? (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  aria-label={`Elegir ${HSE_TARGET_KIND_LABELS[kind].toLowerCase()}`}
                  className="min-h-11 w-full justify-between font-normal sm:min-h-9"
                >
                  <span className={cn('truncate', !selectedLabel && 'text-muted-foreground')}>
                    {selectedLabel ??
                      `Elegí ${kind === 'employee' ? 'el empleado' : `el ${HSE_TARGET_KIND_LABELS[kind].toLowerCase()}`}`}
                  </span>
                  <ChevronsUpDown aria-hidden="true" className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
                <Command>
                  <CommandInput placeholder={SEARCH_PLACEHOLDER[kind]} />
                  <CommandList>
                    <CommandEmpty>Sin resultados.</CommandEmpty>
                    <CommandGroup>
                      {refOptions.map((o) => (
                        <CommandItem
                          key={o.id}
                          value={`${o.name} ${o.id}`}
                          onSelect={() => {
                            setRefId(o.id);
                            setOpen(false);
                          }}
                        >
                          <Check
                            aria-hidden="true"
                            className={cn('mr-2 size-4', refId === o.id ? 'opacity-100' : 'opacity-0')}
                          />
                          {o.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            <p className="text-sm text-muted-foreground sm:pb-2">
              Aplica a todo el personal activo, también a quien entre después.
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 sm:min-h-9"
            onClick={add}
            disabled={kind !== 'all' && !refId}
          >
            <Plus aria-hidden="true" className="mr-1 size-4" />
            Agregar
          </Button>
        </div>
      )}
      {hasAll && (
        <p className="text-sm text-muted-foreground">
          Aplica a todo el personal activo. Para elegir puestos, sectores o personas, quitá «Todo el personal».
        </p>
      )}
    </div>
  );
}
