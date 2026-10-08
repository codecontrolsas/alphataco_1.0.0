'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import {
  getMaterialAvailability,
  searchMaterialOptions,
  type MaterialOption,
} from '../../actions/options.server';
import { SearchCombobox } from '../../components/SearchCombobox';
import { formatQuantity } from '../../lib/format';
import { WAREHOUSE_QUERY_KEYS } from '../../lib/query-keys';
import { TRACKING_TYPE_LABELS } from '../../lib/labels';
import {
  isInboundLine,
  parseSerialNumbers,
  type StockMovementFormValues,
} from '../../schemas/stock-movement';
import { BatchOptions, UnitPicker } from './StockPickers';

interface MovementLineRowProps {
  form: UseFormReturn<StockMovementFormValues>;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
}

/**
 * Una linea del movimiento. Los campos dependen del tipo de movimiento y de como se controla el
 * material: cantidad; lote (entra con numero y vencimiento, sale eligiendo un lote con saldo);
 * o numeros de serie (entran tipeados, salen eligiendo unidades en stock).
 */
export function MovementLineRow({ form, index, canRemove, onRemove }: MovementLineRowProps) {
  const [material, setMaterial] = useState<MaterialOption | null>(null);
  const [type, warehouseId, line] = useWatch({
    control: form.control,
    name: ['type', 'warehouseId', `lines.${index}`],
  });

  const inbound = isInboundLine(type, line.adjustmentDirection);
  const tracking = line.trackingType;
  const path = `lines.${index}` as const;

  // Lo disponible en el deposito: informa en todas las lineas y alimenta lotes y unidades al salir.
  const availability = useQuery({
    queryKey: [...WAREHOUSE_QUERY_KEYS.availability, line.materialId, warehouseId],
    queryFn: () => getMaterialAvailability(line.materialId, warehouseId),
    enabled: Boolean(line.materialId && warehouseId),
    staleTime: 15 * 1000,
  });
  const available = availability.data;

  const selectMaterial = (option: MaterialOption | null) => {
    setMaterial(option);
    // Cambiar de material invalida lote, unidades y series de la linea anterior.
    form.setValue(`${path}.materialId`, option?.id ?? '', { shouldValidate: true });
    form.setValue(`${path}.trackingType`, option?.tracking_type ?? 'QUANTITY');
    form.setValue(`${path}.batchId`, '');
    form.setValue(`${path}.batchNumber`, '');
    form.setValue(`${path}.batchExpiresOn`, undefined);
    form.setValue(`${path}.serialNumbers`, '');
    form.setValue(`${path}.unitIds`, []);
  };

  const serialCount = tracking === 'SERIAL' && inbound ? parseSerialNumbers(line.serialNumbers).length : 0;

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-start gap-3">
        <span className="mt-2 w-6 shrink-0 text-right text-sm text-muted-foreground tabular-nums">{index + 1}</span>

        <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(16rem,2fr)_minmax(8rem,1fr)_minmax(8rem,1fr)]">
          <FormField
            control={form.control}
            name={`${path}.materialId`}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">Material</FormLabel>
                <SearchCombobox<MaterialOption>
                  queryKey={WAREHOUSE_QUERY_KEYS.materialOptions}
                  search={searchMaterialOptions}
                  value={field.value}
                  selectedLabel={material ? `${material.code} · ${material.name}` : null}
                  onSelect={selectMaterial}
                  placeholder="Elegí un material"
                  searchPlaceholder="Buscar por código o nombre"
                  noun="materiales"
                  renderOption={(option) => (
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{option.code}</span>
                      <span className="truncate">{option.name}</span>
                      {!option.is_active && <Badge variant="outline">Inactivo</Badge>}
                    </span>
                  )}
                />
                <FormMessage />
              </FormItem>
            )}
          />

          {type === 'ADJUSTMENT' ? (
            <FormField
              control={form.control}
              name={`${path}.adjustmentDirection`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Sentido del ajuste</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => {
                      field.onChange(v);
                      // El lado de entrada y el de salida piden datos distintos.
                      form.setValue(`${path}.unitIds`, []);
                      form.setValue(`${path}.serialNumbers`, '');
                      form.setValue(`${path}.batchId`, '');
                    }}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="OUT">Resta (faltante, rotura)</SelectItem>
                      <SelectItem value="IN">Suma (sobrante)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <div className="hidden md:block" />
          )}

          {tracking !== 'SERIAL' ? (
            <FormField
              control={form.control}
              name={`${path}.quantity`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">Cantidad</FormLabel>
                  <div className="flex items-center gap-2">
                    <FormControl>
                      <Input inputMode="decimal" placeholder="Cantidad" className="tabular-nums" {...field} />
                    </FormControl>
                    <span className="w-10 shrink-0 text-sm text-muted-foreground">{material?.unit ?? ''}</span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : (
            <p className="self-center text-sm text-muted-foreground tabular-nums">
              {inbound
                ? `${serialCount} ${serialCount === 1 ? 'unidad' : 'unidades'}`
                : `${line.unitIds.length} ${line.unitIds.length === 1 ? 'unidad' : 'unidades'}`}
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={`Quitar línea ${index + 1}`}
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {line.materialId && (
        <div className="mt-3 space-y-3 pl-9">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{TRACKING_TYPE_LABELS[tracking]}</span>
            <span aria-live="polite" className="tabular-nums">
              {!warehouseId
                ? 'Elegí el depósito para ver el disponible'
                : availability.isLoading
                  ? 'Consultando disponible…'
                  : available
                    ? `Disponible en el depósito: ${formatQuantity(available.total)} ${material?.unit ?? ''}`
                    : ''}
            </span>
          </div>

          {type === 'ENTRY' && (
            <FormField
              control={form.control}
              name={`${path}.unitCost`}
              render={({ field }) => (
                <FormItem className="max-w-56">
                  <FormLabel>Costo unitario</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0,00" className="tabular-nums" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {tracking === 'BATCH' && inbound && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name={`${path}.batchNumber`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lote</FormLabel>
                    <FormControl>
                      <Input placeholder="Número de lote" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={`${path}.batchExpiresOn`}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vencimiento</FormLabel>
                    <FormControl>
                      <EnhancedDatePicker date={field.value} setDate={field.onChange} placeholder="DD/MM/AAAA" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}

          {tracking === 'BATCH' && !inbound && (
            <FormField
              control={form.control}
              name={`${path}.batchId`}
              render={({ field }) => (
                <FormItem className="max-w-md">
                  <FormLabel>Lote</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={!available?.batches.length}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={available?.batches.length ? 'Elegí el lote' : 'Sin lotes con stock en el depósito'} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* Un lote vencido no sale ni se transfiere; el ajuste si lo descarta. */}
                      <BatchOptions
                        batches={available?.batches ?? []}
                        unit={material?.unit ?? ''}
                        allowExpired={type === 'ADJUSTMENT'}
                      />
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {tracking === 'SERIAL' && inbound && (
            <FormField
              control={form.control}
              name={`${path}.serialNumbers`}
              render={({ field }) => (
                <FormItem className="max-w-md">
                  <FormLabel>Números de serie</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Uno por línea (o separados por coma)" className="font-mono text-sm" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {tracking === 'SERIAL' && !inbound && (
            <FormField
              control={form.control}
              name={`${path}.unitIds`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unidades</FormLabel>
                  {available?.units.length ? (
                    <UnitPicker units={available.units} value={field.value} onChange={field.onChange} idPrefix={path} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {warehouseId ? 'No hay unidades de este material en el depósito.' : 'Elegí el depósito.'}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}
