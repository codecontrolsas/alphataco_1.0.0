'use client';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useCatalogSheetBusy, useCatalogSheetClose } from '@/shared/components/common/CatalogFormSheet';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createUserBoard, renameUserBoard } from '../actions/boards.server';
import { boardNameFormSchema, type BoardNameFormValues } from '../lib/board-layout';

interface BoardNameFormProps {
  /** Sin `board`: alta de un tablero vacío. Con `board`: renombrar. */
  board: { id: string; name: string } | null;
  /** Recibe el id del tablero creado o renombrado (puede cambiar si era uno por defecto). */
  onSaved: (id: string, mode: 'create' | 'edit') => void;
}

/** Nombre del tablero (alta y renombre) dentro del Sheet de tableros. */
export function BoardNameForm({ board, onSaved }: BoardNameFormProps) {
  const closeSheet = useCatalogSheetClose();
  const setBusy = useCatalogSheetBusy();
  const mode = board ? 'edit' : 'create';

  const form = useForm<BoardNameFormValues>({
    resolver: zodResolver(boardNameFormSchema),
    defaultValues: { name: board?.name ?? '' },
  });

  const mutation = useMutation({
    mutationFn: (values: BoardNameFormValues) =>
      board ? renameUserBoard({ boardId: board.id, name: values.name }) : createUserBoard({ name: values.name }),
    onMutate: () => setBusy(true),
    onSuccess: (result) => {
      setBusy(false);
      if (!result.ok) {
        form.setError('name', { message: result.error });
        return;
      }
      toast.success(mode === 'create' ? 'Tablero creado' : 'Tablero renombrado');
      closeSheet();
      onSaved(result.data.id, mode);
    },
    onError: () => {
      setBusy(false);
      toast.error('No se pudo guardar el tablero. Intentá nuevamente.');
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre del tablero</FormLabel>
              <FormControl>
                <Input placeholder="Ej.: Taller semanal" autoComplete="off" maxLength={60} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={closeSheet}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending || form.formState.isSubmitting}>
            {mutation.isPending ? 'Guardando…' : mode === 'create' ? 'Crear tablero' : 'Guardar nombre'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
