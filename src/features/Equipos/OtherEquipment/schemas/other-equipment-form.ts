import moment from 'moment';
import { z } from 'zod';
import {
  OTHER_EQUIPMENT_CONTRACT_TYPES,
  OTHER_EQUIPMENT_COST_TYPES,
  OTHER_EQUIPMENT_CURRENCIES,
  type OtherEquipmentInput,
} from './other-equipment';

/**
 * Valores del formulario del equipamiento (strings y `Date` tal como los manejan los inputs).
 * Módulo sin directiva: lo comparten el formulario y sus secciones. El payload que viaja a la
 * server action (`OtherEquipmentInput`, ids numéricos y fechas `YYYY-MM-DD`) se arma con
 * `buildOtherEquipmentPayload`; los enums salen de las mismas constantes que el schema del servidor.
 */
export const otherEquipmentFormSchema = z.object({
  type_id: z.string().min(1, 'El tipo es requerido'),
  sub_type_id: z.string().nullable().optional(),
  brand_id: z.string().nullable().optional(),
  model_id: z.string().nullable().optional(),
  serial_number: z.string().nullable().optional(),
  intern_number: z.string().nullable().optional(),
  year: z.string().nullable().optional(),
  // La condición NO se edita desde este formulario (mismo criterio que vehicles):
  // todo equipo nace 'operativo' y solo la cambian los flujos de mantenimiento
  // y la acción del header. Si el form la mandara, pisaría lo que puso el taller.
  horometer: z.coerce.number().nullable().optional(),
  manufacturer_plate: z.string().nullable().optional(),
  composition: z.string().nullable().optional(),
  invoice_number: z.string().nullable().optional(),
  initial_value: z.coerce.number().nullable().optional(),
  currency: z.enum(OTHER_EQUIPMENT_CURRENCIES).nullable().optional(),
  purchase_date: z.date().nullable().optional(),
  owner_id: z.string().nullable().optional(),
  type_of_contract: z.enum(OTHER_EQUIPMENT_CONTRACT_TYPES).nullable().optional(),
  contract_start_date: z.date().nullable().optional(),
  contract_expiration_date: z.date().nullable().optional(),
  contract_number: z.string().nullable().optional(),
  // Certificacion del equipamiento. Los dos datos dependientes son opcionales en
  // la base y se vuelven obligatorios en el form cuando `has_certification` esta
  // en true (ver createOtherEquipmentSchema).
  has_certification: z.boolean().default(false),
  certification_expiration_date: z.date().nullable().optional(),
  certification_number: z.string().nullable().optional(),
  linked_vehicle_id: z.string().nullable().optional(),
  // Campos de asignación
  cost_center_id: z.string().nullable().optional(),
  cost_type: z.enum(OTHER_EQUIPMENT_COST_TYPES).nullable().optional(),
  sector: z.string().nullable().optional(),
  /** Ids de clientes tildados. El delta contra el baseline del servidor se calcula al guardar. */
  contractors: z.array(z.string()).optional(),
});

export type OtherEquipmentFormData = z.infer<typeof otherEquipmentFormSchema>;

/** Altas y bajas explícitas de afectaciones. */
export type ContractorChanges = { add: string[]; remove: string[] };

/**
 * Delta de afectaciones contra el baseline leído del servidor. Solo se puede dar de baja lo que el
 * usuario pudo destildar (`selectableIds`): un cliente afectado que ya no figura en el listado
 * (inactivo) no se quita por no aparecer. La ausencia de un id nunca significa borrado.
 */
export function diffContractors(
  baselineIds: readonly string[],
  selectedIds: readonly string[],
  selectableIds: readonly string[]
): ContractorChanges {
  const baseline = new Set(baselineIds);
  const selected = new Set(selectedIds);
  const selectable = new Set(selectableIds);
  return {
    add: [...selected].filter((id) => !baseline.has(id) && selectable.has(id)),
    remove: [...baseline].filter((id) => selectable.has(id) && !selected.has(id)),
  };
}

const toDateOnly = (value: Date | null | undefined) => (value ? moment(value).format('YYYY-MM-DD') : null);

/** Payload de `createOtherEquipment` / `updateOtherEquipment` (idéntico para alta y edición). */
export function buildOtherEquipmentPayload(
  data: OtherEquipmentFormData,
  contractors: ContractorChanges
): OtherEquipmentInput {
  return {
    type_id: data.type_id,
    sub_type_id: data.sub_type_id ?? null,
    brand_id: data.brand_id ? parseInt(data.brand_id, 10) : null,
    model_id: data.model_id ? parseInt(data.model_id, 10) : null,
    serial_number: data.serial_number ?? null,
    intern_number: data.intern_number ?? null,
    year: data.year ?? null,
    horometer: data.horometer ?? null,
    manufacturer_plate: data.manufacturer_plate ?? null,
    composition: data.composition ?? null,
    invoice_number: data.invoice_number ?? null,
    initial_value: data.initial_value ?? null,
    currency: data.currency ?? null,
    purchase_date: toDateOnly(data.purchase_date),
    owner_id: data.owner_id ?? null,
    type_of_contract: data.type_of_contract ?? null,
    contract_start_date: toDateOnly(data.contract_start_date),
    contract_expiration_date: toDateOnly(data.contract_expiration_date),
    contract_number: data.contract_number ?? null,
    // Sin certificacion no se guardan los datos dependientes: si el usuario
    // los cargo y despues destildo el check, no deben quedar en la base
    has_certification: data.has_certification,
    certification_expiration_date: data.has_certification ? toDateOnly(data.certification_expiration_date) : null,
    certification_number: data.has_certification ? data.certification_number?.trim() || null : null,
    linked_vehicle_id: data.linked_vehicle_id ?? null,
    cost_center_id: data.cost_center_id ?? null,
    cost_type: data.cost_type ?? null,
    sector: data.sector ?? null,
    contractors,
  };
}
