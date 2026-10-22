'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

/** Textos y acciones de un catálogo de ropa que solo tiene nombre (marcas, talles). */
export interface ClothingNameFormConfig {
  loggerName: string;
  /** Sustantivo en inglés para los logs ("clothing brand"). */
  logNoun: string;
  /** Key de la query de la tabla, que se invalida tras guardar. */
  queryKey: string;
  maxLength: number;
  placeholder: string;
  create: (name: string) => Promise<unknown>;
  update: (id: string, name: string) => Promise<unknown>;
  texts: {
    createTitle: string;
    editTitle: string;
    createDescription: string;
    editDescription: string;
    created: string;
    updated: string;
    duplicate: string;
    saveError: string;
    createButton: string;
  };
}

interface ClothingNameFormDialogProps {
  config: ClothingNameFormConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Si se pasa, el formulario edita ese registro. */
  record?: { id: string; name: string } | null;
  /** Se llama tras crear o actualizar con éxito. */
  onSuccess?: () => void;
}

/** Diálogo de alta y edición de un registro del catálogo de ropa con un único campo "Nombre". */
export function ClothingNameFormDialog({ config, open, onOpenChange, record, onSuccess }: ClothingNameFormDialogProps) {
  const queryClient = useQueryClient();
  const isEditing = !!record;
  const logger = useMemo(() => new Logger(config.loggerName), [config.loggerName]);

  const formSchema = useMemo(
    () =>
      z.object({
        name: z
          .string()
          .min(1, 'El nombre es requerido')
          .max(config.maxLength, `El nombre no puede superar los ${config.maxLength} caracteres`),
      }),
    [config.maxLength]
  );
  type FormValues = z.infer<typeof formSchema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: record?.name ?? '',
    },
  });

  // Reset form when the record changes (switching between create/edit)
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      form.reset({ name: '' });
    } else if (record) {
      form.reset({ name: record.name });
    }
    onOpenChange(nextOpen);
  };

  async function onSubmit(values: FormValues) {
    logger.debug(isEditing ? `Updating ${config.logNoun}` : `Creating ${config.logNoun}`, {
      data: { name: values.name, id: record?.id },
    });

    try {
      if (isEditing && record) {
        await config.update(record.id, values.name);
        toast.success(config.texts.updated);
      } else {
        await config.create(values.name);
        toast.success(config.texts.created);
      }

      await queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      onSuccess?.();
      handleOpenChange(false);
    } catch (error) {
      logger.error(`Error saving ${config.logNoun}`, { data: { error } });
      const message =
        error instanceof Error && error.message.includes('Unique') ? config.texts.duplicate : config.texts.saveError;
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? config.texts.editTitle : config.texts.createTitle}</DialogTitle>
          <DialogDescription>
            {isEditing ? config.texts.editDescription : config.texts.createDescription}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder={config.placeholder} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? 'Guardando...'
                  : isEditing
                    ? 'Guardar cambios'
                    : config.texts.createButton}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
