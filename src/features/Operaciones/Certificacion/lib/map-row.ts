import moment from 'moment';
import { vehicleLabel } from '@/shared/lib/resource-labels';
import type { CertificationDbRow } from './row-query';

/** `time` de Postgres → `HH:mm:ss` (Prisma lo entrega como Date sobre 1970-01-01 UTC). */
function toTimeString(value: Date | null): string | null {
  return value ? moment.utc(value).format('HH:mm:ss') : null;
}

/**
 * Fila del tablero de certificación tal como la consumen la tabla, el formulario de edición y el
 * modal de detalle. Es el ÚNICO aplanado: la server action devuelve esto y la tabla lo usa
 * directo (antes la acción aplanaba una vez y `transformDailyReports` lo volvía a aplanar).
 *
 * La fecha del parte es `@db.Date` (medianoche UTC): se lee con `moment.utc` para no correr el día.
 */
export function mapCertificationRow(row: CertificationDbRow) {
  const reportDate = row.dailyreport?.date ? moment.utc(row.dailyreport.date) : null;

  const employees_references = row.dailyreportemployeerelations.flatMap((rel) =>
    rel.employees ? [{ ...rel.employees, name: `${rel.employees.firstname} ${rel.employees.lastname}`.trim() }] : []
  );

  const equipment_references = row.dailyreportequipmentrelations.flatMap((rel) =>
    rel.vehicles ? [{ ...rel.vehicles, name: vehicleLabel(rel.vehicles) }] : []
  );

  const customer_equipment = row.dailyreport_customer_equipment_relations.flatMap((rel) =>
    rel.equipos_clientes
      ? [
          {
            id: rel.equipos_clientes.id,
            name: rel.equipos_clientes.name,
            type: rel.equipos_clientes.type,
            relacion_id: rel.id,
          },
        ]
      : []
  );

  // Todos los remitos de la línea (fuente única: tabla `remitos`).
  const remit_numbers = row.remitos.map((remito) => remito.remit_number).filter(Boolean);

  return {
    id: row.id,
    /** Fecha del parte, `DD-MM-YYYY` (formato que lee el formulario y el modal de detalle). */
    date: reportDate ? reportDate.format('DD-MM-YYYY') : '',
    /** Fecha del parte, `YYYY-MM-DD` (para compararla con el día de `created_at`). */
    report_date: reportDate ? reportDate.format('YYYY-MM-DD') : null,
    dailyReportStatus: row.dailyreport?.status ?? 'cerrado',
    created_at: row.created_at,
    last_comercial_edit_at: row.last_comercial_edit_at,
    status: row.status,
    /** Valor crudo del enum (puede ser null); la tabla muestra su etiqueta. */
    type_service: row.type_service,
    working_day: row.working_day,
    start_time: toTimeString(row.start_time),
    end_time: toTimeString(row.end_time),
    description: row.description ?? '',
    completed_day: row.completed_day,
    completed_night: row.completed_night,
    customer: row.customers?.name ?? '',
    services: row.customer_services?.service_name ?? '',
    item: row.service_items?.item_name ?? '',
    item_description: row.service_items?.item_description ?? '',
    sector: row.service_sectors?.sectors?.name ?? '',
    /** Ids reales del sector y el área (los que filtra la tabla), no los del pivote de servicio. */
    sector_id: row.service_sectors?.sectors?.id ?? null,
    area: row.service_areas?.areas_cliente?.nombre ?? '',
    area_id: row.service_areas?.areas_cliente?.id ?? null,
    customer_id: row.customer_id,
    service_id: row.service_id,
    item_id: row.item_id,
    preparte: row.preparte,
    remit_number: remit_numbers.join(', '),
    remit_numbers,
    employees_references,
    equipment_references,
    customer_equipment,
    data_to_clone: {
      customer_id: row.customer_id,
      service_id: row.service_id,
      item_id: row.item_id ?? undefined,
      working_day: row.working_day,
      start_time: toTimeString(row.start_time),
      end_time: toTimeString(row.end_time),
      description: row.description,
      type_service: row.type_service ?? undefined,
      areas_service_id: row.areas_service_id,
      sector_service_id: row.sector_service_id,
    },
  };
}
