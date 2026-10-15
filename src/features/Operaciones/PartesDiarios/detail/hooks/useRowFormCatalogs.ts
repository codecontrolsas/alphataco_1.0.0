'use client';

import { useQuery } from '@tanstack/react-query';
import { getCustomersForForm, getEmployeesForForm, getOtherEquipmentForForm, getVehiclesForForm } from '../form-data.server';

const CATALOG_STALE_TIME = 5 * 60 * 1000;

/** Catálogos del formulario de líneas: se piden recién cuando el formulario se abre (`enabled`). */
export function useRowFormCatalogs(enabled: boolean, reportDate: string) {
  const { data: customers = [] } = useQuery({
    queryKey: ['form-customers'],
    queryFn: () => getCustomersForForm(),
    enabled,
    staleTime: CATALOG_STALE_TIME,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ['form-employees', reportDate],
    queryFn: () => getEmployeesForForm(reportDate),
    enabled,
    staleTime: CATALOG_STALE_TIME,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['form-vehicles'],
    queryFn: () => getVehiclesForForm(),
    enabled,
    staleTime: CATALOG_STALE_TIME,
  });

  const { data: otherEquipment = [] } = useQuery({
    queryKey: ['form-other-equipment'],
    queryFn: () => getOtherEquipmentForForm(),
    enabled,
    staleTime: CATALOG_STALE_TIME,
  });

  return { customers, employees, vehicles, otherEquipment };
}
