'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext, useFormState, useWatch, type Control } from 'react-hook-form';
import {
  ITEM_KINDS,
  ITEM_KIND_LABELS,
  LIMITS,
  emptyItem,
  type ItemKind,
  type TemplateFormValues,
} from '../lib/template-schema';

type MoveControlsProps = {
  label: string;
  index: number;
  total: number;
  onMove: (to: number) => void;
  onRemove: () => void;
  canRemove: boolean;
  removeHint?: string;
  className?: string;
};

/** Subir / bajar / quitar con botones (accesibles por teclado, sin arrastrar). */
function MoveControls({ label, index, total, onMove, onRemove, canRemove, removeHint, className }: MoveControlsProps) {
  return (
    <div className={cn('flex shrink-0 items-center gap-1', className)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Subir ${label}`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Bajar ${label}`}
        disabled={index === total - 1}
        onClick={() => onMove(index + 1)}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-danger"
        aria-label={`Quitar ${label}`}
        title={canRemove ? undefined : removeHint}
        disabled={!canRemove}
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  );
}

type ItemRowProps = {
  control: Control<TemplateFormValues>;
  sectionIndex: number;
  index: number;
  total: number;
  persisted: boolean;
  locked: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
  canRemoveLast: boolean;
};

function ItemRow({
  control,
  sectionIndex,
  index,
  total,
  persisted,
  locked,
  onMove,
  onRemove,
  canRemoveLast,
}: ItemRowProps) {
  const base = `sections.${sectionIndex}.items.${index}` as const;
  const kind = useWatch({ control, name: `${base}.kind` });
  const label = useWatch({ control, name: `${base}.label` });
  const frozen = locked && persisted;
  const itemName = `ítem ${index + 1}${label ? ` «${label}»` : ''}`;

  return (
    <li className="bg-muted/30 space-y-3 rounded-lg border p-3">
      {/* En móvil: número y controles arriba, campos debajo a todo el ancho. */}
      <div className="flex flex-wrap items-start gap-2">
        <span className="text-muted-foreground mt-2 w-6 shrink-0 text-right text-sm tabular-nums" aria-hidden="true">
          {index + 1}.
        </span>
        <div className="order-3 grid min-w-0 basis-full gap-3 sm:order-2 sm:flex-1 sm:basis-0 md:grid-cols-[minmax(0,1fr)_220px]">
          <FormField
            control={control}
            name={`${base}.label`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">Texto del ítem {index + 1}</FormLabel>
                <FormControl>
                  <Input placeholder="Ej.: Luces de freno" maxLength={LIMITS.itemLabel} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`${base}.kind`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">Tipo de respuesta del ítem {index + 1}</FormLabel>
                <Select value={field.value} onValueChange={(v) => field.onChange(v as ItemKind)} disabled={frozen}>
                  <FormControl>
                    <SelectTrigger
                      className="w-full"
                      title={frozen ? 'Tiene respuestas: el tipo no se cambia' : undefined}
                    >
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ITEM_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {ITEM_KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <MoveControls
          label={itemName}
          index={index}
          total={total}
          onMove={onMove}
          onRemove={onRemove}
          canRemove={!frozen && canRemoveLast}
          removeHint={frozen ? 'Tiene respuestas: no se puede quitar' : 'La sección necesita al menos un ítem'}
          className="order-2 ml-auto sm:order-3"
        />
      </div>

      {kind === 'options' && (
        <FormField
          control={control}
          name={`${base}.options`}
          render={({ field }) => (
            <FormItem className="sm:ml-8">
              <FormLabel>Opciones</FormLabel>
              <FormControl>
                <Input placeholder="Ej.: Lleno, Medio, Reserva" maxLength={LIMITS.options} {...field} />
              </FormControl>
              <FormDescription>
                Separadas por coma. Se agrega sola la opción «No aplica».
                {frozen && ' Con respuestas cargadas se pueden agregar opciones, no quitar ni renombrar.'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {kind === 'bm' && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 sm:ml-8">
          <FormField
            control={control}
            name={`${base}.is_critical`}
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                </FormControl>
                <FormLabel className="font-normal">Crítico (si está Malo, el checklist no aprueba)</FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name={`${base}.double_side`}
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={(v) => field.onChange(v === true)}
                    disabled={frozen}
                  />
                </FormControl>
                <FormLabel className="font-normal">Izquierda y derecha</FormLabel>
              </FormItem>
            )}
          />
        </div>
      )}
    </li>
  );
}

type SectionEditorProps = {
  control: Control<TemplateFormValues>;
  index: number;
  total: number;
  /** La sección ya existe en la base (tiene `id`). */
  persisted: boolean;
  /** La plantilla tiene respuestas: lo guardado no se quita. */
  locked: boolean;
  onMove: (to: number) => void;
  onRemove: () => void;
};

export function SectionEditor({ control, index, total, persisted, locked, onMove, onRemove }: SectionEditorProps) {
  const items = useFieldArray({ control, name: `sections.${index}.items`, keyName: 'key' });
  const { setFocus } = useFormContext<TemplateFormValues>();
  // Mover o quitar desmonta / deshabilita el botón con foco: se lo devuelve al texto del ítem afectado.
  const focusItem = (at: number) => requestAnimationFrame(() => setFocus(`sections.${index}.items.${at}.label`));
  const name = useWatch({ control, name: `sections.${index}.name` });
  const { errors } = useFormState({ control, name: `sections.${index}.items` });
  const itemsError = errors.sections?.[index]?.items?.root?.message ?? errors.sections?.[index]?.items?.message;
  const sectionLabel = `sección ${index + 1}${name ? ` «${name}»` : ''}`;
  const titleId = `template-section-${index}-title`;

  return (
    <Card role="group" aria-labelledby={titleId}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start gap-2">
          <h3 id={titleId} className="text-muted-foreground mt-2 shrink-0 text-sm font-medium">
            Sección {index + 1}
          </h3>
          <FormField
            control={control}
            name={`sections.${index}.name`}
            render={({ field }) => (
              <FormItem className="order-3 min-w-0 basis-full sm:order-2 sm:flex-1 sm:basis-0">
                <FormLabel className="sr-only">Nombre de la sección {index + 1}</FormLabel>
                <FormControl>
                  <Input placeholder="Ej.: Luces y señalización" maxLength={LIMITS.sectionName} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <MoveControls
            label={sectionLabel}
            index={index}
            total={total}
            onMove={onMove}
            onRemove={onRemove}
            canRemove={!(locked && persisted)}
            removeHint="Tiene respuestas: no se puede quitar"
            className="order-2 ml-auto sm:order-3"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2" aria-label={`Ítems de la ${sectionLabel}`}>
          {items.fields.map((item, itemIndex) => (
            <ItemRow
              key={item.key}
              control={control}
              sectionIndex={index}
              index={itemIndex}
              total={items.fields.length}
              persisted={Boolean(item.id)}
              locked={locked}
              onMove={(to) => {
                items.move(itemIndex, to);
                focusItem(to);
              }}
              onRemove={() => {
                items.remove(itemIndex);
                focusItem(Math.min(itemIndex, items.fields.length - 2));
              }}
              canRemoveLast={items.fields.length > 1}
            />
          ))}
        </ol>
        {itemsError && (
          <p role="alert" className="text-danger text-sm font-medium">
            {itemsError}
          </p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={items.fields.length >= LIMITS.itemsPerSection}
          onClick={() =>
            items.append(emptyItem(), { focusName: `sections.${index}.items.${items.fields.length}.label` })
          }
        >
          <Plus aria-hidden="true" />
          Agregar ítem
        </Button>
      </CardContent>
    </Card>
  );
}
