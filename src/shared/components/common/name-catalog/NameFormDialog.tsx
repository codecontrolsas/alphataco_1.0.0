'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import type { ReactNode } from 'react';
import type { Control, FieldPath, FieldValues, UseFormReturn } from 'react-hook-form';

interface NameFormDialogProps<Values extends FieldValues & { name: string }, Output extends FieldValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: UseFormReturn<Values, unknown, Output>;
  onSubmit: (values: Output) => void;
  pending: boolean;
  placeholder?: string;
  /** Campos extra debajo del nombre (abreviatura, sentido...). */
  children?: ReactNode;
}

/**
 * Diálogo de alta/edición de un ítem de catálogo con campo "Nombre" (y los extra que se pasen como hijos),
 * cancelar y guardar. El estado del formulario y la mutación son del llamador.
 */
export function NameFormDialog<Values extends FieldValues & { name: string }, Output extends FieldValues = Values>({
  open,
  onOpenChange,
  title,
  form,
  onSubmit,
  pending,
  placeholder,
  children,
}: NameFormDialogProps<Values, Output>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control as unknown as Control<Values>}
              name={'name' as FieldPath<Values>}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder={placeholder} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {children}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Guardando…' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
