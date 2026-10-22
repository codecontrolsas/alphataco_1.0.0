'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import { Logger } from '@/lib/logger';
import { NameFormDialog } from '@/shared/components/common/name-catalog/NameFormDialog';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Plus, Power, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm, type DefaultValues, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';

type NamedRow = { id: string; name: string; is_active: boolean };

interface NameCatalogSectionProps<Row extends NamedRow, Values extends { name: string }> {
  title: string;
  description: string;
  /** Sustantivo en singular y minúscula, masculino ("concepto", "rubro"): arma los avisos. */
  noun: string;
  namePlaceholder: string;
  emptyMessage: string;
  loggerName: string;
  rows: Row[];
  canUpdate: boolean;
  /** Texto secundario de cada fila (cuántas veces se usa). */
  rowDetail: (row: Row) => string;
  resolver: Resolver<Values, unknown, Values>;
  create: (values: Values) => Promise<ActionResult<unknown>>;
  rename: (id: string, values: Values) => Promise<ActionResult<unknown>>;
  setActive: (id: string, active: boolean) => Promise<ActionResult<unknown>>;
}

/**
 * Catálogo simple de nombres con alta, renombre y activar/desactivar (conceptos de gasto, rubros de
 * proveedor). Desactivar no quita el ítem de lo ya cargado. Refresca la ruta tras cada cambio.
 */
export function NameCatalogSection<Row extends NamedRow, Values extends { name: string }>({
  title,
  description,
  noun,
  namePlaceholder,
  emptyMessage,
  loggerName,
  rows,
  canUpdate,
  rowDetail,
  resolver,
  create,
  rename,
  setActive,
}: NameCatalogSectionProps<Row, Values>) {
  const router = useRouter();
  const logger = useMemo(() => new Logger(loggerName), [loggerName]);
  const label = `${noun.charAt(0).toUpperCase()}${noun.slice(1)}`;
  // `null` = cerrado, `'new'` = alta, un ítem = edicion.
  const [editing, setEditing] = useState<Row | 'new' | null>(null);

  const form = useForm<Values, unknown, Values>({ resolver, defaultValues: { name: '' } as DefaultValues<Values> });

  const openForm = (target: Row | 'new') => {
    form.reset({ name: target === 'new' ? '' : target.name } as Values);
    setEditing(target);
  };

  const save = useMutation({
    mutationFn: async (values: Values) =>
      unwrapAction(editing && editing !== 'new' ? await rename(editing.id, values) : await create(values)),
    onSuccess: (_data, values) => {
      toast.success(editing === 'new' ? `${label} ${values.name} creado` : `${label} ${values.name} actualizado`);
      setEditing(null);
      router.refresh();
    },
    onError: (error) => {
      logger.error(`Error al guardar el ${noun}`, { data: { error } });
      toast.error(error instanceof Error ? error.message : `No se pudo guardar el ${noun}`);
    },
  });

  const toggle = useMutation({
    mutationFn: async (row: Row) => unwrapAction(await setActive(row.id, !row.is_active)),
    onSuccess: (_data, row) => {
      toast.success(row.is_active ? `${label} ${row.name} desactivado` : `${label} ${row.name} reactivado`);
      router.refresh();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : `No se pudo cambiar el ${noun}`),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {canUpdate && (
          <Button type="button" size="sm" variant="outline" onClick={() => openForm('new')}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={row.is_active ? 'truncate' : 'truncate text-muted-foreground'}>{row.name}</span>
                    {!row.is_active && <Badge variant="outline">Inactivo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">{rowDetail(row)}</p>
                </div>
                {canUpdate && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Editar ${row.name}`}
                      onClick={() => openForm(row)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={row.is_active ? `Desactivar ${row.name}` : `Reactivar ${row.name}`}
                      onClick={() => toggle.mutate(row)}
                      disabled={toggle.isPending}
                    >
                      {row.is_active ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <NameFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? `Nuevo ${noun}` : `Editar ${noun}`}
        form={form}
        onSubmit={(values) => save.mutate(values)}
        pending={save.isPending}
        placeholder={namePlaceholder}
      />
    </Card>
  );
}
