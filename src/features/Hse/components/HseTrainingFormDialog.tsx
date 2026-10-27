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
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Logger } from '@/lib/logger';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { InputFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { createHseTraining, fetchHseTrainingFormOptions, updateHseTraining } from '../actions/trainings.server';
import { HSE_EXAM_LIMITS, HSE_QUERY_KEYS, HSE_TRAINING_KIND_LABELS, type HseTrainingKind } from '../lib/constants';
import { hseTrainingFormSchema, type HseTrainingFormInput, type HseTrainingFormValues } from '../schemas/trainings';
import { TargetsEditor } from './TargetsEditor';

const logger = new Logger('Hse/HseTrainingFormDialog');

const KINDS = Object.keys(HSE_TRAINING_KIND_LABELS) as HseTrainingKind[];

const EMPTY: HseTrainingFormInput = {
  title: '',
  description: '',
  kind: 'induction',
  passingScore: 70,
  maxAttempts: 3,
  timeLimitMinutes: '',
  shuffleQuestions: false,
  validityMonths: '',
  targets: [],
};

/**
 * Alta o edición de una capacitación en UN formulario: datos, examen (aprobación, intentos, tiempo, orden) y a quién
 * aplica. Publicada, la configuración del examen queda bloqueada (la base también lo impide): se editan los datos, la
 * vigencia de las próximas aprobaciones y los destinatarios.
 */
export function HseTrainingFormDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: { kind: 'create' } | { kind: 'edit'; trainingId: string; values: HseTrainingFormInput; published: boolean };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isCreate = mode.kind === 'create';
  const examLocked = mode.kind === 'edit' && mode.published;
  const [created, setCreated] = useState(false);

  const options = useQuery({
    queryKey: [...HSE_QUERY_KEYS.all, 'training-form-options'],
    queryFn: () => fetchHseTrainingFormOptions(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<HseTrainingFormInput, unknown, HseTrainingFormValues>({
    resolver: zodResolver(hseTrainingFormSchema),
    defaultValues: mode.kind === 'edit' ? mode.values : EMPTY,
  });

  const save = useMutation({
    mutationFn: async (values: HseTrainingFormValues) =>
      unwrapAction(
        mode.kind === 'edit' ? await updateHseTraining(mode.trainingId, values) : await createHseTraining(values)
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
      if (mode.kind === 'create') {
        setCreated(true);
        toast.success('Capacitación creada en borrador. Cargá el material y las preguntas.');
        router.push(`/dashboard/hse/trainings/${result.id}?tab=capacitaciones`);
        return;
      }
      toast.success(
        mode.published ? 'Capacitación guardada. Los destinatarios se actualizaron.' : 'Capacitación guardada'
      );
      onOpenChange(false);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar la capacitación', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la capacitación');
    },
  });

  const busy = save.isPending || created;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'Nueva capacitación' : 'Editar capacitación'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'Se guarda como borrador. Después cargás el material y las preguntas, y la publicás.'
              : examLocked
                ? 'Está publicada: el examen no se modifica. Si cambiás los destinatarios, los nuevos quedan pendientes y los que salen se archivan con su resultado.'
                : 'El borrador todavía no lo ve nadie.'}
          </DialogDescription>
        </DialogHeader>

        {options.isLoading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Cargando el formulario">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : options.isError || !options.data ? (
          <StateBlock
            variant="error"
            title="No se pudieron cargar las opciones"
            description={options.error instanceof Error ? options.error.message : undefined}
            action={
              <Button type="button" variant="outline" onClick={() => void options.refetch()}>
                Reintentar
              </Button>
            }
          />
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
              <InputFormField control={form.control} name="title" label="Título" placeholder="Uso de matafuegos" />
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="min-h-11 sm:min-h-9">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {HSE_TRAINING_KIND_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <TextareaFormField
                control={form.control}
                name="description"
                label="Descripción (opcional)"
                rows={3}
                placeholder="Qué se aprende y por qué es obligatoria"
              />

              <Separator />
              <fieldset className="space-y-4" disabled={examLocked}>
                <legend className="text-sm font-medium">
                  Examen{' '}
                  {examLocked && (
                    <span className="text-muted-foreground font-normal">(bloqueado: ya está publicada)</span>
                  )}
                </legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  <InputFormField
                    control={form.control}
                    name="passingScore"
                    label="Aprueba con (%)"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={100}
                  />
                  <InputFormField
                    control={form.control}
                    name="maxAttempts"
                    label="Intentos"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={HSE_EXAM_LIMITS.maxAttempts}
                  />
                  <InputFormField
                    control={form.control}
                    name="timeLimitMinutes"
                    label="Tiempo (min, opcional)"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={HSE_EXAM_LIMITS.maxTimeLimitMinutes}
                    placeholder="Sin límite"
                  />
                </div>
                <p className="text-sm text-muted-foreground text-pretty">
                  El puntaje es el porcentaje de puntos obtenidos sobre el total (cada pregunta vale los puntos que le
                  asignes). Las preguntas sin responder cuentan como incorrectas.
                </p>
                <FormField
                  control={form.control}
                  name="shuffleQuestions"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Mezclar el orden de las preguntas</FormLabel>
                        <FormDescription>Cada intento muestra las preguntas en otro orden.</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} disabled={examLocked} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </fieldset>
              <InputFormField
                control={form.control}
                name="validityMonths"
                label="Vigencia de la aprobación en meses (opcional)"
                type="number"
                inputMode="numeric"
                min={1}
                max={HSE_EXAM_LIMITS.maxValidityMonths}
                placeholder="No vence"
              />

              <Separator />
              <FormField
                control={form.control}
                name="targets"
                render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>A quién aplica</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Quienes coincidan con alguno la van a ver en el portal. Si alguien cambia de puesto o sector, se
                      actualiza solo.
                    </p>
                    <TargetsEditor
                      value={field.value}
                      onChange={field.onChange}
                      options={options.data}
                      invalid={Boolean(fieldState.error)}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Guardando…' : isCreate ? 'Crear borrador' : 'Guardar'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
