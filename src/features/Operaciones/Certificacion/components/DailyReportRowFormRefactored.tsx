'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { getCustomersForRowForm } from '@/features/Operaciones/PartesDiarios/actions/comercial-rows.server';
import { useDailyReportFormStore } from '@/shared/store/useDailyReportFormStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { FieldErrors } from 'react-hook-form';
import { toast } from 'sonner';

import { CustomerDataSection } from '@/features/Operaciones/Certificacion/components/form-sections/CustomerDataSection';
import { DateTimeSection } from '@/features/Operaciones/Certificacion/components/form-sections/DateTimeSection';
import { ObservationsSection } from '@/features/Operaciones/Certificacion/components/form-sections/ObservationsSection';
import { ResourcesSection } from '@/features/Operaciones/Certificacion/components/form-sections/ResourcesSection';
import { StatusSection } from '@/features/Operaciones/Certificacion/components/form-sections/StatusSection';
import { TypeServiceSection } from '@/features/Operaciones/Certificacion/components/form-sections/TypeServiceSection';
import { buildCreateDefaults, buildEditDefaults, formatReportDate } from '@/features/Operaciones/Certificacion/components/hooks/rowFormDefaults';
import { useCustomerData } from '@/features/Operaciones/Certificacion/components/hooks/useCustomerData';
import { useFormInitialization } from '@/features/Operaciones/Certificacion/components/hooks/useFormInitialization';
import { useFormSchema } from '@/features/Operaciones/Certificacion/components/hooks/useFormSchema';
import { useFormSubmit } from '@/features/Operaciones/Certificacion/components/hooks/useFormSubmit';
import { useResourceStatusSync } from '@/features/Operaciones/Certificacion/components/hooks/useResourceStatusSync';

/**
 * Hoja lateral de alta / edición de una línea del parte diario (tablero comercial).
 * El cuerpo se monta recién al abrir la hoja: así el formulario nace con los valores de la
 * fila seleccionada y no hace falta un efecto que lo inicialice.
 */
export function DailyReportRowFormRefactored() {
  const isOpen = useDailyReportFormStore((state) => state.isOpen);
  const close = useDailyReportFormStore((state) => state.close);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent className="sm:max-w-screen-md overflow-y-auto">
        <DailyReportRowFormBody />
      </SheetContent>
    </Sheet>
  );
}

function DailyReportRowFormBody() {
  const { selectedRow, isCreating, reset } = useDailyReportFormStore();
  const queryClient = useQueryClient();

  // Fetch customers con useQuery
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomersForRowForm,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  // Esquema dinámico (alta / edición) y valores iniciales: la hoja se monta al abrir
  const schema = useFormSchema(isCreating);
  const [defaultValues] = useState(() => (isCreating ? buildCreateDefaults() : buildEditDefaults(selectedRow)));
  const form = useFormInitialization({ schema, defaultValues });

  // Cliente / servicio / listas dependientes, derivados de los valores del form
  const {
    selectedCustomerId,
    selectedServiceId,
    selectedCustomer,
    customerServices,
    serviceItems,
    handleCustomerChange,
    handleServiceChange,
    isSectorDisabled,
    isAreaDisabled,
  } = useCustomerData(customers, form);

  // Estado automático según los recursos asignados (sólo edición)
  useResourceStatusSync(form, isCreating, serviceItems);

  // Flags del item seleccionado (derivados, sin efecto)
  const watchedItemId = form.watch('item');
  const selectedServiceItem = serviceItems.find((item) => item.id === watchedItemId);

  const { onSubmit } = useFormSubmit(isCreating, selectedRow, () => {}, reset, queryClient, serviceItems);

  // Feedback visible cuando la validación bloquea el guardado. Sin esto, los
  // mensajes de error quedan en campos fuera de vista (arriba del form) y el usuario
  // presiona "Actualizar" sin que pase nada ni aparezca aviso alguno.
  const handleInvalid = (errors: FieldErrors) => {
    const firstMessage = Object.values(errors).find((error) => error?.message)?.message;
    toast.error(
      typeof firstMessage === 'string' ? firstMessage : 'Complete los campos requeridos antes de guardar.'
    );
  };

  const reportDate = formatReportDate(isCreating, form.watch('date'), selectedRow?.date);

  return (
    <>
      <SheetHeader>
        <div className="flex items-center justify-between">
          <SheetTitle>{isCreating ? 'Crear Línea de Parte Diario' : 'Editar Parte Diario'}</SheetTitle>
          {reportDate && (
            <Badge variant="outline" className="text-sm font-normal">
              Fecha: {reportDate}
            </Badge>
          )}
        </div>
        <SheetDescription>
          {isCreating
            ? 'Complete los campos para crear una nueva línea. Estado inicial: En certificación.'
            : 'Actualice los campos necesarios para modificar el parte diario.'}
        </SheetDescription>
      </SheetHeader>

      <div className="grid gap-4 py-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit, handleInvalid)} className="space-y-4">
            {/* Sección 1: Datos del Cliente */}
            <CustomerDataSection
              form={form}
              customers={customers}
              isCreating={isCreating}
              selectedRow={selectedRow}
              selectedCustomerId={selectedCustomerId}
              selectedServiceId={selectedServiceId}
              selectedCustomer={selectedCustomer}
              customerServices={customerServices}
              serviceItems={serviceItems}
              isSectorDisabled={isSectorDisabled}
              isAreaDisabled={isAreaDisabled}
              handleCustomerChange={handleCustomerChange}
              handleServiceChange={handleServiceChange}
              disabled={isLoadingCustomers}
            />

            {/* Sección 1.b: Tipo de servicio (obligatorio en creación) */}
            <TypeServiceSection form={form} disabled={false} />

            {/* Sección 2: Fecha y Horarios */}
            <DateTimeSection form={form} isCreating={isCreating} disabled={false} />

            {/* Sección 3: Recursos (Empleados y Equipos) - dinámico según flags del item */}
            <ResourcesSection
              form={form}
              isCreating={isCreating}
              selectedRow={selectedRow}
              disabled={false}
              itemNeedsPersonnel={selectedServiceItem?.needs_personnel ?? true}
              itemNeedsEquipment={selectedServiceItem?.needs_equipment ?? true}
              itemName={selectedServiceItem?.item_name}
            />

            {/* Sección 4: Estado y Remito */}
            <StatusSection form={form} isCreating={isCreating} currentStatus={selectedRow?.status} disabled={false} />

            {/* Sección 5: Observaciones */}
            <ObservationsSection form={form} disabled={false} />

            {/* Footer con botones */}
            <SheetFooter className="gap-2">
              <Button type="button" variant="outline" onClick={reset} disabled={form.formState.isSubmitting}>
                Cancelar
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isCreating ? 'Crear' : 'Actualizar'}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </div>
    </>
  );
}
