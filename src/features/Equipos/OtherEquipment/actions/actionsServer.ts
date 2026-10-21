'use server';

import { pickDuplicateRaceWinner, raceWindowStart } from '@/features/Equipos/EquipoID/lib/duplicate-domain';
import { buildEquipmentStatusUpdate } from '@/features/Equipos/EquipoID/lib/vehicle-status';
import { checkPermissionServer } from '@/features/Permissions/actionsServer';
import { Prisma } from '@/generated/prisma/client';
import { condition_enum } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { fromDateOnly, toDateOnly } from '@/shared/lib/date-only';
import { prisma } from '@/shared/lib/prisma';
import { withCompany } from '@/shared/lib/prisma-tenant';
import { getSessionUserId } from '@/shared/lib/session';
import { DOCUMENT_FILES_BUCKET, storagePublicUrl, storageRemove, storageUpload } from '@/shared/lib/storage';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { revalidatePath } from 'next/cache';
import {
  MAX_FILES_BY_KIND,
  buildOtherEquipmentFilePath,
  extractStoragePath,
  isOtherEquipmentFileKind,
  isOtherEquipmentFilePath,
  validateUploadFile,
  type OtherEquipmentFileKind,
} from '../lib/equipment-files';
import {
  otherEquipmentCertificationSchema,
  otherEquipmentInputSchema,
  type OtherEquipmentInput,
  type ParsedOtherEquipmentInput,
} from '../schemas/other-equipment';

const logger = new Logger('OtherEquipment/actions');

/** Tamaño máximo de foto/plano/certificación (mismo límite que valida el navegador). */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

type Client = Prisma.TransactionClient | typeof prisma;

// ─── Permisos ────────────────────────────────────────────────────────────────

/**
 * Claves del módulo `equipos` (las mismas que usan los `PermissionGuard` de la UI):
 * - alta: `others` + `create` (botón "Nuevo" del listado de equipamiento).
 * - edición, baja/alta, documentos, fotos y planos: `detalle-otro-equipo` + `update`
 *   (el header de la ficha). `certificaciones-otro` solo declara `view` en el mapa, así que
 *   las certificaciones heredan el `update` del detalle (supuesto).
 * - lecturas: `view` de `detalle-otro-equipo` o de `others`.
 */
type PermissionKey = readonly [tab: string, action: string];

const PERMISSION_CREATE: PermissionKey = ['others', 'create'];
const PERMISSION_UPDATE: PermissionKey = ['detalle-otro-equipo', 'update'];
const PERMISSIONS_VIEW: readonly PermissionKey[] = [
  ['detalle-otro-equipo', 'view'],
  ['others', 'view'],
  ['detalle-otro-equipo', 'update'],
  ['others', 'create'],
];

/** Lanza si el usuario no tiene NINGUNO de los permisos indicados. */
async function requireAnyPermission(keys: readonly PermissionKey[]): Promise<void> {
  const results = await Promise.all(keys.map(([tab, action]) => checkPermissionServer('equipos', tab, action)));
  if (!results.some(Boolean)) throw new Error('No tenés permiso para realizar esta acción');
}

const requireView = () => requireAnyPermission(PERMISSIONS_VIEW);
const requireUpdate = () => requireAnyPermission([PERMISSION_UPDATE]);
const requireCreate = () => requireAnyPermission([PERMISSION_CREATE]);

async function requireActor(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Sesión requerida');
  return userId;
}

/** Equipamiento de la empresa activa por id (con sus arrays de archivos), o lanza (perímetro sin RLS). */
async function findOwnedEquipment(client: Client, id: string) {
  const companyId = await getActiveCompanyId();
  const equipment = await client.other_equipment.findFirst({
    where: withCompany({ id }, companyId),
    select: { id: true, pictures: true, blueprints: true },
  });
  if (!equipment) throw new Error('El equipo no pertenece a la empresa activa');
  return equipment;
}

// ─── Validación de duplicados ────────────────────────────────────────────────

type DuplicateField = 'serial_number' | 'intern_number';

/** Ids de otros equipos ACTIVOS de la empresa con el mismo N° de serie / N° interno. */
async function findDuplicateFields(
  client: Client,
  companyId: string,
  values: { serial_number?: string | null; intern_number?: string | null },
  excludeId?: string
): Promise<DuplicateField[]> {
  const duplicated: DuplicateField[] = [];
  for (const field of ['serial_number', 'intern_number'] as const) {
    const value = values[field];
    if (!value) continue;
    const found = await client.other_equipment.findFirst({
      where: withCompany(
        { [field]: value, is_active: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
        companyId
      ),
      select: { id: true },
    });
    if (found) duplicated.push(field);
  }
  return duplicated;
}

const DUPLICATE_MESSAGES: Record<DuplicateField, string> = {
  serial_number: 'Este N° de Serie ya está en uso por otro equipo',
  intern_number: 'Este N° Interno ya está en uso por otro equipo',
};

/**
 * Verifica si serial_number o intern_number ya existen en otros equipos activos de la
 * empresa activa. Retorna los campos duplicados para que el form muestre errores inline.
 */
export async function checkOtherEquipmentDuplicates(
  serialNumber: string | null | undefined,
  internNumber: string | null | undefined,
  excludeId?: string
): Promise<{ serial_number?: string; intern_number?: string }> {
  // Se consulta desde la validación del formulario: edición si hay `excludeId`, alta si no
  await (excludeId ? requireUpdate() : requireCreate());
  const companyId = await getActiveCompanyId();
  const duplicated = await findDuplicateFields(
    prisma,
    companyId,
    { serial_number: serialNumber, intern_number: internNumber },
    excludeId
  );
  const errors: { serial_number?: string; intern_number?: string } = {};
  for (const field of duplicated) errors[field] = DUPLICATE_MESSAGES[field];
  return errors;
}

async function assertUniqueFields(
  client: Client,
  companyId: string,
  input: ParsedOtherEquipmentInput,
  excludeId?: string
) {
  const duplicated = await findDuplicateFields(client, companyId, input, excludeId);
  if (duplicated.length > 0) {
    throw new Error(
      duplicated
        .map((field) =>
          field === 'serial_number'
            ? `El N° de Serie "${input.serial_number}" ya está en uso por otro equipo`
            : `El N° Interno "${input.intern_number}" ya está en uso por otro equipo`
        )
        .join('. ')
    );
  }
}

/**
 * Resuelve la carrera entre dos altas simultaneas (doble click, reintento del navegador):
 * la validacion consulta y despues inserta, no es atomica. Si hay mas de un equipo activo
 * con el mismo N° interno o de serie, gana el mas antiguo (`pickDuplicateRaceWinner`) y el
 * recien creado se descarta. Devuelve el campo en conflicto si fue descartado.
 *
 * Corre DESPUES de que la transaccion del alta confirmo (con `prisma`, nunca con el `tx`):
 * en READ COMMITTED una transaccion no ve la fila no confirmada de la request paralela, asi
 * que dentro de la tx el chequeo nunca encontraria al hermano. Es un guard best-effort:
 * Task 13 lo reemplaza por un indice unico parcial `(company_id, intern_number) WHERE is_active`
 * (y otro para serial_number).
 */
async function discardIfDuplicateRace(
  client: typeof prisma,
  companyId: string,
  created: { id: string; created_at: Date; serial_number: string | null; intern_number: string | null }
): Promise<DuplicateField | null> {
  for (const field of ['intern_number', 'serial_number'] as const) {
    const value = created[field];
    if (!value) continue;
    const siblings = await client.other_equipment.findMany({
      where: withCompany(
        { [field]: value, is_active: true, created_at: { gte: raceWindowStart(created.created_at) } },
        companyId
      ),
      select: { id: true, created_at: true },
    });
    const winner = pickDuplicateRaceWinner(siblings);
    if (!winner || winner.id === created.id) continue;

    try {
      await client.other_equipment.deleteMany({ where: withCompany({ id: created.id }, companyId) });
    } catch (error) {
      logger.error('No se pudo descartar el equipo duplicado por request simultanea', {
        data: { id: created.id, field, error },
      });
      throw new Error('Se creo un equipo duplicado y no se pudo revertir. Revisa el listado antes de reintentar.');
    }
    logger.warn('Equipo duplicado descartado por request simultanea', {
      data: { descartado: created.id, conservado: winner.id, field },
    });
    return field;
  }
  return null;
}

// ─── CRUD Principal ──────────────────────────────────────────────────────────

const otherEquipmentDetailSelect = {
  id: true,
  company_id: true,
  type_id: true,
  sub_type_id: true,
  brand_id: true,
  model_id: true,
  serial_number: true,
  year: true,
  condition: true,
  status: true,
  is_active: true,
  intern_number: true,
  pictures: true,
  horometer: true,
  blueprints: true,
  manufacturer_plate: true,
  composition: true,
  invoice_number: true,
  initial_value: true,
  currency: true,
  purchase_date: true,
  cost_type: true,
  cost_center_id: true,
  sector: true,
  linked_vehicle_id: true,
  owner_id: true,
  type_of_contract: true,
  contract_start_date: true,
  contract_expiration_date: true,
  contract_number: true,
  has_certification: true,
  certification_expiration_date: true,
  certification_number: true,
  reason_for_termination: true,
  termination_date: true,
  user_id: true,
  created_at: true,
  type: { select: { id: true, name: true, generates_qr: true } },
  sub_type: { select: { id: true, name: true } },
  brand_vehicles: { select: { id: true, name: true } },
  model_vehicles: { select: { id: true, name: true } },
  equipment_owners: { select: { id: true, name: true } },
  hierarchy: { select: { id: true, name: true } },
  cost_center: { select: { id: true, name: true } },
  vehicles: { select: { id: true, domain: true } },
  contractor_other_equipment: { select: { customers: { select: { id: true, name: true } } } },
} satisfies Prisma.other_equipmentSelect;

/**
 * Ficha del equipamiento con sus relaciones (misma forma que devolvía PostgREST). Acotado
 * a la empresa activa. `Decimal` → number y `@db.Date` → `YYYY-MM-DD` para serializar.
 */
export async function getOtherEquipmentById(id: string) {
  await requireView();
  const companyId = await getActiveCompanyId();
  const equipment = await prisma.other_equipment.findFirst({
    where: withCompany({ id }, companyId),
    select: otherEquipmentDetailSelect,
  });

  if (!equipment) {
    logger.error('Equipamiento no encontrado en la empresa activa', { data: { id } });
    throw new Error('Error al obtener el equipo');
  }

  return {
    ...equipment,
    horometer: equipment.horometer === null ? null : Number(equipment.horometer),
    initial_value: equipment.initial_value === null ? null : Number(equipment.initial_value),
    purchase_date: toDateOnly(equipment.purchase_date),
    contract_start_date: toDateOnly(equipment.contract_start_date),
    contract_expiration_date: toDateOnly(equipment.contract_expiration_date),
    certification_expiration_date: toDateOnly(equipment.certification_expiration_date),
    termination_date: toDateOnly(equipment.termination_date),
    created_at: equipment.created_at.toISOString(),
    // Ids de contratistas para el MultiSelect del formulario
    contractors: equipment.contractor_other_equipment.map((rel) => rel.customers.id),
  };
}

export type OtherEquipmentDetail = Awaited<ReturnType<typeof getOtherEquipmentById>>;

/** Columnas escalares que escribe el formulario (sin `condition`, `company_id` ni `contractors`). */
function toScalarData(input: ParsedOtherEquipmentInput) {
  const hasCertification = input.has_certification === true;
  const certificationNumber = input.certification_number?.trim() ?? '';
  return {
    type_id: input.type_id,
    sub_type_id: input.sub_type_id ?? null,
    brand_id: input.brand_id ?? null,
    model_id: input.model_id ?? null,
    serial_number: input.serial_number ?? null,
    intern_number: input.intern_number ?? null,
    year: input.year ?? null,
    horometer: input.horometer ?? null,
    manufacturer_plate: input.manufacturer_plate ?? null,
    composition: input.composition ?? null,
    invoice_number: input.invoice_number ?? null,
    initial_value: input.initial_value ?? null,
    currency: input.currency ?? null,
    purchase_date: fromDateOnly(input.purchase_date),
    owner_id: input.owner_id ?? null,
    type_of_contract: input.type_of_contract ?? null,
    contract_start_date: fromDateOnly(input.contract_start_date),
    contract_expiration_date: fromDateOnly(input.contract_expiration_date),
    contract_number: input.contract_number ?? null,
    // Sin certificacion no se guardan los datos dependientes (límite contra la BD)
    has_certification: hasCertification,
    certification_expiration_date: hasCertification ? fromDateOnly(input.certification_expiration_date) : null,
    certification_number: hasCertification && certificationNumber ? certificationNumber : null,
    linked_vehicle_id: input.linked_vehicle_id ?? null,
    cost_center_id: input.cost_center_id ?? null,
    cost_type: input.cost_type ?? null,
    sector: input.sector ?? null,
  } satisfies Omit<Prisma.other_equipmentUncheckedCreateInput, 'company_id' | 'condition'>;
}

/**
 * El cliente manda ids sueltos: ninguno puede apuntar a datos de otra empresa (un
 * `linked_vehicle_id` ajeno haría que la ficha filtre el dominio de otra empresa). Los
 * catálogos con `company_id NULL` son globales y se aceptan.
 */
async function assertReferencesInCompany(client: Client, companyId: string, input: ParsedOtherEquipmentInput) {
  const companyOrGlobal = { OR: [{ company_id: companyId }, { company_id: null }] };
  const checks: Array<readonly [label: string, count: Promise<number>]> = [
    ['tipo', client.type.count({ where: { id: input.type_id, ...companyOrGlobal } })],
  ];
  if (input.sub_type_id) {
    checks.push(['subtipo', client.sub_type.count({ where: { id: input.sub_type_id, ...companyOrGlobal } })]);
  }
  if (input.brand_id != null) {
    checks.push(['marca', client.brand_vehicles.count({ where: { id: input.brand_id, ...companyOrGlobal } })]);
  }
  if (input.model_id != null) {
    checks.push(['modelo', client.model_vehicles.count({ where: withCompany({ id: input.model_id }, companyId) })]);
  }
  if (input.owner_id) {
    checks.push(['propietario', client.equipment_owners.count({ where: { id: input.owner_id, ...companyOrGlobal } })]);
  }
  if (input.cost_center_id) {
    checks.push([
      'centro de costo',
      client.cost_center.count({ where: withCompany({ id: input.cost_center_id }, companyId) }),
    ]);
  }
  if (input.sector) {
    checks.push(['sector', client.hierarchy.count({ where: withCompany({ id: input.sector }, companyId) })]);
  }
  if (input.linked_vehicle_id) {
    checks.push([
      'vehículo vinculado',
      client.vehicles.count({ where: withCompany({ id: input.linked_vehicle_id }, companyId) }),
    ]);
  }

  const results = await Promise.all(checks.map(async ([label, count]) => [label, (await count) > 0] as const));
  const invalid = results.filter(([, exists]) => !exists).map(([label]) => label);
  if (invalid.length > 0) {
    logger.warn('Referencias fuera de la empresa activa o inexistentes', { data: { companyId, invalid } });
    throw new Error(`Hay datos que no existen o no pertenecen a la empresa activa: ${invalid.join(', ')}`);
  }
}

/** Resultado real de la sincronización de afectaciones (lo que se escribió, no lo que se pidió). */
export type ContractorSyncResult = { added: number; removed: number };

/**
 * Crea un equipamiento en la empresa activa. Valida referencias, N° de serie / N° interno
 * únicos entre los activos y resuelve la carrera de altas simultáneas. El equipo y sus
 * afectaciones se crean en UNA transacción: si falla la asociación no queda un equipo a medias
 * (que al reintentar daría "duplicado").
 */
export async function createOtherEquipment(data: OtherEquipmentInput) {
  await requireCreate();
  const input = otherEquipmentInputSchema.parse(data);
  const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);

  await assertReferencesInCompany(prisma, companyId, input);
  await assertUniqueFields(prisma, companyId, input);

  let created: { id: string; created_at: Date; serial_number: string | null; intern_number: string | null };
  let contractors: ContractorSyncResult = { added: 0, removed: 0 };
  try {
    // La transacción confirma sola (equipo + afectaciones): el chequeo de carrera necesita ver
    // la fila de la otra request, y eso solo pasa con la transaccion ya confirmada.
    const result = await withActor(actor, async (tx) => {
      const equipment = await tx.other_equipment.create({
        data: { ...toScalarData(input), condition: condition_enum.operativo, },
        select: { id: true, created_at: true, serial_number: true, intern_number: true },
      });
      const synced = await syncContractors(
        tx,
        equipment.id,
        { add: input.contractors?.add ?? [], remove: [] },
        companyId
      );
      return { equipment, synced };
    });
    created = result.equipment;
    contractors = result.synced;
  } catch (error) {
    logger.error('Error al crear other_equipment', { data: { error } });
    throw error instanceof Error ? error : new Error('Error al crear el equipo');
  }

  // Si otra request simultanea inserto el mismo equipo, descartar el sobrante (sus afectaciones
  // caen por ON DELETE CASCADE).
  const racedField = await discardIfDuplicateRace(prisma, companyId, created);
  if (racedField) {
    const label = racedField === 'intern_number' ? 'N° Interno' : 'N° de Serie';
    throw new Error(`El equipo con ese ${label} ya fue creado. No se generó un duplicado.`);
  }

  revalidatePath('/dashboard/equipment');
  logger.info('Other equipment creado exitosamente', { data: { id: created.id, contractors } });
  return { id: created.id, contractors };
}

/**
 * Actualiza un equipamiento de la empresa activa. La condición no se toca desde la edición
 * (la administran Mantenimiento y el header): el schema del payload no la admite.
 */
export async function updateOtherEquipment(id: string, data: OtherEquipmentInput) {
  await requireUpdate();
  const input = otherEquipmentInputSchema.parse(data);
  const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);

  await assertReferencesInCompany(prisma, companyId, input);
  await assertUniqueFields(prisma, companyId, input, id);

  let contractors: ContractorSyncResult = { added: 0, removed: 0 };
  try {
    contractors = await withActor(actor, async (tx) => {
      const result = await tx.other_equipment.updateMany({
        where: withCompany({ id }, companyId),
        data: toScalarData(input),
      });
      if (result.count === 0) throw new Error('El equipo no pertenece a la empresa activa');

      if (!input.contractors) return { added: 0, removed: 0 };
      return syncContractors(tx, id, input.contractors, companyId);
    });
  } catch (error) {
    logger.error('Error al actualizar other_equipment', { data: { id, error } });
    throw error instanceof Error ? error : new Error('Error al actualizar el equipo');
  }

  revalidatePath('/dashboard/equipment');
  logger.info('Other equipment actualizado exitosamente', { data: { id, contractors } });
  return { id, contractors };
}

/**
 * Activa o desactiva un equipamiento de la empresa activa. Al desactivar registra motivo y
 * fecha de baja; al activar los limpia (`buildEquipmentStatusUpdate`).
 *
 * No recalcula `status` de cumplimiento documental: el motor (`refreshDocumentStatus`) solo
 * cubre empleados y vehículos, y los documentos exigibles (`documents_*`) no se vinculan a
 * `other_equipment`; sus certificaciones son filas sueltas sin motor de estado.
 */
export async function toggleOtherEquipmentStatus(id: string, activate: boolean, reason?: string, date?: Date | string) {
  await requireUpdate();
  const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);
  const data = activate
    ? buildEquipmentStatusUpdate({ activate: true })
    : buildEquipmentStatusUpdate({ activate: false, reason, terminationDate: date });

  try {
    await withActor(actor, async (tx) => {
      const result = await tx.other_equipment.updateMany({ where: withCompany({ id }, companyId), data });
      if (result.count === 0) throw new Error('El equipo no pertenece a la empresa activa');
    });
  } catch (error) {
    logger.error('Error al cambiar estado de other_equipment', { data: { id, activate, error } });
    throw error instanceof Error ? error : new Error('Error al cambiar el estado del equipo');
  }

  revalidatePath('/dashboard/equipment');
  logger.info(`Other equipment ${activate ? 'activado' : 'desactivado'} exitosamente`, { data: { id } });
  return { id, is_active: data.is_active };
}

// ─── Gestión de Contratistas ─────────────────────────────────────────────────

/**
 * Afectaciones a clientes con altas y bajas EXPLÍCITAS: solo se insertan los ids de `add` y solo
 * se eliminan los de `remove`. Un id que no figura en ninguna lista no se toca (nunca se deduce
 * un borrado por ausencia). Los `add` deben ser clientes de la empresa activa; el DELETE queda
 * acotado al equipo. El equipo ya debe estar validado como propio por el caller. Devuelve lo que
 * se escribió de verdad.
 */
async function syncContractors(
  client: Client,
  equipmentId: string,
  changes: { add: string[]; remove: string[] },
  companyId: string
): Promise<ContractorSyncResult> {
  // Un id en las dos listas es un pedido contradictorio: no se toca (ni alta ni baja)
  const addSet = new Set(changes.add);
  const conflicting = new Set(changes.remove.filter((contractorId) => addSet.has(contractorId)));
  const remove = [...new Set(changes.remove)].filter((contractorId) => !conflicting.has(contractorId));
  const add = [...addSet].filter((contractorId) => !conflicting.has(contractorId));

  if (add.length > 0) {
    const owned = await client.customers.count({ where: withCompany({ id: { in: add } }, companyId) });
    if (owned !== add.length) throw new Error('Alguno de los clientes a afectar no pertenece a la empresa activa');
  }

  let removed = 0;
  if (remove.length > 0) {
    const result = await client.contractor_other_equipment.deleteMany({
      where: { equipment_id: equipmentId, contractor_id: { in: remove } },
    });
    removed = result.count;
  }

  let added = 0;
  if (add.length > 0) {
    const result = await client.contractor_other_equipment.createMany({
      data: add.map((contractorId) => ({ equipment_id: equipmentId, contractor_id: contractorId })),
      skipDuplicates: true,
    });
    added = result.count;
  }

  logger.info('Contratistas del equipo actualizados', { data: { equipmentId, added, removed } });
  return { added, removed };
}

// ─── Certificaciones ─────────────────────────────────────────────────────────

/** Certificaciones (documentos) de un equipamiento de la empresa activa. */
export async function getOtherEquipmentCertifications(equipmentId: string) {
  await requireView();
  const companyId = await getActiveCompanyId();
  try {
    const rows = await prisma.other_equipment_certifications.findMany({
      where: { equipment_id: equipmentId, other_equipment: { company_id: companyId } },
      select: { id: true, equipment_id: true, name: true, file_url: true, expiration_date: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((row) => ({
      ...row,
      expiration_date: toDateOnly(row.expiration_date),
      created_at: row.created_at.toISOString(),
    }));
  } catch (error) {
    logger.error('Error al obtener certificaciones del equipo', { data: { equipmentId, error } });
    throw new Error('Error al obtener las certificaciones del equipo');
  }
}

export type OtherEquipmentCertification = Awaited<ReturnType<typeof getOtherEquipmentCertifications>>[number];

function getFormFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_FILE_SIZE) throw new Error('El archivo no puede superar los 10MB');
  return value;
}

/** Valida extensión y MIME contra la lista blanca del tipo (en el servidor, no confiar en el `accept`). */
function assertAllowedFile(kind: OtherEquipmentFileKind, file: File) {
  const error = validateUploadFile(kind, file.name, file.type);
  if (error) throw new Error(error);
}

/** Sube un archivo del equipamiento al bucket y devuelve su URL pública. El path se arma acá. */
async function uploadEquipmentFile(kind: OtherEquipmentFileKind, equipmentId: string, file: File): Promise<string> {
  const path = buildOtherEquipmentFilePath(kind, equipmentId, file.name, Date.now());
  const uploaded = await storageUpload(DOCUMENT_FILES_BUCKET, path, file);
  if (!uploaded.ok) throw new Error(`Error al subir el archivo: ${uploaded.error}`);
  return storagePublicUrl(DOCUMENT_FILES_BUCKET, uploaded.data.path);
}

/** Borra del storage un archivo del equipamiento SOLO si su path está bajo la carpeta de ese equipo. */
async function removeEquipmentFile(
  kind: OtherEquipmentFileKind,
  equipmentId: string,
  publicUrl: string
): Promise<void> {
  const path = extractStoragePath(publicUrl, DOCUMENT_FILES_BUCKET);
  if (!path || !isOtherEquipmentFilePath(path, kind, equipmentId)) {
    logger.warn('El archivo no pertenece a la carpeta del equipo: no se toca el storage', {
      data: { kind, equipmentId, publicUrl },
    });
    return;
  }
  const removed = await storageRemove(DOCUMENT_FILES_BUCKET, [path]);
  if (!removed.ok) {
    logger.warn('No se pudo eliminar el archivo del storage', { data: { path, error: removed.error } });
  }
}

/**
 * Crea una certificación del equipamiento. `formData`: `equipmentId`, `name`,
 * `expiration_date` (`YYYY-MM-DD` o vacío) y `file` opcional (se sube desde el servidor).
 */
export async function createOtherEquipmentCertification(formData: FormData) {
  await requireUpdate();
  const input = otherEquipmentCertificationSchema.parse({
    equipmentId: formData.get('equipmentId'),
    name: formData.get('name'),
    expiration_date: formData.get('expiration_date') ?? '',
  });
  const equipment = await findOwnedEquipment(prisma, input.equipmentId);
  const file = getFormFile(formData, 'file');
  if (file) assertAllowedFile('certifications', file);

  const fileUrl = file ? await uploadEquipmentFile('certifications', equipment.id, file) : '';

  try {
    const created = await prisma.other_equipment_certifications.create({
      data: {
        equipment_id: equipment.id,
        name: input.name,
        file_url: fileUrl,
        expiration_date: fromDateOnly(input.expiration_date),
      },
      select: { id: true },
    });
    logger.info('Certificación creada exitosamente', { data: { id: created.id, equipmentId: equipment.id } });
    return created;
  } catch (error) {
    // Compensación: la fila no se creó, el archivo no debe quedar huérfano
    if (fileUrl) await removeEquipmentFile('certifications', equipment.id, fileUrl);
    logger.error('Error al crear certificación del equipo', { data: { equipmentId: equipment.id, error } });
    throw new Error('Error al crear la certificación');
  }
}

/** Elimina una certificación de un equipamiento de la empresa activa y su archivo del storage. */
export async function deleteOtherEquipmentCertification(id: string) {
  await requireUpdate();
  const companyId = await getActiveCompanyId();
  const cert = await prisma.other_equipment_certifications.findFirst({
    where: { id, other_equipment: { company_id: companyId } },
    select: { id: true, equipment_id: true, file_url: true },
  });
  if (!cert) throw new Error('La certificación no pertenece a la empresa activa');

  try {
    await prisma.other_equipment_certifications.delete({ where: { id: cert.id } });
  } catch (error) {
    logger.error('Error al eliminar certificación del equipo', { data: { id, error } });
    throw new Error('Error al eliminar la certificación');
  }

  if (cert.file_url) await removeEquipmentFile('certifications', cert.equipment_id, cert.file_url);
  logger.info('Certificación eliminada exitosamente', { data: { id } });
}

// ─── Fotos y Planos ──────────────────────────────────────────────────────────

type ArrayFilesKind = Exclude<OtherEquipmentFileKind, 'certifications'>;

function parseFilesKind(value: unknown): ArrayFilesKind {
  if (!isOtherEquipmentFileKind(value) || value === 'certifications') throw new Error('Tipo de archivo inválido');
  return value;
}

/**
 * Agrega una URL al array de fotos/planos en UNA sentencia atómica (`array_append`) con el tope
 * de cantidad dentro del `WHERE`: dos subidas concurrentes no se pisan ni superan el límite.
 * Devuelve el array resultante, o `null` si el equipo no es de la empresa o ya está en el tope.
 */
async function appendEquipmentFile(
  kind: ArrayFilesKind,
  equipmentId: string,
  companyId: string,
  url: string
): Promise<string[] | null> {
  const max = MAX_FILES_BY_KIND[kind];
  const rows =
    kind === 'pictures'
      ? await prisma.$queryRaw<Array<{ files: string[] }>>(Prisma.sql`
          UPDATE other_equipment SET pictures = array_append(pictures, ${url})
          WHERE id = ${equipmentId}::uuid AND company_id = ${companyId}::uuid AND cardinality(pictures) < ${max}
          RETURNING pictures AS files`)
      : await prisma.$queryRaw<Array<{ files: string[] }>>(Prisma.sql`
          UPDATE other_equipment SET blueprints = array_append(blueprints, ${url})
          WHERE id = ${equipmentId}::uuid AND company_id = ${companyId}::uuid AND cardinality(blueprints) < ${max}
          RETURNING blueprints AS files`);
  return rows[0]?.files ?? null;
}

/** Quita una URL del array (atómico, `array_remove`). `null` si el equipo es ajeno o la URL no estaba. */
async function detachEquipmentFile(
  kind: ArrayFilesKind,
  equipmentId: string,
  companyId: string,
  url: string
): Promise<string[] | null> {
  const rows =
    kind === 'pictures'
      ? await prisma.$queryRaw<Array<{ files: string[] }>>(Prisma.sql`
          UPDATE other_equipment SET pictures = array_remove(pictures, ${url})
          WHERE id = ${equipmentId}::uuid AND company_id = ${companyId}::uuid AND ${url} = ANY(pictures)
          RETURNING pictures AS files`)
      : await prisma.$queryRaw<Array<{ files: string[] }>>(Prisma.sql`
          UPDATE other_equipment SET blueprints = array_remove(blueprints, ${url})
          WHERE id = ${equipmentId}::uuid AND company_id = ${companyId}::uuid AND ${url} = ANY(blueprints)
          RETURNING blueprints AS files`);
  return rows[0]?.files ?? null;
}

/**
 * Sube una foto o un plano del equipamiento y lo agrega al array correspondiente.
 * `formData`: `equipmentId`, `kind` (`pictures` | `blueprints`), `file`. Devuelve la URL y
 * el array actualizado (leído de la base, no del cliente). Valida tipo de archivo y tope de
 * cantidad en el servidor.
 */
export async function uploadOtherEquipmentFile(formData: FormData) {
  await requireUpdate();
  const kind = parseFilesKind(formData.get('kind'));
  const equipmentIdRaw = formData.get('equipmentId');
  if (typeof equipmentIdRaw !== 'string') throw new Error('Equipo inválido');
  const equipment = await findOwnedEquipment(prisma, equipmentIdRaw);
  const file = getFormFile(formData, 'file');
  if (!file) throw new Error('Archivo requerido');
  assertAllowedFile(kind, file);

  const max = MAX_FILES_BY_KIND[kind];
  const currentCount = kind === 'pictures' ? equipment.pictures.length : equipment.blueprints.length;
  // Chequeo temprano para no subir al storage un archivo que no entra; el definitivo es atómico
  if (currentCount >= max) throw new Error(`No se pueden cargar más de ${max} archivos de este tipo`);

  const companyId = await getActiveCompanyId();
  const url = await uploadEquipmentFile(kind, equipment.id, file);

  let files: string[] | null;
  try {
    files = await appendEquipmentFile(kind, equipment.id, companyId, url);
  } catch (error) {
    await removeEquipmentFile(kind, equipment.id, url);
    logger.error('Error al registrar el archivo del equipo', { data: { id: equipment.id, kind, error } });
    throw new Error('Error al actualizar los archivos del equipo');
  }
  if (!files) {
    // Otra subida simultánea llenó el cupo: se compensa el archivo recién subido
    await removeEquipmentFile(kind, equipment.id, url);
    throw new Error(`No se pueden cargar más de ${max} archivos de este tipo`);
  }

  logger.info('Archivo del equipo agregado', { data: { id: equipment.id, kind, cantidad: files.length } });
  return { url, files };
}

/** Quita una foto o un plano del equipamiento (array en la base + archivo del storage). */
export async function removeOtherEquipmentFile(input: { equipmentId: string; kind: string; url: string }) {
  await requireUpdate();
  const kind = parseFilesKind(input.kind);
  const equipment = await findOwnedEquipment(prisma, input.equipmentId);
  const companyId = await getActiveCompanyId();

  let files: string[] | null;
  try {
    files = await detachEquipmentFile(kind, equipment.id, companyId, input.url);
  } catch (error) {
    logger.error('Error al quitar el archivo del equipo', { data: { id: equipment.id, kind, error } });
    throw new Error('Error al actualizar los archivos del equipo');
  }
  if (!files) throw new Error('El archivo no pertenece a este equipo');

  await removeEquipmentFile(kind, equipment.id, input.url);
  logger.info('Archivo del equipo eliminado', { data: { id: equipment.id, kind, cantidad: files.length } });
  return { files };
}

// ─── Catálogos ───────────────────────────────────────────────────────────────

/**
 * Vehículos activos (con dominio) de la empresa activa para el combobox de vinculación.
 * Cualquiera que pueda ver, crear o editar equipamiento lo necesita (la página lo pide en todos
 * los modos), por eso acepta cualquiera de esos permisos.
 */
export async function getVehiclesForSelect() {
  await requireView();
  const companyId = await getActiveCompanyId();
  try {
    return await prisma.vehicles.findMany({
      where: withCompany({ is_active: true, domain: { not: null } }, companyId),
      select: { id: true, domain: true },
      orderBy: { domain: 'asc' },
    });
  } catch (error) {
    logger.error('Error al obtener vehículos para select', { data: { error } });
    throw new Error('Error al obtener los vehículos');
  }
}

export type VehicleSelectItem = Awaited<ReturnType<typeof getVehiclesForSelect>>[number];
