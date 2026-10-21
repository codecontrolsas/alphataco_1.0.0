'use server';

import { refreshResourceStatus } from '@/features/Documentacion/shared/compliance/server/document-status.server';
import { Prisma } from '@/generated/prisma/client';
import { condition_enum } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { fromDateOnly, toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import {
  vehicleInputSchema,
  type AllocationChanges,
  type ParsedVehicleInput,
  type VehicleInput,
} from '../../schemas/vehicle';
import { companyOrGlobal } from '../catalog-scope';
import { hasPendingMaintenance } from '../pending-maintenance';
import {
  requireEquipmentConditionUpdate,
  requireVehicleCreate,
  requireVehicleUpdate,
  requireVehicleView,
  requireVehicleWrite,
} from '../vehicle-permissions';
import { allowedSourceConditions, buildEquipmentStatusUpdate, buildVehicleStatusUpdate } from '../vehicle-status';

const logger = new Logger('features/Equipos/vehicle-actions');

/** Id de "Vehículos" en `types_of_vehicles`: los vehículos nacen "en preparación". */
const VEHICLES_TYPE_OF_VEHICLE_NAME = 'Vehículos';

type VehicleClient = Prisma.TransactionClient | typeof prisma;

async function requireActor(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Sesión requerida');
  return userId;
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura
// ────────────────────────────────────────────────────────────────────────────

const vehicleDetailSelect = {
  id: true,
  created_at: true,
  picture: true,
  type_of_vehicle: true,
  domain: true,
  chassis: true,
  engine: true,
  serie: true,
  intern_number: true,
  year: true,
  brand: true,
  model: true,
  is_active: true,
  termination_date: true,
  reason_for_termination: true,
  user_id: true,
  company_id: true,
  type: true,
  status: true,
  allocated_to: true,
  condition: true,
  kilometer: true,
  cost_center_id: true,
  type_operative_id: true,
  subType: true,
  owner_id: true,
  type_of_contract: true,
  contract_expiration_date: true,
  contract_start_date: true,
  contract_number: true,
  has_certification: true,
  certification_expiration_date: true,
  certification_number: true,
  currency: true,
  price: true,
  cost_type: true,
  sector: true,
  engine_hours: true,
  tire_template_id: true,
  brand_vehicles: { select: { id: true, name: true } },
  model_vehicles: { select: { id: true, name: true } },
  types_of_vehicles: { select: { id: true, name: true } },
  type_vehicles_typeTotype: {
    select: {
      id: true,
      name: true,
      is_active: true,
      company_id: true,
      has_hitch: true,
      is_tractor_unit: true,
      applies_to: true,
      generates_qr: true,
      is_operative: true,
    },
  },
  sub_type: { select: { id: true, name: true, tire_template_id: true } },
  equipment_owners: { select: { id: true, name: true } },
  contractor_equipment: { select: { customers: { select: { id: true, name: true } } } },
} satisfies Prisma.vehiclesSelect;

/**
 * Ficha del vehículo con la forma que leen el formulario y el header (misma que devolvía
 * PostgREST: `type`, `types_of_vehicles`, `brand_vehicles`, ...). Perímetro sin RLS: sólo si
 * pertenece a la empresa activa. Los `bigint`/`Decimal`/`@db.Date` se convierten para que el
 * resultado sea serializable hacia el cliente.
 */
export async function getVehicleById(id: string) {
  await requireVehicleView();
  const companyId = await getActiveCompanyId();

  const vehicle = await prisma.vehicles.findFirst({
    where: withCompany({ id }, companyId),
    select: vehicleDetailSelect,
  });

  if (!vehicle) {
    logger.error('Vehículo no encontrado en la empresa activa', { data: { id } });
    throw new Error('Failed to fetch vehicle');
  }

  const { type_vehicles_typeTotype, types_of_vehicles, ...rest } = vehicle;

  return {
    ...rest,
    type_of_vehicle: Number(vehicle.type_of_vehicle),
    price: vehicle.price === null ? null : Number(vehicle.price),
    created_at: vehicle.created_at.toISOString(),
    termination_date: toDateOnly(vehicle.termination_date),
    contract_expiration_date: toDateOnly(vehicle.contract_expiration_date),
    contract_start_date: toDateOnly(vehicle.contract_start_date),
    certification_expiration_date: toDateOnly(vehicle.certification_expiration_date),
    type: type_vehicles_typeTotype,
    types_of_vehicles: { id: Number(types_of_vehicles.id), name: types_of_vehicles.name },
    // Ids de contratistas para el MultiSelect del formulario
    allocated_to: vehicle.contractor_equipment.map((ce) => ce.customers?.id).filter((v): v is string => !!v),
  };
}

/**
 * `true` si ya existe un vehículo con ese dominio. El índice único de `vehicles.domain` es GLOBAL
 * (todas las empresas), así que la búsqueda no se acota a la empresa activa; sólo se devuelve un
 * booleano para no revelar datos de otra empresa.
 */
export async function isVehicleDomainTaken(domain: string, excludeId?: string): Promise<boolean> {
  await requireVehicleWrite();
  const value = domain.trim().toUpperCase();
  if (!value) return false;
  const existing = await prisma.vehicles.findFirst({
    where: { domain: value, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  return existing !== null;
}

// ────────────────────────────────────────────────────────────────────────────
// Alta / baja
// ────────────────────────────────────────────────────────────────────────────

/**
 * Baja (con motivo y fecha `YYYY-MM-DD`) o reintegro de un vehículo de la empresa activa.
 * La condición la decide el SERVIDOR: la baja deja el equipo `no_operativo`; el reintegro no la
 * toca (conserva la que tenía). `updateMany` acotado por `company_id`: si no afecta filas, el
 * equipo no es de la empresa.
 */
export async function toggleVehicleStatus(
  id: string,
  activate: boolean,
  reason_for_termination?: string,
  termination_date?: string
) {
  await requireVehicleUpdate();
  const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);

  if (!activate && termination_date && termination_date > argentinaDate()) {
    throw new Error('La fecha de baja no puede ser futura');
  }
  const data = activate
    ? buildEquipmentStatusUpdate({ activate: true })
    : buildVehicleStatusUpdate({
        activate: false,
        condition: condition_enum.no_operativo,
        reason: reason_for_termination,
        terminationDate: termination_date,
      });

  try {
    await withActor(actor, async (tx) => {
      const result = await tx.vehicles.updateMany({ where: withCompany({ id }, companyId), data });
      if (result.count === 0) throw new Error('El vehículo no pertenece a la empresa activa');
      // Baja/reintegro: `is_active` cambia qué documentos se exigen (los de baja). Refresca el cache de status.
      await refreshResourceStatus(tx, 'Equipos', companyId, id);
    });
  } catch (error) {
    logger.error('Error toggling vehicle status', { data: { error, id, activate } });
    throw error instanceof Error ? error : new Error('Failed to toggle vehicle status');
  }

  revalidatePath('/dashboard/equipment');
  return { id, is_active: data.is_active };
}

/** Columnas escalares que escribe el formulario (sin `allocated_to`, `condition` ni `company_id`). */
type VehicleScalarData = Omit<
  Prisma.vehiclesUncheckedCreateInput,
  'id' | 'created_at' | 'company_id' | 'user_id' | 'allocated_to' | 'condition' | 'is_active' | 'status'
>;

/** Columnas escalares de `vehicles` a partir del payload validado. */
function toVehicleScalarData(input: ParsedVehicleInput): VehicleScalarData {
  if (!input.type) throw new Error('El tipo es requerido');
  const hasCertification = input.has_certification === true;
  const certificationNumber = input.certification_number?.trim() ?? '';
  return {
    type_of_vehicle: BigInt(input.type_of_vehicle),
    brand: Number(input.brand),
    model: input.model === null || input.model === undefined ? null : Number(input.model),
    owner_id: input.owner_id ?? null,
    year: input.year,
    type_of_contract: input.type_of_contract ?? null,
    engine: input.engine ?? '',
    type: input.type,
    subType: input.subType ?? null,
    chassis: input.chassis ?? null,
    serie: input.serie ?? null,
    domain: input.domain ? input.domain.toUpperCase() : null,
    kilometer: input.kilometer ?? null,
    engine_hours: input.engine_hours ?? null,
    intern_number: input.intern_number ?? null,
    picture: input.picture ?? null,
    contract_expiration_date: fromDateOnly(input.contract_expiration_date),
    contract_start_date: fromDateOnly(input.contract_start_date),
    contract_number: input.contract_number ?? null,
    // Ticket 727: sin certificación no se guardan los datos dependientes (límite contra la BD)
    has_certification: hasCertification,
    certification_expiration_date: hasCertification ? fromDateOnly(input.certification_expiration_date) : null,
    certification_number: hasCertification && certificationNumber ? certificationNumber : null,
    cost_center_id: input.cost_center_id ?? null,
    cost_type: input.cost_type,
    sector: input.sector ?? null,
    price: input.price ?? null,
    currency: input.currency ?? null,
  };
}

/**
 * Los ids de catálogo que manda el cliente deben existir y ser de la empresa activa (o globales
 * en los catálogos que lo admiten): sin esto se podía colgar un equipo de un titular, centro de
 * costo o sector de otra empresa.
 */
async function assertCatalogReferences(client: VehicleClient, companyId: string, input: ParsedVehicleInput) {
  if (!input.type) throw new Error('El tipo es requerido');
  const brandId = Number(input.brand);
  const modelId = input.model === null || input.model === undefined ? null : Number(input.model);

  const [brand, model, type, subType, owner, costCenter, sector] = await Promise.all([
    client.brand_vehicles.count({ where: { id: brandId, ...companyOrGlobal(companyId) } }),
    modelId === null
      ? Promise.resolve(1)
      : client.model_vehicles.count({ where: withCompany({ id: modelId }, companyId) }),
    client.type.count({ where: { id: input.type, ...companyOrGlobal(companyId) } }),
    input.subType
      ? client.sub_type.count({ where: { id: input.subType, ...companyOrGlobal(companyId) } })
      : Promise.resolve(1),
    input.owner_id
      ? client.equipment_owners.count({ where: { id: input.owner_id, ...companyOrGlobal(companyId) } })
      : Promise.resolve(1),
    input.cost_center_id
      ? client.cost_center.count({ where: withCompany({ id: input.cost_center_id }, companyId) })
      : Promise.resolve(1),
    input.sector ? client.hierarchy.count({ where: withCompany({ id: input.sector }, companyId) }) : Promise.resolve(1),
  ]);

  if (!brand) throw new Error('La marca seleccionada no es válida');
  if (!model) throw new Error('El modelo seleccionado no es válido');
  if (!type) throw new Error('El tipo seleccionado no es válido');
  if (!subType) throw new Error('El subtipo seleccionado no es válido');
  if (!owner) throw new Error('El titular seleccionado no es válido');
  if (!costCenter) throw new Error('El centro de costo seleccionado no es válido');
  if (!sector) throw new Error('El sector seleccionado no es válido');
}

const DOMAIN_TAKEN_MESSAGE = 'El dominio ya está registrado';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Alta de vehículo en la empresa activa. Transacción con `withActor` (`vehicles.user_id`
 * tiene `DEFAULT app_current_user_id()`); las afectaciones a clientes son todas altas y al final
 * se recalculan los documentos requeridos.
 */
export async function createVehicle(vehicleData: VehicleInput) {
  await requireVehicleCreate();
  const input = vehicleInputSchema.parse(vehicleData);
  const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);

  // Sólo los "Vehículos" (no "Otros") nacen en "en preparacion"
  const typeOfVehicle = await prisma.types_of_vehicles.findUnique({
    where: { id: BigInt(input.type_of_vehicle) },
    select: { name: true },
  });
  if (!typeOfVehicle) throw new Error('El tipo de equipo seleccionado no es válido');
  const condition = typeOfVehicle.name === VEHICLES_TYPE_OF_VEHICLE_NAME ? condition_enum.en_preparacion : undefined;

  // En el alta no hay afectaciones previas: todo es alta.
  const allocationAdds = [...new Set([...(input.allocated_to ?? []), ...(input.allocation_changes?.add ?? [])])];

  let created: { id: string; domain: string | null };
  let allocation = { added: 0, removed: 0 };
  try {
    created = await withActor(actor, async (tx) => {
      await assertCatalogReferences(tx, companyId, input);
      const vehicle = await tx.vehicles.create({
        data: {
          ...toVehicleScalarData(input),
          condition,
          // La pivote contractor_equipment se escribe explícitamente abajo (ya no hay trigger que
          // la derive de la columna). La columna denormalizada arranca vacía, como siempre.
          allocated_to: [],
        },
        select: { id: true, domain: true },
      });

      if (allocationAdds.length > 0) {
        allocation = await applyAllocationChanges(tx, vehicle.id, companyId, { add: allocationAdds, remove: [] });
      }

      // Cache de status con el estado final (afectaciones incluidas); va ultimo en la transaccion.
      await refreshResourceStatus(tx, 'Equipos', companyId, vehicle.id);
      return vehicle;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(DOMAIN_TAKEN_MESSAGE);
    logger.error('Error creating vehicle', { data: { error } });
    throw error instanceof Error ? error : new Error('Failed to create vehicle');
  }

  revalidatePath('/dashboard/equipment');
  return { id: created.id, domain: created.domain, added: allocation.added };
}

/**
 * Edición de un vehículo de la empresa activa (`update` con `where { id, company_id }`).
 * Las afectaciones a clientes llegan como altas y bajas EXPLÍCITAS (`allocation_changes`): lo que
 * no figura en ninguna lista no se toca. Al final re-evalúa los documentos requeridos con el
 * estado FINAL y devuelve cuántas afectaciones se agregaron y quitaron de verdad.
 */
export async function updateVehicle(id: string, vehicleData: VehicleInput) {
  await requireVehicleUpdate();
  const input = vehicleInputSchema.parse(vehicleData);
  const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);

  let allocation = { added: 0, removed: 0 };
  try {
    await withActor(actor, async (tx) => {
      await assertCatalogReferences(tx, companyId, input);
      const result = await tx.vehicles.updateMany({
        where: withCompany({ id }, companyId),
        data: toVehicleScalarData(input),
      });
      if (result.count === 0) throw new Error('El vehículo no pertenece a la empresa activa');

      if (input.allocation_changes) {
        allocation = await applyAllocationChanges(tx, id, companyId, input.allocation_changes);
      }

      // Cache de status con el estado final (condicion, tipo, marca y afectaciones); va ultimo.
      await refreshResourceStatus(tx, 'Equipos', companyId, id);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(DOMAIN_TAKEN_MESSAGE);
    logger.error('Error updating vehicle', { data: { error, id } });
    throw error instanceof Error ? error : new Error('Failed to update vehicle');
  }

  revalidatePath('/dashboard/equipment');
  return { id, added: allocation.added, removed: allocation.removed };
}

/**
 * Aplica altas y bajas EXPLÍCITAS de afectaciones a clientes: el DELETE se acota a
 * `equipment_id = X AND contractor_id IN (remove)` y el INSERT a `add`. Un id ausente de ambas
 * listas nunca se toca. Las altas deben ser clientes de la empresa activa. Devuelve los conteos
 * reales (los ya existentes / ya quitados no cuentan).
 */
async function applyAllocationChanges(
  client: VehicleClient,
  vehicleId: string,
  companyId: string,
  changes: AllocationChanges
) {
  const add = [...new Set(changes.add)];
  const remove = [...new Set(changes.remove)];

  if (add.length > 0) {
    const owned = await client.customers.count({ where: withCompany({ id: { in: add } }, companyId) });
    if (owned !== add.length) throw new Error('Hay clientes que no pertenecen a la empresa activa');
  }

  let removed = 0;
  let added = 0;
  if (remove.length > 0) {
    const result = await client.contractor_equipment.deleteMany({
      where: { equipment_id: vehicleId, contractor_id: { in: remove } },
    });
    removed = result.count;
  }
  if (add.length > 0) {
    const result = await client.contractor_equipment.createMany({
      data: add.map((contractorId) => ({ equipment_id: vehicleId, contractor_id: contractorId })),
      skipDuplicates: true,
    });
    added = result.count;
  }
  return { added, removed };
}

type EquipmentConditionResult = { ok: true } | { ok: false; message: string };

/**
 * Cambia la condición de un vehículo (`vehicles`) o equipamiento (`other_equipment`) desde el
 * header de la ficha. Admite las transiciones de `HEADER_CONDITION_TRANSITIONS` ("en preparación" →
 * "operativo") y la reactivación `no_operativo` → cualquier otra condición, solo si el equipo no tiene
 * mantenimiento pendiente. El resto las administra Mantenimiento. Devuelve `{ ok:false, message }` en
 * los rechazos de negocio para que el mensaje llegue al cliente aunque en producción se enmascaren los errores lanzados.
 */
export async function updateEquipmentCondition(
  equipmentId: string,
  newCondition: condition_enum,
  table: 'vehicles' | 'other_equipment' = 'vehicles'
): Promise<EquipmentConditionResult> {
  logger.info('Actualizando condición de equipo', { data: { equipmentId, newCondition, table } });
  try {
    await requireEquipmentConditionUpdate(table);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No tenés permiso para realizar esta acción',
    };
  }
  if (newCondition === condition_enum.no_operativo) {
    return { ok: false, message: 'Transición de condición no permitida desde la ficha' };
  }
  const allowedFrom = allowedSourceConditions(newCondition);
  const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);

  try {
    const result = await withActor(actor, async (tx): Promise<EquipmentConditionResult> => {
      // Atómico: la condición de origen va en el `where`, así dos cambios simultáneos no se pisan.
      const update = async (from: condition_enum[]) =>
        table === 'vehicles'
          ? tx.vehicles.updateMany({
              where: withCompany({ id: equipmentId, condition: { in: from } }, companyId),
              data: { condition: newCondition },
            })
          : tx.other_equipment.updateMany({
              where: withCompany({ id: equipmentId, condition: { in: from } }, companyId),
              data: { condition: newCondition },
            });

      let changed = allowedFrom.length > 0 ? (await update(allowedFrom)).count : 0;
      if (changed === 0) {
        // Reactivación desde `no_operativo`: solo sin mantenimiento pendiente.
        const pending = await hasPendingMaintenance(tx, companyId, table, equipmentId);
        if (pending.pending) {
          return { ok: false, message: `No se puede cambiar la condición. ${pending.reasons.join('. ')}.` };
        }
        changed = (await update([condition_enum.no_operativo])).count;
      }
      if (changed === 0) {
        return {
          ok: false,
          message: 'La condición del equipo cambió o el equipo no pertenece a la empresa activa. Actualizá la página.',
        };
      }
      // `condition` es una condición registrada de los tipos de documento de equipos: al cambiarla
      // se refresca el cache de status en la misma transacción.
      if (table === 'vehicles') await refreshResourceStatus(tx, 'Equipos', companyId, equipmentId);
      return { ok: true };
    });

    if (result.ok) revalidatePath('/dashboard/equipment');
    return result;
  } catch (error) {
    logger.error('Error al actualizar condición de equipo', { data: { error, equipmentId, newCondition, table } });
    return { ok: false, message: 'No se pudo actualizar la condición del equipo' };
  }
}

type ConditionChangeAvailability = { canChange: boolean; reason?: string };

/**
 * ¿Se puede reactivar la condición de un equipo `no_operativo`? Lectura para la ficha: si hay
 * mantenimiento pendiente devuelve el motivo para mostrarlo en el control deshabilitado.
 */
export async function getConditionChangeAvailability(
  table: 'vehicles' | 'other_equipment',
  equipmentId: string
): Promise<ConditionChangeAvailability> {
  await requireEquipmentConditionUpdate(table);
  const companyId = await getActiveCompanyId();
  const where = withCompany({ id: equipmentId }, companyId);
  const row =
    table === 'vehicles'
      ? await prisma.vehicles.findFirst({ where, select: { condition: true } })
      : await prisma.other_equipment.findFirst({ where, select: { condition: true } });
  if (!row) return { canChange: false, reason: 'El equipo no pertenece a la empresa activa' };
  if (row.condition !== condition_enum.no_operativo) return { canChange: false };
  const pending = await hasPendingMaintenance(prisma, companyId, table, equipmentId);
  if (pending.pending) return { canChange: false, reason: `${pending.reasons.join('. ')}.` };
  return { canChange: true };
}
