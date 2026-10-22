'use client';

import { InputFormField } from '@/shared/components/common/form-fields';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createMeasurementUnit,
  reactivateMeasurementUnit,
  removeMeasurementUnit,
  updateMeasurementUnit,
  type WarehouseSettings,
} from '../../actions/catalog.server';
import { measurementUnitFormSchema, type MeasurementUnitFormValues } from '../../schemas/catalog';
import { MaterialCatalogSection } from './MaterialCatalogSection';

type Unit = WarehouseSettings['units'][number];

interface UnitsSectionProps {
  units: Unit[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export function UnitsSection({ units, ...permissions }: UnitsSectionProps) {
  return (
    <MaterialCatalogSection<Unit, MeasurementUnitFormValues>
      title="Unidades de medida"
      description="En qué se cuenta cada material: unidad, litro, kilogramo…"
      noun="unidad"
      emptyMessage="No hay unidades de medida. Agregá al menos una para poder cargar materiales."
      removalDescription="Si algún material la usa, se desactiva y deja de ofrecerse; si no, se elimina."
      items={units}
      resolver={zodResolver(measurementUnitFormSchema)}
      emptyValues={{ name: '', abbreviation: '' }}
      toFormValues={(u) => ({ name: u.name, abbreviation: u.abbreviation })}
      itemTitle={(u) => `${u.name} (${u.abbreviation})`}
      create={createMeasurementUnit}
      update={updateMeasurementUnit}
      remove={removeMeasurementUnit}
      reactivate={reactivateMeasurementUnit}
      renderExtraFields={(form) => (
        <InputFormField control={form.control} name="abbreviation" label="Abreviatura" placeholder="l, kg, u" />
      )}
      {...permissions}
    />
  );
}
