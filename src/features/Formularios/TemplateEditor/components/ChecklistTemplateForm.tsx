'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Info, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  createChecklistTemplate,
  deleteChecklistTemplate,
  duplicateChecklistTemplate,
  updateChecklistTemplate,
} from '../actions.server';
import { LIMITS, emptySection, templateFormSchema, type TemplateFormValues } from '../lib/template-schema';
import { SectionEditor } from './SectionEditor';

type Props =
  | {
      mode: 'create';
      initialValues: TemplateFormValues;
      templateId?: undefined;
      answersCount?: 0;
      appliesTo?: string[];
    }
  | { mode: 'edit'; initialValues: TemplateFormValues; templateId: string; answersCount: number; appliesTo: string[] };

/**
 * Formulario del editor de plantillas de checklist (ticket 805). Un solo formulario: datos generales + secciones con
 * sus ítems. Con respuestas cargadas (`answersCount > 0`) lo existente no se puede quitar ni cambiar de tipo; lo
 * aplica también el servidor (`buildTemplatePlan`).
 */
export function ChecklistTemplateForm({ mode, initialValues, templateId, answersCount = 0, appliesTo = [] }: Props) {
  const router = useRouter();
  const locked = answersCount > 0;
  const [serverError, setServerError] = useState<string | null>(null);
  // Tras crear se navega: el botón queda bloqueado para no crear dos veces mientras termina la navegación.
  const [isDone, setIsDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: initialValues,
  });
  // `keyName` propio: el `id` de cada sección es el de la base y no se puede pisar.
  const sections = useFieldArray({ control: form.control, name: 'sections', keyName: 'key' });
  const sectionsError = form.formState.errors.sections?.root?.message ?? form.formState.errors.sections?.message;

  async function onSubmit(values: TemplateFormValues) {
    setServerError(null);
    const result =
      mode === 'create' ? await createChecklistTemplate(values) : await updateChecklistTemplate(templateId, values);
    if (!result.ok) {
      setServerError(result.error);
      toast.error(result.error);
      return;
    }
    setIsDone(true);
    toast.success(mode === 'create' ? 'Plantilla creada' : 'Plantilla guardada');
    router.push(`/dashboard/forms/${result.data.id}`);
  }

  function runAction(
    action: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>,
    done: () => void
  ) {
    setServerError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      setIsDone(true);
      done();
    });
  }

  const busy = form.formState.isSubmitting || isPending || isDone;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Datos generales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej.: Checklist diario de camioneta" maxLength={LIMITS.name} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descripción (opcional)</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={LIMITS.description} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4 rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel>Activa</FormLabel>
                    <FormDescription>
                      Las plantillas activas se ofrecen al cargar un checklist (QR del equipo y «Nueva respuesta»).
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <p className="text-muted-foreground text-sm">
              <span className="text-foreground font-medium">Aplica a: </span>
              {appliesTo.length > 0
                ? appliesTo.join(', ')
                : 'todos los equipos (no tiene tipos ni subtipos asignados).'}{' '}
              Se asigna desde Empresa → Equipos → Tipos de equipo.
            </p>
          </CardContent>
        </Card>

        {locked && (
          <Alert variant="info" role="note">
            <Info aria-hidden="true" />
            <AlertTitle>
              Esta plantilla ya tiene {answersCount} {answersCount === 1 ? 'respuesta' : 'respuestas'}
            </AlertTitle>
            <AlertDescription>
              Podés renombrar, reordenar, marcar ítems críticos y agregar secciones o ítems. Para quitar algo o cambiar
              el tipo de respuesta de un ítem, duplicá la plantilla y desactivá esta.
            </AlertDescription>
          </Alert>
        )}

        <section aria-labelledby="template-sections-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="template-sections-title" className="text-lg font-semibold">
                Secciones
              </h2>
              <p className="text-muted-foreground text-sm">
                Los ítems «Bueno / Malo» marcados como Malo generan un desvío; si son críticos, el checklist no aprueba.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => sections.append(emptySection(), { focusName: `sections.${sections.fields.length}.name` })}
              disabled={sections.fields.length >= LIMITS.sections}
            >
              <Plus aria-hidden="true" />
              Agregar sección
            </Button>
          </div>

          {sections.fields.length === 0 && (
            <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
              Todavía no hay secciones. Agregá al menos una con sus ítems.
            </div>
          )}

          {sections.fields.map((section, index) => (
            <SectionEditor
              key={section.key}
              control={form.control}
              index={index}
              total={sections.fields.length}
              persisted={Boolean(section.id)}
              locked={locked}
              onMove={(to) => sections.move(index, to)}
              onRemove={() => sections.remove(index)}
            />
          ))}

          {sectionsError && (
            <p role="alert" className="text-danger text-sm font-medium">
              {sectionsError}
            </p>
          )}
        </section>

        {serverError && (
          <Alert variant="destructive">
            <AlertTitle>No se pudo guardar</AlertTitle>
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {mode === 'edit' && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    runAction(
                      () => duplicateChecklistTemplate(templateId),
                      () => {
                        toast.success('Plantilla duplicada (inactiva)');
                        router.push('/dashboard/forms');
                      }
                    )
                  }
                >
                  <Copy aria-hidden="true" />
                  Duplicar
                </Button>
                {!locked && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="text-danger" disabled={busy}>
                        <Trash2 aria-hidden="true" />
                        Eliminar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar la plantilla?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se borran sus secciones e ítems. No tiene respuestas cargadas, así que no se pierde historial.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className={buttonVariants({ variant: 'destructive' })}
                          onClick={() =>
                            runAction(
                              () => deleteChecklistTemplate(templateId),
                              () => {
                                toast.success('Plantilla eliminada');
                                router.push('/dashboard/forms');
                              }
                            )
                          }
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Link
              href={mode === 'edit' ? `/dashboard/forms/${templateId}` : '/dashboard/forms'}
              className={buttonVariants({ variant: 'outline' })}
            >
              Cancelar
            </Link>
            <Button type="submit" disabled={busy} aria-busy={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Guardando…' : mode === 'create' ? 'Crear plantilla' : 'Guardar cambios'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
