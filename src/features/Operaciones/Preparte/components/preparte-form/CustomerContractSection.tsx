'use client';

import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MultiSelectCombobox } from '@/components/ui/multi-select-combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import moment from 'moment';
import 'moment/locale/es';
import { Fragment, type ReactNode } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { PreparteFormData } from '../../schemas/preparte-form';
import type { Cliente } from '../../types/entities';
import type { Contrato } from './types';

function PageGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

interface CustomerContractSectionProps {
  form: UseFormReturn<PreparteFormData>;
  clientes: Cliente[];
  contratos: Contrato[];
  isEditing: boolean;
  isLoading: boolean;
  isLoadingContratos: boolean;
  /** `page`: campos en grilla de dos columnas dentro de un SectionCard. Por defecto, el Sheet. */
  variant?: 'sheet' | 'page';
}

/**
 * Datos del cliente: cliente, contrato, fecha de solicitud, solicitante y estado.
 * Sección extraída de `PreparteForm` (el formulario superaba las 1.000 líneas).
 */
export function CustomerContractSection({
  form,
  clientes,
  contratos,
  isEditing,
  isLoading,
  isLoadingContratos,
  variant = 'sheet',
}: CustomerContractSectionProps) {
  const Wrapper = variant === 'page' ? PageGrid : Fragment;
  return (
    <Wrapper>
      {/* Selector de Clientes */}
      <FormField
        control={form.control}
        name="cliente_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Cliente</FormLabel>
            <MultiSelectCombobox
              data-testid="cliente-select"
              options={clientes.map((cliente) => ({
                label: cliente.name,
                value: cliente.id,
              }))}
              disabled={isEditing}
              selectedValues={field.value ? [field.value] : []} // Asegurar que sea un array
              onChange={(selectedIds) => {
                const value = selectedIds[0] || '';
                field.onChange(value);
                // reset dependientes - los hooks se refrescan automáticamente al cambiar cliente_id
                form.setValue('contrato_id', '');
                form.setValue('sector_service_id', '');
                form.setValue('areas_service_id', '');
                form.setValue('equipos_cliente', []);
              }}
              placeholder={clientes.find((c) => c.id === field.value)?.name || 'Seleccionar cliente'}
              emptyMessage="No hay clientes disponibles"
              maxSelections={1} // Para selección única
            />
            <FormMessage />
          </FormItem>
        )}
      />
      {/* Selector de Contrato */}
      <FormField
        control={form.control}
        name="contrato_id"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Contrato</FormLabel>
            <MultiSelectCombobox
              data-testid="contrato-select"
              options={contratos.map((contrato) => ({
                label: contrato.service_name || 'Sin nombre',
                value: contrato.id,
              }))}
              selectedValues={field.value ? [field.value] : []}
              onChange={(selectedIds) => {
                const value = selectedIds[0] || '';
                field.onChange(value);
                // reset dependientes del contrato
                form.setValue('sector_service_id', '');
                form.setValue('areas_service_id', '');
                form.setValue('equipos_cliente', []);
              }}
              placeholder="Seleccionar contrato"
              emptyMessage="No hay contratos disponibles"
              disabled={!form.watch('cliente_id') || isLoading || isEditing}
              isLoading={isLoadingContratos}
              maxSelections={1}
            />
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Fecha de Solicitud */}
      <FormField
        control={form.control}
        name="requestDate"
        render={({ field }) => (
          <FormItem className="flex flex-col">
            <FormLabel>Fecha de Solicitud</FormLabel>
            {isEditing ? (
              <Input
                disabled
                value={field.value ? moment(field.value).format('DD/MM/YYYY') : ''}
                aria-label="Fecha de solicitud"
              />
            ) : (
              <FormControl>
                <EnhancedDatePicker
                  date={field.value}
                  setDate={(selectedDate) => {
                    // La fecha de solicitud no puede ser futura
                    if (selectedDate && moment(selectedDate).isAfter(moment(), 'day')) {
                      field.onChange(undefined);
                      return;
                    }
                    field.onChange(selectedDate);
                  }}
                  placeholder="DD/MM/AAAA"
                />
              </FormControl>
            )}
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Solicitante */}
      <FormField
        control={form.control}
        name="solicitante"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Solicitante</FormLabel>
            <FormControl>
              <Input
                placeholder="Ingrese el solicitante"
                className="bg-background"
                {...field}
                disabled={isEditing}
                data-testid="solicitante-input"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      {isEditing && (
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => {
            // Obtener el valor actual del estado
            const currentStatusWatch = form.watch('status');
            // const currentStatus = field.value as string;

            return (
              <FormItem>
                <FormLabel>Estado</FormLabel>
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                  }}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Seleccione un estado" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem
                      className="hover:bg-accent bg-background"
                      value="pendiente"
                      disabled={field.value === 'pendiente'}
                    >
                      Pendiente
                    </SelectItem>
                    <SelectItem className="hover:bg-accent" value="reprogramado">
                      Reprogramado
                    </SelectItem>
                    <SelectItem className="hover:bg-accent" value="cancelado">
                      Cancelado
                    </SelectItem>
                    <SelectItem value="rechazado">Rechazado</SelectItem>
                    <SelectItem value="confirmado" disabled={true}>
                      Confirmado
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />

                {currentStatusWatch === 'cancelado' && (
                  <div className="mt-6">
                    <FormField
                      control={form.control}
                      name="cancel_reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Motivo de cancelación</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ingrese el motivo de cancelación"
                              {...field}
                              value={field.value || ''}
                              className="bg-background"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
                {currentStatusWatch === 'rechazado' && (
                  <div className="mt-6">
                    <FormField
                      control={form.control}
                      name="rejected_reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Motivo de rechazo</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ingrese el motivo de rechazo"
                              {...field}
                              value={field.value || ''}
                              className="bg-background"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
                {currentStatusWatch === 'reprogramado' && (
                  <div className="mt-6">
                    <FormField
                      control={form.control}
                      name="reprogram"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel className="mt-2">Fecha de reprogramación</FormLabel>
                          <FormControl>
                            <EnhancedDatePicker
                              date={field.value}
                              setDate={field.onChange}
                              minDate={moment().startOf('day').toDate()}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="reprogram_reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Motivo del Reprogramado</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ingrese el motivo del reprogramado"
                              {...field}
                              value={field.value || ''}
                              className="bg-background"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </FormItem>
            );
          }}
        />
      )}
    </Wrapper>
  );
}
