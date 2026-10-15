'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { unwrapAction } from '@/features/Warehouses/lib/unwrap-action';
import { Logger } from '@/lib/logger';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Power, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createTreasuryConcept,
  deleteTreasuryConcept,
  setTreasuryConceptActive,
  updateTreasuryConcept,
  type TreasuryConceptRow,
} from '../../actions/concepts.server';
import { invalidateTreasury } from '../../lib/invalidate';
import {
  TREASURY_CONCEPT_DIRECTIONS,
  TREASURY_CONCEPT_DIRECTION_LABELS,
  treasuryConceptFormSchema,
  type TreasuryConceptFormValues,
} from '../../schemas/concepts';

const logger = new Logger('Treasury/ConceptsSection');

const EMPTY: TreasuryConceptFormValues = { name: '', direction: 'OUT' };

/**
 * Conceptos de los movimientos manuales (gastos bancarios, aporte de socios…), con el sentido que
 * admiten. Un concepto usado no se borra (se desactiva) ni cambia de sentido.
 */
export function ConceptsSection({ concepts, canUpdate }: { concepts: TreasuryConceptRow[]; canUpdate: boolean }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<TreasuryConceptRow | null>(null);
  const [editing, setEditing] = useState<TreasuryConceptRow | 'new' | null>(null);
  const form = useForm<TreasuryConceptFormValues>({ resolver: zodResolver(treasuryConceptFormSchema), defaultValues: EMPTY });

  const openForm = (target: TreasuryConceptRow | 'new') => {
    form.reset(target === 'new' ? EMPTY : { name: target.name, direction: target.direction });
    setEditing(target);
  };

  const refresh = () => {
    invalidateTreasury(queryClient);
    router.refresh();
  };

  const save = useMutation({
    mutationFn: async (values: TreasuryConceptFormValues) =>
      unwrapAction(editing && editing !== 'new' ? await updateTreasuryConcept(editing.id, values) : await createTreasuryConcept(values)),
    onSuccess: (_data, values) => {
      toast.success(editing === 'new' ? `${values.name} creado` : `${values.name} actualizado`);
      setEditing(null);
      refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el concepto', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el concepto');
    },
  });

  const toggle = useMutation({
    mutationFn: async (concept: TreasuryConceptRow) => unwrapAction(await setTreasuryConceptActive(concept.id, !concept.is_active)),
    onSuccess: (_data, concept) => {
      toast.success(concept.is_active ? `${concept.name} desactivado` : `${concept.name} reactivado`);
      refresh();
    },
    onError: (error) => {
      logger.error('Error al cambiar el concepto', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo cambiar el concepto');
    },
  });

  const remove = useMutation({
    mutationFn: async (concept: TreasuryConceptRow) => unwrapAction(await deleteTreasuryConcept(concept.id)),
    onSuccess: (_data, concept) => {
      toast.success(`${concept.name} borrado`);
      setConfirmDelete(null);
      refresh();
    },
    onError: (error) => {
      logger.error('Error al borrar el concepto', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo borrar el concepto');
    },
  });

  const editingUsed = editing !== null && editing !== 'new' && editing.used;

  return (
    <SectionCard
      title="Conceptos"
      description="Clasifican los movimientos manuales: gastos bancarios, impuestos, aportes, retiros…"
      action={
        canUpdate && (
          <Button type="button" size="sm" variant="outline" onClick={() => openForm('new')}>
            <Plus className="mr-1 h-4 w-4" />
            Agregar
          </Button>
        )
      }
    >
        {concepts.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Todavía no hay conceptos. Hacen falta para cargar movimientos manuales.</p>
        ) : (
          <ul className="divide-y">
            {concepts.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={c.is_active ? 'truncate' : 'truncate text-muted-foreground'}>{c.name}</span>
                    {!c.is_active && <Badge variant="outline">Inactivo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{TREASURY_CONCEPT_DIRECTION_LABELS[c.direction]}</p>
                </div>
                {canUpdate && (
                  <div className="flex shrink-0 items-center">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${c.name}`} onClick={() => openForm(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={c.is_active ? `Desactivar ${c.name}` : `Reactivar ${c.name}`}
                      onClick={() => toggle.mutate(c)}
                      disabled={toggle.isPending}
                    >
                      {c.is_active ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                    </Button>
                    {!c.used && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Borrar ${c.name}`}
                        onClick={() => setConfirmDelete(c)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Nuevo concepto' : 'Editar concepto'}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input autoFocus placeholder="Gastos bancarios" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sentido</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange} disabled={editingUsed}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TREASURY_CONCEPT_DIRECTIONS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {TREASURY_CONCEPT_DIRECTION_LABELS[d]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {editingUsed && <p className="text-xs text-muted-foreground">Ya se usó en movimientos: el sentido no se cambia.</p>}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Guardando…' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Solo se puede borrar un concepto que no se usó en movimientos. Si se usó, desactivalo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (confirmDelete) remove.mutate(confirmDelete);
              }}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
