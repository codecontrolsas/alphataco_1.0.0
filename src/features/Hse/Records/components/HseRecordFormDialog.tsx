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
import { Form } from '@/components/ui/form';
import { Logger } from '@/lib/logger';
import {
  DateFormField,
  InputFormField,
  SelectFormField,
  TextareaFormField,
} from '@/shared/components/common/form-fields';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { HseTrainingOption } from '../../actions/records.queries';
import { createHseRecord, updateHseRecord } from '../../actions/records.server';
import { HSE_QUERY_KEYS } from '../../lib/constants';
import { HSE_RECORD_MODALITY_LABELS, type HseRecordModality } from '../../lib/pdf-content';
import { hseRecordCreateSchema, type HseRecordCreateValues, type HseRecordFormValues } from '../../schemas/records';

const logger = new Logger('Hse/HseRecordFormDialog');

const MODALITY_OPTIONS = (Object.keys(HSE_RECORD_MODALITY_LABELS) as HseRecordModality[]).map((id) => ({
  id,
  name: HSE_RECORD_MODALITY_LABELS[id],
}));

/**
 * Alta (con la capacitación) o edición de los datos de un acta en borrador, en UN formulario. Capacitadores y
 * asistentes se ajustan en el detalle del acta.
 */
export function HseRecordFormDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode:
    | { kind: 'create'; trainings: HseTrainingOption[]; trainingId?: string }
    | { kind: 'edit'; recordId: string; values: HseRecordCreateValues };
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState(false);
  const isCreate = mode.kind === 'create';

  const form = useForm<HseRecordCreateValues>({
    resolver: zodResolver(hseRecordCreateSchema),
    defaultValues:
      mode.kind === 'edit'
        ? mode.values
        : {
            trainingId: mode.trainingId ?? '',
            heldOn: argentinaDate(),
            modality: 'in_person',
            location: '',
            durationMinutes: '',
            topics: '',
            observations: '',
          },
  });

  const save = useMutation({
    mutationFn: async (values: HseRecordCreateValues) => {
      if (mode.kind === 'edit') {
        // La capacitación no cambia: se envían solo los datos del acta.
        const data: HseRecordFormValues = {
          heldOn: values.heldOn,
          modality: values.modality,
          location: values.location,
          durationMinutes: values.durationMinutes,
          topics: values.topics,
          observations: values.observations,
        };
        unwrapAction(await updateHseRecord(mode.recordId, data));
        return { id: mode.recordId };
      }
      return unwrapAction(await createHseRecord(values));
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
      if (mode.kind === 'create') {
        setCreated(true);
        toast.success('Acta creada en borrador. Revisá capacitadores y asistentes antes de cerrarla.');
        router.push(`/dashboard/hse/records/${result.id}?tab=actas`);
        return;
      }
      toast.success('Acta guardada');
      onOpenChange(false);
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar el acta', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el acta');
    },
  });

  const busy = save.isPending || created;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? 'Nueva acta de capacitación' : 'Editar el acta'}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? 'Se guarda como borrador con los capacitadores habituales y quienes tienen la capacitación asignada. Después ajustás la lista y la cerrás.'
              : 'Mientras está en borrador se puede corregir. Al cerrarla queda congelada.'}
          </DialogDescription>
        </DialogHeader>
        {isCreate && mode.trainings.length === 0 ? (
          <p className="text-muted-foreground text-sm text-pretty" role="status">
            No hay capacitaciones publicadas. Publicá una capacitación para poder labrar su acta.
          </p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
              {isCreate && (
                <SelectFormField
                  control={form.control}
                  name="trainingId"
                  label="Capacitación"
                  placeholder="Elegí la capacitación"
                  options={mode.trainings}
                />
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <DateFormField control={form.control} name="heldOn" label="Fecha del dictado" />
                <SelectFormField
                  control={form.control}
                  name="modality"
                  label="Modalidad"
                  placeholder="Elegí la modalidad"
                  options={MODALITY_OPTIONS}
                />
                <InputFormField
                  control={form.control}
                  name="location"
                  label="Lugar (opcional)"
                  placeholder="Base Neuquén, sala 2"
                />
                <InputFormField
                  control={form.control}
                  name="durationMinutes"
                  label="Duración en minutos (opcional)"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={6000}
                />
              </div>
              <TextareaFormField
                control={form.control}
                name="topics"
                label="Temario"
                rows={4}
                placeholder="Qué se dictó: un tema por línea"
              />
              <TextareaFormField control={form.control} name="observations" label="Observaciones (opcional)" rows={3} />
              <DialogFooter>
                <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy} aria-busy={save.isPending}>
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
