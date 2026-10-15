'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createExternalApiClient } from '../actions.server';
import { createExternalApiClientSchema, type CreateExternalApiClientValues } from '../schemas';
import type { CreatedExternalApiClient } from '../types';
import { SecretRevealPanel } from './SecretRevealPanel';

const logger = new Logger('AccesosExternos/CreateExternalAccessModal');

/**
 * Alta de un acceso externo.
 *
 * Los dos pasos —datos y clave generada— viven en el MISMO dialogo: encadenar
 * un modal con otro deja la clave a merced de que el segundo se abra bien.
 */
export function CreateExternalAccessModal() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createdClient, setCreatedClient] = useState<CreatedExternalApiClient | null>(null);
  const [hasCopiedSecret, setHasCopiedSecret] = useState(false);
  const [showCloseGuard, setShowCloseGuard] = useState(false);

  const form = useForm<CreateExternalApiClientValues>({
    resolver: zodResolver(createExternalApiClientSchema),
    defaultValues: { name: '', notes: '' },
  });

  const resetAndClose = () => {
    setOpen(false);
    setShowCloseGuard(false);
    setCreatedClient(null);
    setHasCopiedSecret(false);
    form.reset();
    queryClient.invalidateQueries({ queryKey: ['external-api-clients'] });
  };

  const onSubmit = async (values: CreateExternalApiClientValues) => {
    try {
      const created = await createExternalApiClient(values);
      setCreatedClient(created);
      toast.success('Acceso externo creado. Copiá la clave antes de cerrar.');
    } catch (error) {
      logger.error('Error al crear el acceso externo', { data: { error } });
      toast.error('No se pudo crear el acceso externo');
    }
  };

  /** Con la clave en pantalla, cerrar sin copiar pide confirmacion */
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setOpen(true);
      return;
    }
    if (createdClient && !hasCopiedSecret) {
      setShowCloseGuard(true);
      return;
    }
    resetAndClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo acceso externo
          </Button>
        </DialogTrigger>

        <DialogContent
          className="sm:max-w-lg"
          // Con la clave visible no se cierra por click afuera ni con Escape
          onInteractOutside={(event) => {
            if (createdClient) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (createdClient) event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>{createdClient ? 'Credenciales generadas' : 'Crear acceso externo'}</DialogTitle>
            <DialogDescription>
              {createdClient
                ? `Entregale estos datos al responsable de ${createdClient.name}.`
                : 'Generá un usuario y una clave para que un sistema externo pueda consultar información de tu empresa.'}
            </DialogDescription>
          </DialogHeader>

          {createdClient ? (
            <>
              <SecretRevealPanel
                clientId={createdClient.clientId}
                secret={createdClient.secret}
                onSecretCopied={() => setHasCopiedSecret(true)}
              />
              <DialogFooter>
                <Button type="button" onClick={() => handleOpenChange(false)}>
                  Listo
                </Button>
              </DialogFooter>
            </>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre del sistema</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: ERP Contable - Consulta de legajos" {...field} />
                      </FormControl>
                      <FormDescription>Con qué sistema externo se corresponde este acceso</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas / contacto (opcional)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Ej: Responsable Juan Pérez - soporte@proveedor.com"
                          rows={3}
                          {...field}
                          value={field.value ?? ''}
                        />
                      </FormControl>
                      <FormDescription>A quién avisar antes de rotar la clave o revocar el acceso</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? 'Generando...' : 'Generar credenciales'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={showCloseGuard} onOpenChange={setShowCloseGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Ya copiaste la clave?</AlertDialogTitle>
            <AlertDialogDescription>
              Una vez que cierres esta ventana no vas a poder volver a verla. Si todavía no la copiaste, hacelo antes de
              continuar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={resetAndClose}>Sí, ya la copié</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
