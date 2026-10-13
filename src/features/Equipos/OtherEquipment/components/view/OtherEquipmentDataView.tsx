'use client';

import { Badge } from '@/components/ui/badge';
import type { OtherEquipmentDetail } from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { Field, FieldGrid } from '@/shared/components/common/FieldGrid';
import { SectionCard } from '@/shared/components/common/SectionCard';
import moment from 'moment';
import { OtherEquipmentFileUpload } from '../OtherEquipmentFileUpload';

/** Las fechas del equipo llegan como `YYYY-MM-DD` (solo fecha): se muestran sin pasar por la zona horaria. */
const formatDate = (value: string | null | undefined) => (value ? moment.utc(value).format('DD/MM/YYYY') : null);

const formatPrice = (price: number | null, currency: string | null) =>
  price == null ? null : `${currency ?? ''} ${price.toLocaleString('es-AR')}`.trim();

/** Identificación, propiedad, contrato, fotos y planos del equipamiento, en solo lectura. */
export function OtherEquipmentBasicDataView({ equipment }: { equipment: OtherEquipmentDetail }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Identificación" description="Qué es y cómo se identifica.">
        <FieldGrid>
          <Field label="Tipo" value={equipment.type?.name} />
          <Field label="Subtipo" value={equipment.sub_type?.name} />
          <Field label="Marca" value={equipment.brand_vehicles?.name} />
          <Field label="Modelo" value={equipment.model_vehicles?.name} />
          <Field label="N° de serie" value={equipment.serial_number} mono />
          <Field label="N° interno" value={equipment.intern_number} mono />
          <Field label="Año" value={equipment.year} mono />
          <Field
            label="Horómetro"
            value={equipment.horometer != null ? `${equipment.horometer.toLocaleString('es-AR')} h` : null}
            mono
          />
          <Field label="Placa del fabricante" value={equipment.manufacturer_plate} mono />
          <Field label="Composición" value={equipment.composition} />
          <Field label="Vehículo vinculado" value={equipment.vehicles?.domain} mono />
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Propiedad y contrato" description="Quién es el dueño y bajo qué régimen opera.">
        <FieldGrid>
          <Field label="Propietario" value={equipment.equipment_owners?.name} />
          <Field label="Tipo de contrato" value={equipment.type_of_contract} />
          <Field label="N° de contrato" value={equipment.contract_number} mono />
          <Field label="Inicio del contrato" value={formatDate(equipment.contract_start_date)} mono />
          <Field label="Vencimiento del contrato" value={formatDate(equipment.contract_expiration_date)} mono />
          <Field label="N° de factura" value={equipment.invoice_number} mono />
          <Field label="Fecha de compra" value={formatDate(equipment.purchase_date)} mono />
          <Field label="Valor inicial" value={formatPrice(equipment.initial_value, equipment.currency)} mono />
          <Field label="Certificación" value={equipment.has_certification ? 'Posee' : 'No posee'} />
          {equipment.has_certification && (
            <>
              <Field
                label="Vencimiento de la certificación"
                value={formatDate(equipment.certification_expiration_date)}
                mono
              />
              <Field label="N° de certificación" value={equipment.certification_number} mono />
            </>
          )}
        </FieldGrid>
      </SectionCard>

      <SectionCard title="Fotos" description="Imágenes del equipo (máx. 4).">
        {/* key por equipo: sin remount, el estado interno mostraría las fotos del equipo anterior. */}
        <OtherEquipmentFileUpload
          key={`${equipment.id}-pictures`}
          equipmentId={equipment.id}
          type="pictures"
          files={equipment.pictures ?? []}
          maxFiles={4}
          readOnly
        />
      </SectionCard>

      <SectionCard title="Planos" description="Documentos técnicos y planos del equipo.">
        <OtherEquipmentFileUpload
          key={`${equipment.id}-blueprints`}
          equipmentId={equipment.id}
          type="blueprints"
          files={equipment.blueprints ?? []}
          readOnly
        />
      </SectionCard>
    </div>
  );
}

/** Asignación del equipamiento (centro de costo, sector, afectación), en solo lectura. */
export function OtherEquipmentAssignmentView({ equipment }: { equipment: OtherEquipmentDetail }) {
  const contractors = equipment.contractor_other_equipment
    .map((rel) => rel.customers.name)
    .filter((name): name is string => !!name);

  return (
    <SectionCard title="Asignación" description="Dónde trabaja y a quién se le imputa.">
      <div className="space-y-6">
        <FieldGrid>
          <Field label="Centro de costo" value={equipment.cost_center?.name} />
          <Field label="Tipo de costo" value={equipment.cost_type} />
          <Field label="Sector" value={equipment.hierarchy?.name} />
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
