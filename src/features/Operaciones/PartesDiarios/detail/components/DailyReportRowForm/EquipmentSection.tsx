'use client';

import { Info } from 'lucide-react';
import { UseFormReturn } from 'react-hook-form';
import type { OtherEquipmentItem, VehicleForForm } from '../../form-data.server';
import { OtherEquipmentField } from './equipment/OtherEquipmentField';
import type { SavedOtherEquipment } from './equipment/types';
import { VehicleField } from './equipment/VehicleField';
import type { DailyReportRowFormValues } from './schema';

export type { SavedOtherEquipment };

interface EquipmentSectionProps {
  form: UseFormReturn<DailyReportRowFormValues>;
  vehicles: VehicleForForm[];
  otherEquipment: OtherEquipmentItem[];
  /** Otros equipos ya guardados en la fila que se edita (incluye dados de baja / no operativos). */
  savedOtherEquipment?: SavedOtherEquipment[];
  selectedCustomerId: string | null;
  itemNeedsEquipment: boolean;
  selectedItemName: string;
  disabled?: boolean;
}

export function EquipmentSection({
  form,
  vehicles,
  otherEquipment,
  savedOtherEquipment = [],
  selectedCustomerId,
  itemNeedsEquipment,
  selectedItemName,
  disabled = false,
}: EquipmentSectionProps) {
  if (!itemNeedsEquipment) {
    return (
      <section aria-labelledby="row-form-equipment" className="space-y-4 rounded-lg border bg-card p-4">
        <h3 id="row-form-equipment" className="text-sm font-semibold text-foreground">
          Equipos
        </h3>
        <div className="flex items-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{selectedItemName} no requiere equipos</span>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="row-form-equipment" className="space-y-4 rounded-lg border bg-card p-4">
      <h3 id="row-form-equipment" className="text-sm font-semibold text-foreground">
        Equipos
      </h3>
      <VehicleField form={form} vehicles={vehicles} selectedCustomerId={selectedCustomerId} disabled={disabled} />
      <OtherEquipmentField
        form={form}
        otherEquipment={otherEquipment}
        savedOtherEquipment={savedOtherEquipment}
        selectedCustomerId={selectedCustomerId}
        disabled={disabled}
      />
    </section>
  );
}
