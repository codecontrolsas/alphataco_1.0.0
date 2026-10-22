'use client';

import { Button } from '@/components/ui/button';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchCombobox } from '@/features/Warehouses/components/SearchCombobox';
import { cn } from '@/lib/utils';
import { InputFormField } from '@/shared/components/common/form-fields';
import { Package, PenLine, Trash2 } from 'lucide-react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import { searchPurchaseMaterialOptions } from '../../actions/request-queries.server';
import { searchSupplierOptions } from '../../actions/suppliers.server';
import { type PurchaseRequestFormValues } from '../../schemas/requests';

import type { LineLabels, Units } from './PurchaseRequestForm';

/** Una línea de la solicitud: material del catálogo o texto libre, cantidad, unidad, proveedor sugerido y fecha. */
interface LineFieldsProps {
  form: UseFormReturn<PurchaseRequestFormValues>;
  index: number;
  units: Units;
  labels: LineLabels[number];
  materialOnly: boolean;
  canRemove: boolean;
  onRemove: () => void;
  onLabel: (patch: LineLabels[number]) => void;
}

export function LineFields({
  form,
  index,
  units,
  labels,
  materialOnly,
  canRemove,
  onRemove,
  onLabel,
}: LineFieldsProps) {
  const kind = useWatch({ control: form.control, name: `lines.${index}.kind` });
  const setKind = (next: 'MATERIAL' | 'FREE_TEXT') => {
    if (next === kind) return;
    form.setValue(`lines.${index}.kind`, next);
    form.clearErrors(`lines.${index}`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums">Línea {index + 1}</span>
        {!materialOnly && (
          <div
            className="inline-flex rounded-md border p-0.5"
            role="group"
            aria-label={`Tipo de la línea ${index + 1}`}
          >
            {(
              [
                ['MATERIAL', 'Material', Package],
                ['FREE_TEXT', 'Texto libre', PenLine],
              ] as const
            ).map(([value, text, Icon]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={kind === value}
                className={cn('h-7 px-2', kind === value && 'bg-muted font-medium')}
                onClick={() => setKind(value)}
              >
                <Icon className="mr-1 h-3.5 w-3.5" />
                {text}
              </Button>
            ))}
          </div>
        )}
        {canRemove && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="ml-auto h-8 w-8 text-destructive hover:text-destructive"
            aria-label={`Quitar la línea ${index + 1}`}
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_minmax(0,10rem)]">
        {kind === 'MATERIAL' ? (
          <FormField
            control={form.control}
            name={`lines.${index}.materialId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Material</FormLabel>
                <FormControl>
                  <SearchCombobox
                    queryKey={['purchase-material-options']}
                    search={searchPurchaseMaterialOptions}
                    value={field.value}
                    selectedLabel={labels.material ?? null}
                    onSelect={(option) => {
                      field.onChange(option?.id ?? '');
                      onLabel({ material: option?.label, unit: option?.unit });
                    }}
                    placeholder="Elegí un material"
                    searchPlaceholder="Código o nombre…"
                    noun="materiales"
                    disabled={materialOnly}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <InputFormField
            control={form.control}
            name={`lines.${index}.description`}
            label="Descripción"
            placeholder="Ej.: Rectificado de tapa de cilindros"
          />
        )}

        <FormField
          control={form.control}
          name={`lines.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cantidad{kind === 'MATERIAL' && labels.unit ? ` (${labels.unit})` : ''}</FormLabel>
              <FormControl>
                <Input inputMode="decimal" className="tabular-nums" placeholder="0" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {kind === 'FREE_TEXT' ? (
          <FormField
            control={form.control}
            name={`lines.${index}.unitId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unidad</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elegí" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name} ({u.abbreviation})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <div className="hidden md:block" />
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FormField
          control={form.control}
          name={`lines.${index}.suggestedSupplierId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Proveedor sugerido (opcional)</FormLabel>
              <FormControl>
                <SearchCombobox
                  queryKey={['purchase-supplier-options']}
                  search={searchSupplierOptions}
                  value={field.value}
                  selectedLabel={labels.supplier ?? null}
                  onSelect={(option) => {
                    field.onChange(option?.id ?? '');
                    onLabel({ supplier: option?.label });
                  }}
                  placeholder="Sin proveedor sugerido"
                  searchPlaceholder="Razón social o CUIT…"
                  noun="proveedores"
                  renderOption={(o) => (
                    <span className="flex flex-col">
                      <span>{o.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{o.cuit}</span>
                    </span>
                  )}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <InputFormField
          control={form.control}
          name={`lines.${index}.notes`}
          label="Observaciones (opcional)"
          placeholder="Marca preferida, medida, urgencia…"
        />
      </div>
    </div>
  );
}
