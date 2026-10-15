'use client';

import {
  getModelsByBrand,
  getSubTypesByType,
  getVehicleBrands,
  getVehicleOwners,
  getVehicleTypes,
} from '@/features/Equipos/EquipoID/lib/actions/vehicle-catalog-actions';
import type { UseFormReturn } from 'react-hook-form';
import type { OtherEquipmentFormData } from './OtherEquipmentForm';
import { CertificationSection } from './basic-data/CertificationSection';
import { IdentificationSection } from './basic-data/IdentificationSection';
import { LinkedVehicleField } from './basic-data/LinkedVehicleField';
import { PurchaseContractSection } from './basic-data/PurchaseContractSection';

interface OtherEquipmentBasicDataFormProps {
  form: UseFormReturn<OtherEquipmentFormData>;
  readOnly?: boolean;
  brandsPromise: ReturnType<typeof getVehicleBrands>;
  modelsPromise: ReturnType<typeof getModelsByBrand>;
  typesPromise: ReturnType<typeof getVehicleTypes>;
  subTypesPromise: ReturnType<typeof getSubTypesByType>;
  ownersPromise: ReturnType<typeof getVehicleOwners>;
  vehiclesPromise: Promise<Array<{ id: string; domain: string | null }>>;
}

/**
 * Datos del equipo. Cada sección vive en su archivo (`basic-data/`) y renderiza sus campos como
 * hijos directos de la grilla de dos columnas, así el orden y el layout no cambian.
 */
export function OtherEquipmentBasicDataForm({
  form,
  readOnly = false,
  brandsPromise,
  modelsPromise,
  typesPromise,
  subTypesPromise,
  ownersPromise,
  vehiclesPromise,
}: OtherEquipmentBasicDataFormProps) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 [&_button[role=combobox]]:w-full">
      <IdentificationSection
        form={form}
        readOnly={readOnly}
        brandsPromise={brandsPromise}
        modelsPromise={modelsPromise}
        typesPromise={typesPromise}
        subTypesPromise={subTypesPromise}
      />
      <PurchaseContractSection form={form} readOnly={readOnly} ownersPromise={ownersPromise} />
      <CertificationSection form={form} readOnly={readOnly} />
      <LinkedVehicleField form={form} readOnly={readOnly} vehiclesPromise={vehiclesPromise} />
    </div>
  );
}
