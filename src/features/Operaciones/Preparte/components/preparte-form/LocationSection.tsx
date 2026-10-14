'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Logger } from '@/lib/logger';
import { resolveServiceAreaId, resolveServiceSectorId } from '../../lib/service-relation-id';
import { cn } from '@/lib/utils';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import moment from 'moment';
import { Fragment, type ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { PreparteFormData } from '../../schemas/preparte-form';
import type { Cliente } from '../../types/entities';
import type { AreaOption, ContractItemOption, Contrato, EquipmentOption, ItemRow, SectorOption } from './types';

const logger = new Logger('PreparteForm');

function PageGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

interface LocationSectionProps {
  form: UseFormReturn<PreparteFormData>;
  clientes: Cliente[];
  isEditing: boolean;
  isLoading: boolean;
  sectorList: SectorOption[];
  areaList: AreaOption[];
  equipmentList: EquipmentOption[];
  isLoadingSectors: boolean;
  isLoadingAreas: boolean;
  isLoadingEquipments: boolean;
  /** `page`: campos en grilla de dos columnas dentro de un SectionCard. Por defecto, el Sheet. */
  variant?: 'sheet' | 'page';
}

/**
 * Ubicación del servicio: sector, área y equipos del cliente.
 * Sección extraída de `PreparteForm` (el formulario superaba las 1.000 líneas).
 */
export function LocationSection({ form, clientes, isEditing, isLoading, sectorList, areaList, equipmentList, isLoadingSectors, isLoadingAreas, isLoadingEquipments, variant = 'sheet' }: LocationSectionProps) {
  const Wrapper = variant === 'page' ? PageGrid : Fragment;
  return (
    <Wrapper>
            {/* Sector del Cliente */}
            <FormField
              control={form.control}
              name="sector_service_id"
              render={({ field }) => {
                const selectedCustomer = clientes.find((c) => c.id === form.watch('cliente_id')) as Cliente | undefined;
                const selectedServiceId = form.watch('contrato_id');
                const baseSectorOptions = sectorList.map((s) => ({ label: s.name, value: s.id }));
                // If current selected value isn't in options, try to derive label from relations and inject it
                let sectorOptions = baseSectorOptions;
                if (field.value && !baseSectorOptions.some((o) => o.value === field.value)) {
                  const svc = selectedCustomer?.customer_services?.find((s) => s.id === selectedServiceId);
                  const matchByServiceSectorId = svc?.service_sectors?.find((ss) => ss.id === field.value);
                  const matchBySectorId = svc?.service_sectors?.find((ss) => ss.sectors?.id === field.value);
                  // Fallback across all services for the cliente if contrato_id not matched yet
                  const anySvcMatchByServiceSectorId =
                    matchByServiceSectorId ||
                    selectedCustomer?.customer_services
                      ?.flatMap((s) => s.service_sectors || [])
                      .find((ss) => ss.id === field.value);
                  const anySvcMatchBySectorId =
                    matchBySectorId ||
                    selectedCustomer?.customer_services
                      ?.flatMap((s) => s.service_sectors || [])
                      .find((ss) => ss.sectors?.id === field.value);

                  // El valor puede venir como `sectors.id` en vez de `service_sectors.id`.
                  // La traducción es compartida: `lib/service-relation-id`.
                  const resolvedSectorId = resolveServiceSectorId(
                    field.value,
                    selectedCustomer?.customer_services,
                    selectedServiceId
                  );
                  if (resolvedSectorId && field.value !== resolvedSectorId) {
                    form.setValue('sector_service_id', resolvedSectorId, {
                      shouldDirty: false,
                      shouldValidate: false,
                    });
                  }

                  const derivedLabel =
                    matchByServiceSectorId?.sectors?.name ||
                    matchBySectorId?.sectors?.name ||
                    anySvcMatchByServiceSectorId?.sectors?.name ||
                    anySvcMatchBySectorId?.sectors?.name;
                  if (derivedLabel) {
                    sectorOptions = [{ label: derivedLabel, value: field.value }, ...baseSectorOptions];
                  }
                }

                return (
                  <FormItem>
                    <FormLabel>Sector del Cliente</FormLabel>
                    <MultiSelectCombobox
                      data-testid="sector-select"
                      options={sectorOptions}
                      selectedValues={field.value ? [field.value] : []}
                      onChange={(vals) => field.onChange(vals[0] || '')}
                      placeholder="Seleccionar sector"
                      disabled={!selectedCustomer || !selectedServiceId || isEditing}
                      emptyMessage={
                        !selectedCustomer || !selectedServiceId
                          ? 'Seleccione un cliente y contrato'
                          : 'Sin sectores disponibles para este contrato'
                      }
                      isLoading={isLoadingSectors}
                      maxSelections={1}
                    />
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Área del Cliente */}
            <FormField
              control={form.control}
              name="areas_service_id"
              render={({ field }) => {
                const selectedCustomer = clientes.find((c) => c.id === form.watch('cliente_id')) as Cliente | undefined;
                const selectedServiceId = form.watch('contrato_id');
                const baseAreaOptions = areaList.map((a) => ({ label: a.name, value: a.id }));
                // If current selected value isn't in options, try to derive label from relations and inject it
                let areaOptions = baseAreaOptions;
                if (field.value && !baseAreaOptions.some((o) => o.value === field.value)) {
                  const svc = selectedCustomer?.customer_services?.find((s) => s.id === selectedServiceId);
                  const matchByServiceAreaId = svc?.service_areas?.find((sa) => sa.id === field.value);
                  const matchByAreaClienteId = svc?.service_areas?.find((sa) => sa.areas_cliente?.id === field.value);
                  // Fallback across all services for the cliente
                  const anySvcMatchByServiceAreaId =
                    matchByServiceAreaId ||
                    selectedCustomer?.customer_services
                      ?.flatMap((s) => s.service_areas || [])
                      .find((sa) => sa.id === field.value);
                  const anySvcMatchByAreaClienteId =
                    matchByAreaClienteId ||
                    selectedCustomer?.customer_services
                      ?.flatMap((s) => s.service_areas || [])
                      .find((sa) => sa.areas_cliente?.id === field.value);
                  const derivedLabel =
                    matchByServiceAreaId?.areas_cliente?.nombre ||
                    matchByAreaClienteId?.areas_cliente?.nombre ||
                    anySvcMatchByServiceAreaId?.areas_cliente?.nombre ||
                    anySvcMatchByAreaClienteId?.areas_cliente?.nombre;
                  if (derivedLabel) {
                    areaOptions = [{ label: derivedLabel, value: field.value }, ...baseAreaOptions];
                  }
                }
                return (
                  <FormItem>
                    <FormLabel>Área del Cliente</FormLabel>
                    <MultiSelectCombobox
                      data-testid="area-select"
                      options={areaOptions}
                      selectedValues={field.value ? [field.value] : []}
                      onChange={(vals) => field.onChange(vals[0] || '')}
                      placeholder="Seleccionar área"
                      disabled={!selectedCustomer || !selectedServiceId || isEditing}
                      emptyMessage={
                        !selectedCustomer || !selectedServiceId
                          ? 'Seleccione un cliente y contrato'
                          : 'Sin áreas disponibles para este contrato'
                      }
                      isLoading={isLoadingAreas}
                      maxSelections={1}
                    />
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Equipos del Cliente */}
            <FormField
              control={form.control}
              name="equipos_cliente"
              render={({ field }) => {
                const selectedCustomer = clientes.find((c) => c.id === form.watch('cliente_id')) as Cliente | undefined;
                const selectedServiceId = form.watch('contrato_id');
                const equiposOptions = equipmentList.map((e) => ({ label: e.name, value: e.id }));
                const selectedValues = Array.isArray(field.value) ? field.value : [];
                return (
                  <FormItem>
                    <FormLabel>Equipos del Cliente</FormLabel>
                    <MultiSelectCombobox
                      data-testid="equipo-select"
                      options={equiposOptions}
                      selectedValues={selectedValues}
                      onChange={(vals) => field.onChange(vals)}
                      placeholder={
                        selectedValues.length > 0 ? `${selectedValues.length} seleccionado(s)` : 'Seleccionar equipos'
                      }
                      disabled={!selectedCustomer || !selectedServiceId || isEditing}
                      emptyMessage={
                        !selectedCustomer || !selectedServiceId
                          ? 'Seleccione un cliente y contrato'
                          : 'Sin equipos disponibles para este contrato/cliente'
                      }
                      isLoading={isLoadingEquipments}
                      maxSelections={1}
                    />
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
    </Wrapper>
  );
}
