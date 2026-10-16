'use client';

import { Button } from '@/components/ui/button';
import { FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Plus, X } from 'lucide-react';
import moment from 'moment';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { DateRangePresetPicker } from '../../components/DateRangePresetPicker';
import { dateToIsoDay, inclusiveDays } from '../../lib/massive-ranges';

/** Forma común de los formularios de carga: ambos tienen una lista `dateRanges` de fechas del calendario. */
interface RangesForm {
  dateRanges: { from: Date; to: Date }[];
}

interface DateRangeListProps {
  /** Cuántas filas admite el modo actual. Con 1 no se muestran agregar ni quitar. */
  maxRanges: number;
  /** Tope de días entre todos los rangos. */
  maxTotalDays: number;
  /** Primer día elegible (las cargas masivas arrancan hoy); sin valor se admiten fechas pasadas. */
  minDate?: Date;
  presets?: { label: string; days: number }[];
}

const ISO_DAY = 'YYYY-MM-DD';

/** Lista de rangos de fechas: un selector con atajos por fila, más un resumen de días usados. */
export function DateRangeList({ maxRanges, maxTotalDays, minDate, presets }: DateRangeListProps) {
  const { control, formState } = useFormContext<RangesForm>();
  const { fields, append, remove } = useFieldArray({ control, name: 'dateRanges' });
  const ranges = useWatch({ control, name: 'dateRanges' });

  const totalDays = (ranges ?? []).reduce(
    (sum, range) =>
      range?.from && range?.to
        ? sum + inclusiveDays({ from: dateToIsoDay(range.from), to: dateToIsoDay(range.to) })
        : sum,
    0
  );
  const canAdd = maxRanges > 1 && fields.length < maxRanges;

  const addRange = () => {
    const last = ranges?.[ranges.length - 1];
    const start = last?.to ? moment(last.to).add(1, 'day') : moment(minDate ?? undefined);
    const day = moment(start.format(ISO_DAY), ISO_DAY).toDate();
    append({ from: day, to: day });
  };

  const listError = formState.errors.dateRanges?.root?.message ?? formState.errors.dateRanges?.message;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <li key={field.id}>
            <FormField
              control={control}
              name={`dateRanges.${index}`}
              render={({ field: rangeField }) => (
                <FormItem>
                  <div className="flex items-start gap-2">
                    <DateRangePresetPicker
                      className="min-w-0 flex-1"
                      value={rangeField.value}
                      onChange={rangeField.onChange}
                      presets={presets}
                      minDate={minDate}
                      maxDays={maxTotalDays}
                    />
                    {maxRanges > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        aria-label={`Quitar el rango ${index + 1}`}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </li>
        ))}
      </ul>

      {canAdd ? (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={addRange}>
          <Plus aria-hidden="true" />
          Agregar rango
        </Button>
      ) : null}

      <p className="text-muted-foreground text-xs tabular-nums">
        {totalDays} {totalDays === 1 ? 'día' : 'días'} en {fields.length} {fields.length === 1 ? 'rango' : 'rangos'}
        {maxRanges > 1 ? ` · máximo ${maxTotalDays} días en total` : ''}
      </p>

      {typeof listError === 'string' ? (
        <p role="alert" className="text-destructive text-sm">
          {listError}
        </p>
      ) : null}
    </div>
  );
}
