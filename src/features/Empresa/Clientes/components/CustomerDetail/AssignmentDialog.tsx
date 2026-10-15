'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { AssignmentChanges, AssignmentUpdateResult } from '../../lib/assignment-diff';
import { diffAssignments } from '../../lib/assignment-diff';

interface AssignmentOption {
  label: string;
  value: string;
}

interface AssignmentDialogProps {
  triggerLabel: string;
  title: string;
  description: string;
  fieldLabel: string;
  placeholder: string;
  emptyMessage: string;
  /** Opciones elegibles (recursos activos), consultadas al abrir el modal. */
  loadOptions: () => Promise<AssignmentOption[]>;
  /** Singular/plural para el resumen del toast ("empleado"/"empleados"). */
  nouns: { singular: string; plural: string };
  /** Afectaciones vigentes leídas de la BASE al abrir el modal (baseline). */
  loadBaseline: () => Promise<string[]>;
  /** Aplica altas y bajas explícitas. */
  save: (changes: AssignmentChanges) => Promise<AssignmentUpdateResult>;
  onSaved?: () => void;
}

/** Mensaje de resultado con números reales, para que el usuario vea qué pasó de verdad. */
export function buildAssignmentSummary(added: number, removed: number, singular: string, plural: string): string {
  const parts: string[] = [];
  if (added > 0) parts.push(`Se afectaron ${added} ${added === 1 ? singular : plural}`);
  if (removed > 0) parts.push(`se desafectaron ${removed} ${removed === 1 ? singular : plural}`);
  if (parts.length === 0) return 'No hubo cambios';
  return `${parts.join(' y ')}.`;
}

interface FormValues {
  selected: string[];
}

/**
 * Modal de afectación M:M (cliente ↔ empleados/equipos).
 *
 * - El baseline se lee de la base al abrir (nunca del estado de la pantalla). Sin baseline no
 *   se puede guardar: combo deshabilitado y submit bloqueado.
 * - Antes de confirmar se muestra el delta ("N afectados. Se agregan X. Se quitan Y").
 * - Al servidor viajan SOLO los ids de alta y de baja (`{ add, remove }`).
 */
export function AssignmentDialog({
  triggerLabel,
  title,
  description,
  fieldLabel,
  placeholder,
  emptyMessage,
  loadOptions,
  nouns,
  loadBaseline,
  save,
  onSaved,
}: AssignmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [baseline, setBaseline] = useState<string[] | null>(null);
  const [options, setOptions] = useState<AssignmentOption[]>([]);
  const [isLoadingBaseline, setIsLoadingBaseline] = useState(false);
  const form = useForm<FormValues>({ defaultValues: { selected: [] } });

  const resetState = () => {
    setBaseline(null);
    setOptions([]);
    form.reset({ selected: [] });
  };

  const handleOpenChange = async (nextOpen: boolean) => {
    if (!nextOpen) {
      setOpen(false);
      resetState();
      return;
    }

    setOpen(true);
    setIsLoadingBaseline(true);
    form.reset({ selected: [] });
    try {
      // Las opciones (activos) y las afectaciones vigentes se leen de la base al abrir, en paralelo.
      const [current, available] = await Promise.all([loadBaseline(), loadOptions()]);
      const availableValues = new Set(available.map((option) => option.value));
      setBaseline(current);
      setOptions(available);
      // Solo se preselecciona lo que el usuario puede ver; el resto queda protegido (ver más abajo).
      form.reset({ selected: current.filter((id) => availableValues.has(id)) });
    } catch {
      toast.error(`No se pudieron cargar los ${nouns.plural} y sus afectaciones. Volvé a abrir el modal.`);
      resetState();
      setOpen(false);
    } finally {
      setIsLoadingBaseline(false);
    }
  };

  /**
   * Afectaciones vigentes que NO están entre las opciones (recursos dados de baja): el modal no las
   * muestra, así que nunca puede quitarlas. Sin esto, "Todos" o una lista recortada las daría de baja.
   */
  const protectedIds = (() => {
    if (!baseline) return [];
    const availableValues = new Set(options.map((option) => option.value));
    return baseline.filter((id) => !availableValues.has(id));
  })();

  const computeDelta = (selected: string[]) => {
    const available = new Set(options.map((option) => option.value));
    const visibleBaseline = (baseline ?? []).filter((id) => available.has(id));
    return diffAssignments(visibleBaseline, selected);
  };

  const handleSubmit = async (values: FormValues) => {
    // Sin baseline no se guarda: no sabríamos qué se agregó y qué se quitó.
    if (!baseline) {
      toast.error('Todavía se están cargando las afectaciones actuales. Esperá un instante.');
      return;
    }

    const { toAdd, toRemove } = computeDelta(values.selected);
    if (toAdd.length === 0 && toRemove.length === 0) {
      toast.info('No hay cambios para guardar');
      setOpen(false);
      resetState();
      return;
    }

    const result = await save({ add: toAdd, remove: toRemove });
    if (!result.success) {
      toast.error(`No se pudieron actualizar los ${nouns.plural}: ${result.error}`);
      return;
    }

    toast.success(buildAssignmentSummary(result.added, result.removed, nouns.singular, nouns.plural));
    setOpen(false);
    resetState();
    onSaved?.();
  };

  const disabled = isLoadingBaseline || !baseline;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="brand">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="w-full space-y-6 pt-2">
            <FormField
              control={form.control}
              name="selected"
              render={({ field }) => {
                const pending = baseline ? computeDelta(field.value) : null;
                return (
                  <FormItem className="w-full">
                    <FormLabel>{fieldLabel}</FormLabel>
                    <FormControl>
                      <MultiSelectCombobox
                        options={options}
                        emptyMessage={emptyMessage}
                        selectedValues={field.value}
                        onChange={field.onChange}
                        placeholder={placeholder}
                        showSelectAll={true}
                        disabled={disabled}
                        isLoading={isLoadingBaseline}
                      />
                    </FormControl>
                    {/* Resumen de lo que va a pasar al guardar: el usuario ve las bajas antes de confirmarlas */}
                    {isLoadingBaseline ? (
                      <p className="text-xs text-muted-foreground" role="status">
                        Cargando las afectaciones actuales del cliente...
                      </p>
                    ) : pending ? (
                      <p className="text-xs text-muted-foreground" role="status">
                        {baseline?.length ?? 0} afectados actualmente.{' '}
                        {pending.toAdd.length === 0 && pending.toRemove.length === 0 ? (
                          'Sin cambios.'
                        ) : (
                          <>
                            {pending.toAdd.length > 0 && (
                              <span className="text-ok-subtle-foreground font-medium">
                                Se agregan {pending.toAdd.length}.{' '}
                              </span>
                            )}
                            {pending.toRemove.length > 0 && (
                              <span className="text-destructive font-medium">Se quitan {pending.toRemove.length}.</span>
                            )}
                          </>
                        )}
                        {protectedIds.length > 0 && (
                          <>
                            {' '}
                            {protectedIds.length === 1
                              ? 'Hay 1 afectado dado de baja que no se muestra acá y no se modifica.'
                              : `Hay ${protectedIds.length} afectados dados de baja que no se muestran acá y no se modifican.`}
                          </>
                        )}
                      </p>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
            <DialogFooter className="gap-2 sm:gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting || disabled} variant="brand">
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
