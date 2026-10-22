import type { CustomerForRowForm } from '@/features/Operaciones/PartesDiarios/actions/comercial-rows.server';
import { useCallback, useMemo } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { activeServiceItems, activeValidServices } from '../../../lib/customer-services';
import type { DailyReportRowFormValues } from '../form-types';

/**
 * Cliente, servicio y listas dependientes del formulario. Todo se DERIVA de los valores del
 * form (`customer` / `services`): no hay estado paralelo que sincronizar al abrir en edición.
 */
export function useCustomerData(customers: CustomerForRowForm[], form: UseFormReturn<DailyReportRowFormValues>) {
  const customerId = form.watch('customer');
  const serviceId = form.watch('services');

  const selectedCustomerId = customerId || null;
  const selectedServiceId = serviceId || null;

  const selectedCustomer = useMemo(
    () => (customerId ? customers.find((customer) => customer.id === customerId) ?? null : null),
    [customers, customerId]
  );

  // Sin sectores / áreas en ningún servicio del cliente, los combos quedan deshabilitados
  const isSectorDisabled = !selectedCustomer?.customer_services?.some((service) => service.service_sectors.length > 0);
  const isAreaDisabled = !selectedCustomer?.customer_services?.some((service) => service.service_areas.length > 0);

  // Servicios del cliente seleccionado
  const customerServices = useMemo(() => activeValidServices(selectedCustomer?.customer_services), [selectedCustomer]);

  // Ítems del servicio seleccionado
  const serviceItems = useMemo(
    () => activeServiceItems(selectedCustomer?.customer_services, selectedServiceId),
    [selectedCustomer, selectedServiceId]
  );

  // Manejar cambio de cliente
  const handleCustomerChange = useCallback(
    (newCustomerId: string) => {
      if (!customers.some((customer) => customer.id === newCustomerId)) return;
      form.setValue('customer', newCustomerId);
      form.setValue('services', '');
      form.setValue('item', '');
      form.setValue('sector_service_id', '');
      form.setValue('areas_service_id', '');
    },
    [customers, form]
  );

  // Manejar cambio de servicio
  const handleServiceChange = useCallback(
    (newServiceId: string) => {
      form.setValue('services', newServiceId);
      form.setValue('item', '');
      form.setValue('sector_service_id', '');
      form.setValue('areas_service_id', '');
    },
    [form]
  );

  return {
    selectedCustomerId,
    selectedServiceId,
    selectedCustomer,
    customerServices,
    serviceItems,
    handleCustomerChange,
    handleServiceChange,
    isSectorDisabled,
    isAreaDisabled,
  };
}
