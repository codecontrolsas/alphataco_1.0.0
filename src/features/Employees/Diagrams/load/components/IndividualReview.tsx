'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatDateAr } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { individualReviewSchema, type IndividualReviewValues } from '../schemas';
import { NoveltyBadge } from './NoveltyBadge';

interface IndividualReviewProps {
  days: IndividualReviewValues['days'];
  employeeLabel: string;
  novelty: { name: string | null; color: string | null };
  /** Con el interruptor encendido cada día muestra su comentario editable. */
  customizeComments: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  isSubmitting: boolean;
  onBack: () => void;
  onConfirm: (days: IndividualReviewValues['days']) => void;
}

/**
 * Revisión de una carga individual, todo en la misma pantalla: un renglón por día con su decisión (crear u omitir los
 * días libres; reemplazar o conservar los que ya tienen novedad) y, si se pidió, su comentario propio.
 */
export function IndividualReview({
  days,
  employeeLabel,
  novelty,
  customizeComments,
  canCreate,
  canUpdate,
  isSubmitting,
  onBack,
  onConfirm,
}: IndividualReviewProps) {
  const form = useForm<IndividualReviewValues>({
    resolver: zodResolver(individualReviewSchema),
    defaultValues: { days },
  });
  const { fields } = useFieldArray({ control: form.control, name: 'days' });
  const watched = useWatch({ control: form.control, name: 'days' });

  const count = (action: IndividualReviewValues['days'][number]['action']) =>
    watched.filter((day) => day.action === action).length;
  const toCreate = count('create');
  const toReplace = count('replace');
  const existingCount = watched.filter((day) => day.existingId).length;
  const changes = toCreate + toReplace;

  const setAllExisting = (action: 'replace' | 'keep') => {
    watched.forEach((day, index) => {
      if (day.existingId) form.setValue(`days.${index}.action`, action);
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => onConfirm(values.days))}
        className="flex max-w-3xl flex-col gap-5"
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={onBack}
            disabled={isSubmitting}
          >
            <ArrowLeft aria-hidden="true" />
            Volver a los datos
          </Button>
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <dt className="text-muted-foreground shrink-0">Empleado:</dt>
              <dd className="truncate font-medium">{employeeLabel}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-muted-foreground shrink-0">Novedad a aplicar:</dt>
              <dd>
                <NoveltyBadge name={novelty.name} color={novelty.color} />
              </dd>
            </div>
          </dl>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center" aria-live="polite">
          <div className="bg-ok-subtle text-ok-subtle-foreground rounded-lg px-2 py-3">
            <p className="font-mono text-2xl font-semibold tabular-nums">{toCreate}</p>
            <p className="text-xs">A crear</p>
          </div>
          <div className="bg-brand-subtle text-brand-subtle-foreground rounded-lg px-2 py-3">
            <p className="font-mono text-2xl font-semibold tabular-nums">{toReplace}</p>
            <p className="text-xs">A reemplazar</p>
          </div>
          <div className="bg-muted text-muted-foreground rounded-lg px-2 py-3">
            <p className="font-mono text-2xl font-semibold tabular-nums">{watched.length - changes}</p>
            <p className="text-xs">Sin cambios</p>
          </div>
        </div>

        {existingCount > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground text-sm">
              {existingCount} {existingCount === 1 ? 'día ya tiene' : 'días ya tienen'} una novedad.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAllExisting('replace')}
              disabled={!canUpdate || isSubmitting}
            >
              Reemplazar todos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAllExisting('keep')}
              disabled={isSubmitting}
            >
              Conservar todos
            </Button>
          </div>
        ) : null}

        <ul className="divide-y rounded-lg border">
          {fields.map((field, index) => {
            const isExisting = Boolean(field.existingId);
            const dateLabel = formatDateAr(field.date);
            return (
              <li key={field.id} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="w-24 font-mono text-sm tabular-nums">{dateLabel}</span>
                    {isExisting ? (
                      <span className="flex items-center gap-1.5 text-sm">
                        <span className="text-muted-foreground">Tiene</span>
                        <NoveltyBadge name={field.previousName} color={field.previousColor} />
                      </span>
                    ) : (
                      <Badge variant="success">Libre</Badge>
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name={`days.${index}.action`}
                    render={({ field: actionField }) => (
                      <FormItem>
                        <ToggleGroup
                          type="single"
                          variant="outline"
                          size="sm"
                          value={actionField.value}
                          onValueChange={(next) => {
                            if (next) actionField.onChange(next);
                          }}
                          aria-label={`Qué hacer con el ${dateLabel}`}
                          disabled={isSubmitting}
                        >
                          {isExisting ? (
                            <>
                              <ToggleGroupItem value="keep">Conservar</ToggleGroupItem>
                              <ToggleGroupItem value="replace" disabled={!canUpdate}>
                                Reemplazar
                              </ToggleGroupItem>
                            </>
                          ) : (
                            <>
                              <ToggleGroupItem value="skip">Omitir</ToggleGroupItem>
                              <ToggleGroupItem value="create" disabled={!canCreate}>
                                Crear
                              </ToggleGroupItem>
                            </>
                          )}
                        </ToggleGroup>
                      </FormItem>
                    )}
                  />
                </div>

                {customizeComments ? (
                  <FormField
                    control={form.control}
                    name={`days.${index}.comments`}
                    render={({ field: commentField }) => (
                      <FormItem>
                        <FormControl>
                          <Textarea
                            {...commentField}
                            aria-label={`Comentario del ${dateLabel}`}
                            placeholder="Sin comentario"
                            className="min-h-9 py-1.5 text-sm"
                            disabled={isSubmitting}
                          />
                        </FormControl>
                        {isExisting ? (
                          <p className="text-muted-foreground text-xs">
                            Si lo dejás vacío se conserva el comentario que ya tenía el día.
                          </p>
                        ) : null}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
            Volver
          </Button>
          <Button type="submit" disabled={isSubmitting || changes === 0}>
            {isSubmitting
              ? 'Guardando…'
              : changes === 0
                ? 'No hay cambios para guardar'
                : `Confirmar (${changes} ${changes === 1 ? 'cambio' : 'cambios'})`}
          </Button>
        </div>
      </form>
    </Form>
  );
}
