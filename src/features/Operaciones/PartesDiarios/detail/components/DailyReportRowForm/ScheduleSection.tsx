'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import moment from 'moment';
import { UseFormReturn } from 'react-hook-form';
import type { DailyReportRowFormValues } from './schema';

interface ScheduleSectionProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  isEditMode?: boolean;
  /** The date of the daily report (for disabling "ejecutado" when in the future) */
  reportDate?: string;
  disabled?: boolean;
  /** Si true, mostrar el campo "Motivo de reasignación" (cuando cambian empleados/equipos en edición) */
  showReasigmentReason?: boolean;
}

export function ScheduleSection({
  form,
  isEditMode = false,
  reportDate,
  disabled = false,
  showReasigmentReason = false,
}: ScheduleSectionProps) {
  const watchedWorkingDay = form.watch('working_day')?.toLowerCase() ?? '';
  const watchedStatus = form.watch('status');
  const watchedReproDate = form.watch('reprogram_date');
  const is24Hours = watchedWorkingDay === 'jornada 24 horas';
  const isPorHorario = watchedWorkingDay === 'por horario';

  const isEjecutadoDisabled = reportDate != null && moment.utc(reportDate).isSameOrAfter(moment().add(1, 'day'), 'day');

  return (
    <section aria-labelledby="row-form-schedule" className="space-y-4 rounded-lg border bg-card p-4">
      <h3 id="row-form-schedule" className="text-sm font-semibold text-foreground">
        {isEditMode ? 'Estado y descripción' : 'Descripción'}
      </h3>
      {/* Bloque bloqueable: en modo "solo recursos" (disabled) todos estos
          controles quedan deshabilitados. El motivo de reasignación queda fuera
          del fieldset porque debe poder completarse al reasignar recursos. */}
      <fieldset disabled={disabled} className="space-y-4 disabled:opacity-70">
        {/* Status — solo en modo edición */}
        {isEditMode && (
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado</FormLabel>
              <Select
                onValueChange={(value) => {
                  field.onChange(value);
                  if (value !== 'ejecutado') {
                    form.setValue('remit_number', '');
                  }
                }}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un estado" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem
                    value="ejecutado"
                    disabled={field.value === 'sin_recursos_asignados' || isEjecutadoDisabled}
                  >
                    Ejecutado
                  </SelectItem>
                  <SelectItem value="reprogramado">Reprogramado</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                  <SelectItem value="pendiente" disabled>
                    Pendiente
                  </SelectItem>
                  <SelectItem value="sin_recursos_asignados" disabled>
                    Sin recursos asignados
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />

              {/* Cancel reason */}
              {watchedStatus === 'cancelado' && (
                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="cancel_reason"
                    render={({ field: f }) => (
                      <FormItem>
                        <FormLabel>Motivo de cancelación</FormLabel>
                        <FormControl>
                          <Input placeholder="Ingrese el motivo de cancelación" {...f} value={f.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Reprogram date */}
              {watchedStatus === 'reprogramado' && (
                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="reprogram_date"
                    render={({ field: f }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel className="mt-2">Fecha de reprogramación</FormLabel>
                        <FormControl>
                          <EnhancedDatePicker
                            date={f.value ?? undefined}
                            setDate={f.onChange}
                            minDate={moment().startOf('day').toDate()}
                            placeholder="DD/MM/AAAA"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </FormItem>
          )}
        />
      )}

      {/* Completed day/night checkboxes — solo en edición y jornada 24h pendiente */}
      {isEditMode && watchedStatus === 'pendiente' && is24Hours && (
        <div className="flex flex-row gap-4 items-center">
          <FormField
            control={form.control}
            name="completed_day"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value ?? undefined} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="font-normal m-0">Completado Día</FormLabel>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="completed_night"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center gap-2 space-y-0">
                <FormControl>
                  <Checkbox checked={field.value ?? undefined} onCheckedChange={field.onChange} />
                </FormControl>
                <FormLabel className="font-normal">Completado Noche</FormLabel>
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Horario (condicional: por horario) */}
      {isPorHorario && (
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="start_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hora de inicio</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="end_time"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Hora de fin</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Tipo de servicio */}
      <FormField
        control={form.control}
        name="type_service"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormLabel>Tipo de servicio</FormLabel>
            <FormControl>
              <RadioGroup onValueChange={field.onChange} value={field.value} className="flex flex-col space-y-1">
                <FormItem className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value="mensual" data-testid="type-service-mensual" />
                  </FormControl>
                  <FormLabel className="font-normal">Mensual</FormLabel>
                </FormItem>
                <FormItem className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value="adicional" data-testid="type-service-adicional" />
                  </FormControl>
                  <FormLabel className="font-normal">Adicional</FormLabel>
                </FormItem>
                <FormItem className="flex items-center space-x-3 space-y-0">
                  <FormControl>
                    <RadioGroupItem value="adicional_permanente" />
                  </FormControl>
                  <FormLabel className="font-normal">Adicional Permanente</FormLabel>
                </FormItem>
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Descripción */}
      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Descripción</FormLabel>
            <FormControl>
              <Textarea placeholder="Ingrese una descripción" className="min-h-[100px]" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      </fieldset>

      {/* Motivo de reasignación — solo cuando se removieron/reemplazaron empleados o equipos.
          Editable también en modo "solo recursos". */}
      {showReasigmentReason && (
        <FormField
          control={form.control}
          name="reasigment_reason"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel>Motivo de reasignación</FormLabel>
              <FormControl>
                <Input placeholder="Ingrese el motivo de la reasignación" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </section>
  );
}
