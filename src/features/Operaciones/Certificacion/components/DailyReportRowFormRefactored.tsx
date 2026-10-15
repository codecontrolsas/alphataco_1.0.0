'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useDailyReportFormStore } from '@/shared/store/useDailyReportFormStore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loader2 } from 'lucide-react';
import React from 'react';
import type { FieldErrors } from 'react-hook-form';
import { toast } from 'sonner';

// Importar secciones del formulario
import {
  CustomerDataSection,
  DateTimeSection,
  ObservationsSection,
  ResourcesSection,
  StatusSection,
  TypeServiceSection,
} from './form-sections';

// Importar hooks personalizados
import { getCustomersForRowForm } from '@/features/Operaciones/PartesDiarios/actions/comercial-rows.server';
import { useCustomerData, useFormInitialization, useFormSchema, useFormSubmit } from './hooks';

export function DailyReportRowFormRefactored() {
  // Estado desde el store
  const { isOpen, selectedRow, isCreating, close, reset } = useDailyReportFormStore();

  // Fetch customers con useQuery
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: getCustomersForRowForm,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });

  // 1. Generar esquema de validación dinámico
  const schema = useFormSchema(isCreating);

  // 2. Valores por defecto (memoizados para evitar recreación)
  const defaultValues = React.useMemo(
    () => ({
      customer: '',
      services: '',
      item: '',
      date: undefined,
      start_time: '',
      end_time: '',
      working_day: '',
      employees: [],
      equipment: [],
      equipos_cliente: [],
      status: isCreating ? 'en_certificacion' : '',
      remit_number: '',
      observations: '',
      sector_service_id: '',
      areas_service_id: '',
      type_service: undefined,
    }),
    [isCreating]
  );

  // 3. Inicializar formulario
  const form = useFormInitialization({
    schema,
    defaultValues,
  });

  // 4. Hook de datos del cliente
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
    setSelectedCustomerId,
    setSelectedServiceId,
    setSelectedCustomer,
    setIsSectorDisabled,
    setIsAreaDisabled,
  } = useCustomerData(customers || [], form);

  // 5. Ref para rastrear si ya se inicializó
  const initializedRef = React.useRef(false);

  // 6. Inicializar formulario cuando se abre el modal
  React.useEffect(() => {
    if (isOpen && !initializedRef.current) {
      initializedRef.current = true;

      if (!isCreating && selectedRow) {
        // Modo edición: cargar datos existentes
        const customerId = selectedRow.data_to_clone?.customer_id;
        const serviceId = selectedRow.data_to_clone?.service_id;

        // Extraer IDs de empleados y equipos de las referencias
        const employeeIds =
          selectedRow.employees_references?.map((emp) => emp.id).filter((id): id is string => !!id) || [];
        const equipmentIds =
          selectedRow.equipment_references?.map((eq) => eq.id).filter((id): id is string => !!id) || [];
        const customerEquipmentIds =
          selectedRow.customer_equipment?.map((eq) => eq.id).filter((id): id is string => !!id) || [];

        // Buscar el cliente
        if (customerId && customers.length > 0) {
          const customer = customers.find((item) => item.id === customerId);
          if (customer) {
            setSelectedCustomer(customer);
            setSelectedCustomerId(customerId);
            if (serviceId) {
              setSelectedServiceId(serviceId);
            }

            // Habilitar sectores y áreas si existen
            const hasSectors = customer.customer_services?.some((service) => service.service_sectors.length > 0);
            const hasAreas = customer.customer_services?.some((service) => service.service_areas.length > 0);
            setIsSectorDisabled(!hasSectors);
            setIsAreaDisabled(!hasAreas);
          }
        }

        // Cargar datos en el formulario
        form.reset({
          customer: customerId || '',
          services: serviceId || '',
          item: selectedRow.data_to_clone?.item_id || '',
          date: selectedRow.date ? new Date(selectedRow.date) : undefined,
          start_time: selectedRow.start_time || '',
          end_time: selectedRow.end_time || '',
          working_day: selectedRow.working_day?.toLowerCase() || '',
          employees: employeeIds,
          equipment: equipmentIds,
          equipos_cliente: customerEquipmentIds,
          status: selectedRow.status || '',
          // El campo AGREGA un remito al pasar a certificación: arranca vacío. Los que la línea ya tiene
          // se ven y se gestionan desde "Gestionar Remitos" (precargarlos los volvería a crear unidos por coma).
          remit_number: '',
          observations: selectedRow.description || '', // Cargar description en observations
          sector_service_id: selectedRow.data_to_clone?.sector_service_id || '',
          areas_service_id: selectedRow.data_to_clone?.areas_service_id || '',
          // Arrastrar el tipo de servicio de la fila de origen para no perderlo al clonar/editar.
          type_service: selectedRow.data_to_clone?.type_service || undefined,
          completed_day: selectedRow.completed_day || false,
          completed_night: selectedRow.completed_night || false,
        });
      } else if (isCreating) {
        // Modo creación: resetear a valores por defecto
        form.reset(defaultValues);
        setSelectedCustomer(null);
        setSelectedCustomerId(null);
        setSelectedServiceId(null);
      }
    }

    // Resetear el ref cuando se cierra el modal
    if (!isOpen) {
      initializedRef.current = false;
    }
  }, [
    isOpen,
    isCreating,
    selectedRow,
    customers,
    defaultValues,
    setSelectedCustomer,
    setSelectedCustomerId,
    setSelectedServiceId,
    setIsSectorDisabled,
    setIsAreaDisabled,
  ]);

  // 7. Lógica automática de cambio de estado según recursos
  React.useEffect(() => {
    if (!isCreating && isOpen) {
      const subscription = form.watch((value, { name }) => {
        // Solo actuar si cambian los recursos o el item
        if (name === 'employees' || name === 'equipment' || name === 'item') {
          const employees = value.employees || [];
          const equipment = value.equipment || [];
          const currentStatus = value.status;
          const currentItemId = value.item;

          // Obtener los flags del item seleccionado
          const selectedItem = serviceItems?.find((item) => item.id === currentItemId);
          const itemNeedsPersonnel = selectedItem?.needs_personnel ?? true;
          const itemNeedsEquipment = selectedItem?.needs_equipment ?? true;

          // Solo considerar falta de recursos si el item los requiere
          const missingRequiredResources =
            (itemNeedsPersonnel && employees.length === 0) || (itemNeedsEquipment && equipment.length === 0);

          // Si está en "sin_recursos_asignados" y ahora tiene los recursos requeridos -> cambiar a "pendiente"
          if (currentStatus === 'sin_recursos_asignados' && !missingRequiredResources) {
            form.setValue('status', 'pendiente', { shouldValidate: true });
          }
          // Si está en "pendiente" y ya no tiene los recursos requeridos -> cambiar a "sin_recursos_asignados"
          else if (currentStatus === 'pendiente' && missingRequiredResources) {
            form.setValue('status', 'sin_recursos_asignados', { shouldValidate: true });
          }
        }
      });

      return () => subscription.unsubscribe();
    }
  }, [form, isCreating, isOpen, serviceItems]);

  // 8. Derivar flags del item seleccionado (sin useEffect, derivado reactivo)
  const watchedItemId = form.watch('item');
  const selectedServiceItem = serviceItems?.find((item) => item.id === watchedItemId);

  // 9. Query client para invalidar queries
  const queryClient = useQueryClient();

  // 10. Manejar envío
  const { onSubmit } = useFormSubmit(isCreating, selectedRow, () => {}, reset, queryClient, serviceItems);

  // 10.b Feedback visible cuando la validación bloquea el guardado. Sin esto, los
  // mensajes de error quedan en campos fuera de vista (arriba del form) y el usuario
  // presiona "Actualizar" sin que pase nada ni aparezca aviso alguno.
  const handleInvalid = (errors: FieldErrors) => {
    const firstMessage = Object.values(errors).find((error) => error?.message)?.message;
    toast.error(
      typeof firstMessage === 'string' ? firstMessage : 'Complete los campos requeridos antes de guardar.'
    );
  };

  // 11. Obtener fecha del parte diario
  const formDate = form.watch('date');
  const reportDate = React.useMemo(() => {
    if (isCreating) {
      return formDate ? format(formDate, 'dd/MM/yyyy', { locale: es }) : null;
    } else {
      if (!selectedRow?.date) return null;

      // La fecha puede venir en formato "DD-MM-YYYY" o como Date
      try {
        // Intentar parsear si viene en formato "DD-MM-YYYY"
        if (typeof selectedRow.date === 'string' && selectedRow.date.includes('-')) {
          // Verificar si es formato DD-MM-YYYY
          const parts = selectedRow.date.split('-');
          if (parts.length === 3 && parts[0].length === 2) {
            const parsedDate = parse(selectedRow.date, 'dd-MM-yyyy', new Date());
            return format(parsedDate, 'dd/MM/yyyy', { locale: es });
          }
        }
        // Si es Date o formato ISO, usar directamente
        return format(new Date(selectedRow.date), 'dd/MM/yyyy', { locale: es });
      } catch (error) {
        // Si falla el parseo, mostrar la fecha tal como viene
        return selectedRow.date;
      }
    }
  }, [isCreating, selectedRow, formDate]);

  // 12. Manejar cancelación
  const handleCancel = () => {
    form.reset(defaultValues);
    setSelectedCustomer(null);
    setSelectedCustomerId(null);
    setSelectedServiceId(null);
    reset(); // Usar reset del store
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent className="sm:max-w-screen-md overflow-y-auto">
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
                customers={customers || []}
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
                <Button type="button" variant="outline" onClick={handleCancel} disabled={form.formState.isSubmitting}>
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
      </SheetContent>
    </Sheet>
  );
}
