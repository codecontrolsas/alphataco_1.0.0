'use client';

import type { VehicleById } from '@/app/dashboard/equipment/action/page';
import { Badge } from '@/components/ui/badge';
import { getCostCenterOptions } from '@/features/Empresa/General/actions/cost-centers.server';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { SectionCard } from '@/shared/components/common/SectionCard';
import moment from 'moment';
import { use } from 'react';

type Vehicle = NonNullable<VehicleById>;

/** Las fechas del vehículo llegan como `YYYY-MM-DD` (solo fecha): se muestran sin pasar por la zona horaria. */
const formatDate = (value: string | Date | null | undefined) => (value ? moment.utc(value).format('DD/MM/YYYY') : null);

const formatPrice = (price: number | null, currency: string | null) =>
  price == null ? null : `${currency ?? ''} ${price.toLocaleString('es-AR')}`.trim();

/** Identificación, propiedad y contrato del equipo, en solo lectura. */
export function VehicleBasicDataView({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Identificación" description="Qué es y cómo se identifica.">
        <FieldGrid>
          <Field label="Tipo" value={vehicle.type?.name} />
          <Field label="Subtipo" value={vehicle.sub_type?.name} />
          <Field label="Marca" value={vehicle.brand_vehicles?.name} />
          <Field label="Modelo" value={vehicle.model_vehicles?.name} />
          <Field label="Año" value={vehicle.year} mono />
          <Field label="Dominio" value={vehicle.domain} mono />
          <Field label="N° interno" value={vehicle.intern_number} mono />
          <Field label="Chasis" value={vehicle.chassis} mono />
          <Field label="Serie" value={vehicle.serie} mono />
          <Field label="Motor" value={vehicle.engine} mono />
          <Field label="Kilometraje" value={vehicle.kilometer ? `${vehicle.kilometer} km` : null} mono />
          <Field label="Horas de motor" value={vehicle.engine_hours ? `${vehicle.engine_hours} h` : null} mono />
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Propiedad y contrato" description="Quién es el dueño y bajo qué régimen opera.">
        <FieldGrid>
          <Field label="Propietario" value={vehicle.equipment_owners?.name} />
          <Field label="Tipo de contrato" value={vehicle.type_of_contract} />
          <Field label="N° de contrato" value={vehicle.contract_number} mono />
          <Field label="Inicio del contrato" value={formatDate(vehicle.contract_start_date)} mono />
          <Field label="Vencimiento del contrato" value={formatDate(vehicle.contract_expiration_date)} mono />
          <Field label="Valor del equipo" value={formatPrice(vehicle.price, vehicle.currency)} mono />
          <Field label="Certificación" value={vehicle.has_certification ? 'Posee' : 'No posee'} />
          {vehicle.has_certification && (
            <>
              <Field
                label="Vencimiento de la certificación"
                value={formatDate(vehicle.certification_expiration_date)}
                mono
              />
              <Field label="N° de certificación" value={vehicle.certification_number} mono />
            </>
          )}
        </FieldGrid>
      </SectionCard>
    </div>
  );
}

/** Asignación del equipo (centro de costo, sector, afectación), en solo lectura. */
export function VehicleAssignmentView({
  vehicle,
  costCentersPromise,
  hierarchicalPositionsPromise,
}: {
  vehicle: Vehicle;
  costCentersPromise: ReturnType<typeof getCostCenterOptions>;
  hierarchicalPositionsPromise: Promise<Array<{ id: string; name: string }>>;
}) {
  const costCenters = use(costCentersPromise);
  const sector = use(hierarchicalPositionsPromise).find((position) => position.id === vehicle.sector);
  const costCenter = costCenters.find((center) => center.id === vehicle.cost_center_id);
  const contractors = vehicle.contractor_equipment
    .map((ce) => ce.customers?.name)
    .filter((name): name is string => !!name);

  return (
    <SectionCard title="Asignación" description="Dónde trabaja y a quién se le imputa.">
      <div className="space-y-6">
        <FieldGrid>
          <Field label="Centro de costo" value={costCenter?.name} />
          <Field label="Tipo de costo" value={vehicle.cost_type} />
          <Field label="Sector" value={sector?.name} />
        </FieldGrid>
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">Afectado a</p>
          {contractors.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {contractors.map((name) => (
                <Badge key={name} variant="secondary">
                  {name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Sin afectar</p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}
