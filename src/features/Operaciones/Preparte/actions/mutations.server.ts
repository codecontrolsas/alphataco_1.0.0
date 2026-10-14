'use server';

import { preparte_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { callScalar } from '@/shared/lib/sql';
import { storageList, storageMove, storageRemove } from '@/shared/lib/storage';
import { buildStorageFileUrl, isSafeStorageKey, parseStorageFileUrl } from '@/shared/lib/storage-url';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getStatusActorPayload } from '../lib/preparte-actor';
import { preparteCompanyScope } from '../lib/preparte-scope';
import { assertPreparteActionAllowed } from '../lib/preparte-permissions';
import type { Preparte, PreparteChangeLog } from '../types';
import { z } from 'zod';

const logger = new Logger('features/Operaciones/Preparte/mutations');

/** `''` en una FK uuid es un 400 de Postgres: se normaliza a `null`. */
function toUuidOrNull(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

/** Convierte una fecha del formulario (`YYYY-MM-DD` o ISO) a `Date`; vacío → `null`. */
function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Convierte un `HH:mm[:ss]` a la columna `time` de Postgres (Prisma la modela como Date). */
function toPgTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  // `Z`: la columna `time` se lee con `moment.utc`, así que se escribe en UTC (sin corrimiento).
  const parsed = new Date(`1970-01-01T${value.length === 5 ? `${value}:00` : value}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toPreparteStatus(value: string | null | undefined): preparte_status | null {
  if (!value) return null;
  return Object.values(preparte_status).includes(value as preparte_status) ? (value as preparte_status) : null;
}

// ============================================================================
// VALIDACIÓN DE PERÍMETRO
// ============================================================================

/**
 * Verifica que cliente, contrato, item y equipo del cliente pertenezcan a la empresa
 * activa antes de escribirlos en un pedido. Sin RLS es la única defensa: cualquier
 * uuid que llegue del cliente sería aceptado por la FK.
 */
async function assertPreparteReferences(
  companyId: string,
  refs: {
    customerIds: string[];
    serviceIds: string[];
    /** Pares cliente/contrato: el contrato tiene que ser del cliente indicado. */
    servicePairs?: { serviceId: string; customerId: string }[];
    itemIds: string[];
    customerEquipmentIds: string[];
  }
): Promise<void> {
  const customerIds = [...new Set(refs.customerIds.filter(Boolean))];
  const serviceIds = [...new Set([...refs.serviceIds, ...(refs.servicePairs ?? []).map((p) => p.serviceId)].filter(Boolean))];
  const itemIds = [...new Set(refs.itemIds.filter(Boolean))];
  const customerEquipmentIds = [...new Set(refs.customerEquipmentIds.filter(Boolean))];

  const [customers, services, items, equipment] = await Promise.all([
    customerIds.length
      ? prisma.customers.findMany({ where: { id: { in: customerIds }, company_id: companyId }, select: { id: true } })
      : Promise.resolve([]),
    serviceIds.length
      ? prisma.customer_services.findMany({
          where: { id: { in: serviceIds }, customers: { company_id: companyId } },
          select: { id: true, customer_id: true },
        })
      : Promise.resolve([]),
    itemIds.length
      ? prisma.service_items.findMany({
          where: { id: { in: itemIds }, customer_services: { customers: { company_id: companyId } } },
          select: { id: true },
        })
      : Promise.resolve([]),
    customerEquipmentIds.length
      ? prisma.equipos_clientes.findMany({
          where: { id: { in: customerEquipmentIds }, customers: { company_id: companyId } },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  if (
    customers.length !== customerIds.length ||
    services.length !== serviceIds.length ||
    items.length !== itemIds.length ||
    equipment.length !== customerEquipmentIds.length
  ) {
    throw new Error('Alguno de los datos del pedido no pertenece a la empresa activa.');
  }

  // El contrato tiene que ser del cliente del pedido (si no, se mezclan cliente A con contrato de B).
  const customerByService = new Map(services.map((service) => [service.id, service.customer_id]));
  for (const pair of refs.servicePairs ?? []) {
    if (pair.serviceId && pair.customerId && customerByService.get(pair.serviceId) !== pair.customerId) {
      throw new Error('El contrato seleccionado no pertenece al cliente del pedido.');
    }
  }
}

/** Lanza si el pedido no es de la empresa activa. Devuelve la fila leída. */
async function requirePreparteInCompany(id: string, companyId: string) {
  const row = await prisma.preparte.findFirst({
    where: { id, ...preparteCompanyScope(companyId) },
  });
  if (!row) {
    throw new Error('El pedido no existe o no pertenece a la empresa activa.');
  }
  return row;
}

// ============================================================================
// NORMALIZACIÓN DE SECTOR / ÁREA
// ============================================================================

/**
 * El formulario puede mandar el `service_sectors.id` o el `sectors.id`; en la tabla se
 * guarda SIEMPRE el `service_sectors.id` del contrato. Devuelve el mapa de traducción.
 *
 * Misma regla que `lib/service-relation-id` (el equivalente de cliente), con la misma
 * precedencia: primero la clave `service:sector` del contrato elegido, después la global.
 * Acá no se reusa ese helper porque esto resuelve en bulk con UNA consulta para muchos
 * prepartes; pasarlo por el helper sería una consulta por preparte. **Si cambia una de las
 * dos, la otra también.**
 */
async function buildSectorMap(serviceIds: string[], sectorValues: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!serviceIds.length || !sectorValues.length) return map;

  const rows = await prisma.service_sectors.findMany({
    where: { service_id: { in: serviceIds } },
    select: { id: true, sector_id: true, service_id: true },
  });

  for (const row of rows) {
    // Claves siempre acotadas al contrato: un sector de otro contrato no se resuelve.
    map.set(`${row.service_id}:${row.sector_id}`, row.id);
    map.set(`${row.service_id}:${row.id}`, row.id);
  }
  return map;
}

/** Equivalente de `buildSectorMap` para áreas (`service_areas.id` ← `areas_cliente.id`). */
async function buildAreaMap(serviceIds: string[], areaValues: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!serviceIds.length || !areaValues.length) return map;

  const rows = await prisma.service_areas.findMany({
    where: { service_id: { in: serviceIds } },
    select: { id: true, area_id: true, service_id: true },
  });

  for (const row of rows) {
    map.set(`${row.service_id}:${row.area_id}`, row.id);
    map.set(`${row.service_id}:${row.id}`, row.id);
  }
  return map;
}

/** Traduce un único sector/área del formulario al id de la pivote del contrato (`null` si viene vacío). */
async function resolveSingleRelationId(
  value: string | null | undefined,
  serviceId: string,
  buildMap: (serviceIds: string[], values: string[]) => Promise<Map<string, string>>,
  label: 'sector' | 'área'
): Promise<string | null> {
  const raw = toUuidOrNull(value);
  if (!raw) return null;
  const map = await buildMap([serviceId], [raw]);
  return requireRelationId(map, serviceId, raw, label);
}

/** Id de la pivote del contrato para `raw`; si no pertenece al contrato, lanza (nunca guarda el uuid crudo). */
function requireRelationId(map: Map<string, string>, serviceId: string, raw: string, label: 'sector' | 'área'): string {
  const resolved = map.get(`${serviceId}:${raw}`);
  if (!resolved) {
    throw new Error(`El ${label} seleccionado no pertenece al contrato del pedido.`);
  }
  return resolved;
}

// ============================================================================
// CREATE
// ============================================================================

/** Aplana el payload del formulario, que puede venir como objeto, array o array de arrays. */
function flattenPreparteInput(
  input: Omit<Preparte, 'id'> | Omit<Preparte, 'id'>[] | Omit<Preparte, 'id'>[][]
): Omit<Preparte, 'id'>[] {
  if (!Array.isArray(input)) return [input];
  if (input.length === 1 && Array.isArray(input[0])) return input[0];
  return input as Omit<Preparte, 'id'>[];
}

/**
 * Crea una o varias líneas de pedido.
 *
 * Perímetro: `company_id` = empresa activa y todas las FKs verificadas contra ella.
 */
export async function createPreparte(
  prepartesData: Omit<Preparte, 'id'> | Omit<Preparte, 'id'>[] | Omit<Preparte, 'id'>[][]
) {
  try {
    await assertPreparteActionAllowed('create');

    const dataToInsert = flattenPreparteInput(prepartesData);
    if (dataToInsert.length === 0) {
      throw new Error('No hay datos válidos para insertar');
    }

    const companyId = await getActiveCompanyId();

    await assertPreparteReferences(companyId, {
      customerIds: dataToInsert.map((item) => item.cliente_id),
      serviceIds: dataToInsert.map((item) => item.contrato_id),
      servicePairs: dataToInsert.map((item) => ({ serviceId: item.contrato_id, customerId: item.cliente_id })),
      itemIds: dataToInsert.map((item) => toUuidOrNull(item.item)).filter((id): id is string => id !== null),
      customerEquipmentIds: dataToInsert
        .map((item) => toUuidOrNull(normalizeSingleEquipment(item.equipos_cliente)))
        .filter((id): id is string => id !== null),
    });

    const serviceIds = [...new Set(dataToInsert.map((item) => item.contrato_id).filter(Boolean))];
    const [sectorMap, areaMap] = await Promise.all([
      buildSectorMap(
        serviceIds,
        dataToInsert.map((item) => item.sector_service_id ?? '').filter(Boolean)
      ),
      buildAreaMap(
        serviceIds,
        dataToInsert.map((item) => item.areas_service_id ?? '').filter(Boolean)
      ),
    ]);

    const rows = dataToInsert.map((item) => {
      const rawSector = toUuidOrNull(item.sector_service_id);
      const rawArea = toUuidOrNull(item.areas_service_id);

      return {
        cliente_id: item.cliente_id,
        contrato_id: item.contrato_id,
        company_id: companyId,
        tipo: item.tipo,
        jornada: item.jornada,
        start_time: item.start_time ?? null,
        end_time: item.end_time ?? null,
        solicitante: item.solicitante,
        status: toPreparteStatus(item.status) ?? preparte_status.pendiente,
        item: toUuidOrNull(item.item),
        observaciones: item.observaciones ?? null,
        executionDate: toDateOrNull(item.executionDate),
        requestDate: toDateOrNull(item.requestDate),
        quantity: item.quantity ?? null,
        numero_pedido: item.numero_pedido?.trim() ? item.numero_pedido : null,
        sector_service_id: rawSector ? requireRelationId(sectorMap, item.contrato_id, rawSector, 'sector') : null,
        areas_service_id: rawArea ? requireRelationId(areaMap, item.contrato_id, rawArea, 'área') : null,
        equipos_cliente: toUuidOrNull(normalizeSingleEquipment(item.equipos_cliente)),
        preparteImage: item.preparteImage ?? null,
        subject_to_availability: item.subject_to_availability ?? false,
        reprogram: toUuidOrNull(item.reprogram),
      };
    });

    // El N° de pedido se asigna acá, en la misma transacción que el insert y bajo un lock por
    // empresa: dos altas simultáneas ya no pueden tomar el mismo número. (No hay índice único
    // sobre `numero_pedido`; el lock es la única defensa.) Todas las líneas sin número comparten uno.
    return await prisma.$transaction(async (tx) => {
      let generated: string | null = null;
      if (rows.some((row) => row.numero_pedido === null)) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`preparte-order-number:${companyId}`}))`;
        const last = await callScalar('get_max_order_number', [{ uuid: companyId }], z.string().nullable(), tx);
        generated = nextOrderNumber(last);
      }
      return tx.preparte.createManyAndReturn({
        data: rows.map((row) => ({ ...row, numero_pedido: row.numero_pedido ?? generated })),
      });
    });
  } catch (error) {
    logger.error('Error al crear los pedidos', { data: { error } });
    throw new Error('Error al crear los prepartes: ' + (error as Error).message);
  }
}

/** `PED-0007` → `PED-0008`. Sin número previo arranca en `PED-0001`. */
function nextOrderNumber(last: string | null): string {
  const lastNumber = parseInt(last?.split('-')[1] ?? '0', 10);
  const next = (Number.isNaN(lastNumber) ? 0 : lastNumber) + 1;
  return `PED-${String(next).padStart(4, '0')}`;
}

/** El formulario manda el equipo del cliente como array; en la tabla va uno solo. */
function normalizeSingleEquipment(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ============================================================================
// UPDATE
// ============================================================================

/**
 * Actualiza una línea de pedido.
 *
 * Perímetro: el pedido tiene que ser de la empresa activa y las FKs nuevas también.
 * Los actores (`rejected_by` / `cancelled_by` / `reprogrammed_by`) salen SIEMPRE de la
 * sesión, nunca del payload.
 */
export async function updatePreparte(id: string, preparteData: Partial<Preparte>) {
  try {
    await assertPreparteActionAllowed('update');

    const companyId = await getActiveCompanyId();
    const current = await requirePreparteInCompany(id, companyId);

    const contratoId = preparteData.contrato_id ?? current.contrato_id;
    const clienteId = preparteData.cliente_id ?? current.cliente_id;
    // Si cambia cliente, contrato, sector o área se revalida que el contrato sea del cliente.
    const revalidateService =
      preparteData.cliente_id !== undefined ||
      preparteData.contrato_id !== undefined ||
      'sector_service_id' in preparteData ||
      'areas_service_id' in preparteData;

    await assertPreparteReferences(companyId, {
      customerIds: preparteData.cliente_id ? [preparteData.cliente_id] : [],
      serviceIds: preparteData.contrato_id ? [preparteData.contrato_id] : [],
      servicePairs: revalidateService ? [{ serviceId: contratoId, customerId: clienteId }] : [],
      itemIds: 'item' in preparteData ? [toUuidOrNull(preparteData.item)].filter((v): v is string => v !== null) : [],
      customerEquipmentIds:
        'equipos_cliente' in preparteData
          ? [toUuidOrNull(normalizeSingleEquipment(preparteData.equipos_cliente))].filter(
              (v): v is string => v !== null
            )
          : [],
    });

    const status = toPreparteStatus(preparteData.status);

    const data: Record<string, unknown> = { updated_at: new Date() };
    // Pedido viejo sin empresa: al tocarlo lo adopta la empresa activa.
    if (current.company_id === null) data.company_id = companyId;

    if (preparteData.cliente_id !== undefined) data.cliente_id = preparteData.cliente_id;
    if (preparteData.contrato_id !== undefined) data.contrato_id = preparteData.contrato_id;
    if (preparteData.tipo !== undefined) data.tipo = preparteData.tipo;
    if (preparteData.jornada !== undefined) data.jornada = preparteData.jornada;
    if (preparteData.start_time !== undefined) data.start_time = preparteData.start_time || null;
    if (preparteData.end_time !== undefined) data.end_time = preparteData.end_time || null;
    if (preparteData.solicitante !== undefined) data.solicitante = preparteData.solicitante;
    if (preparteData.observaciones !== undefined) data.observaciones = preparteData.observaciones ?? null;
    if (preparteData.numero_pedido !== undefined) data.numero_pedido = preparteData.numero_pedido;
    if (preparteData.quantity !== undefined) data.quantity = preparteData.quantity ?? null;
    if (preparteData.confirmed_by !== undefined) data.confirmed_by = preparteData.confirmed_by ?? null;
    if (preparteData.cancel_reason !== undefined) data.cancel_reason = preparteData.cancel_reason ?? null;
    if (preparteData.rejected_reason !== undefined) data.rejected_reason = preparteData.rejected_reason ?? null;
    if (preparteData.reprogram_reason !== undefined) data.reprogram_reason = preparteData.reprogram_reason ?? null;
    if (preparteData.reprogram !== undefined) data.reprogram = toUuidOrNull(preparteData.reprogram);
    if (preparteData.subject_to_availability !== undefined) {
      data.subject_to_availability = preparteData.subject_to_availability;
    }
    if ('executionDate' in preparteData) data.executionDate = toDateOrNull(preparteData.executionDate);
    if ('requestDate' in preparteData) data.requestDate = toDateOrNull(preparteData.requestDate);
    if ('item' in preparteData) data.item = toUuidOrNull(preparteData.item);
    if ('preparteImage' in preparteData) data.preparteImage = preparteData.preparteImage ?? null;
    if ('equipos_cliente' in preparteData) {
      data.equipos_cliente = toUuidOrNull(normalizeSingleEquipment(preparteData.equipos_cliente));
    }
    if (status) data.status = status;

    // Normalizar sector/área al `service_sectors.id` / `service_areas.id` del contrato.
    if ('sector_service_id' in preparteData) {
      data.sector_service_id = await resolveSingleRelationId(
        preparteData.sector_service_id,
        contratoId,
        buildSectorMap,
        'sector'
      );
    }
    if ('areas_service_id' in preparteData) {
      data.areas_service_id = await resolveSingleRelationId(
        preparteData.areas_service_id,
        contratoId,
        buildAreaMap,
        'área'
      );
    }

    // El actor del cierre lo pone el servidor, nunca el cliente.
    Object.assign(data, await getStatusActorPayload(status));

    const updated = await prisma.preparte.update({ where: { id }, data });

    // Si se actualizó la imagen, replicarla en todas las líneas del mismo pedido.
    if (updated.numero_pedido && typeof data.preparteImage === 'string' && data.preparteImage) {
      try {
        await updatePreparteImageByOrderNumber(updated.numero_pedido, data.preparteImage);
      } catch (error) {
        logger.error('Error al actualizar las imágenes de todas las líneas', { data: { error } });
      }
    }

    return updated;
  } catch (error) {
    logger.error('Error al actualizar el pedido', { data: { error, id } });
    throw error instanceof Error ? error : new Error('Error al actualizar el preparte');
  }
}

/** Replica la imagen en todas las líneas que comparten `numero_pedido` (empresa activa). */
export async function updatePreparteImageByOrderNumber(numero_pedido: string, imageUrl: string) {
  try {
    await assertPreparteActionAllowed('update');
    const companyId = await getActiveCompanyId();
    const result = await prisma.preparte.updateMany({
      where: { numero_pedido, ...preparteCompanyScope(companyId) },
      data: { preparteImage: imageUrl, updated_at: new Date() },
    });
    return { updated: result.count };
  } catch (error) {
    logger.error('Error al actualizar la imagen del pedido', { data: { error, numero_pedido } });
    throw new Error('Error al actualizar la imagen del pedido');
  }
}

/** Elimina una línea de pedido de la empresa activa. */
export async function deletePreparte(id: string) {
  try {
    await assertPreparteActionAllowed('delete');
    const companyId = await getActiveCompanyId();
    await requirePreparteInCompany(id, companyId);
    await prisma.preparte.delete({ where: { id } });
    return { success: true };
  } catch (error) {
    logger.error('Error al eliminar el pedido', { data: { error, id } });
    throw error instanceof Error ? error : new Error('Error al eliminar el preparte');
  }
}

// ============================================================================
// HISTORIAL
// ============================================================================

/**
 * Registra un cambio en el historial del pedido. El autor sale SIEMPRE de la sesión
 * (`getSessionUserId()`); `changeLog.changed_by` se ignora — es una Server Action invocable
 * directamente desde el cliente y confiar en un `changed_by` que llega del payload permitiría
 * falsear el autor del historial.
 */
export async function logPreparteChange(changeLog: PreparteChangeLog) {
  try {
    const companyId = await getActiveCompanyId();
    await requirePreparteInCompany(changeLog.preparte_id, companyId);

    const sessionUserId = await getSessionUserId();

    return await prisma.preparte_change_logs.create({
      data: {
        preparte_id: changeLog.preparte_id,
        field_name: changeLog.field_name,
        old_value: changeLog.old_value,
        new_value: changeLog.new_value,
        reason: changeLog.reason,
        changed_by: sessionUserId ?? null,
        metadata: changeLog.metadata ? JSON.parse(JSON.stringify(changeLog.metadata)) : {},
      },
    });
  } catch (error) {
    logger.error('Error al registrar el cambio del pedido', { data: { error } });
    throw new Error('Error al registrar el cambio en el historial');
  }
}

// ============================================================================
// ARCHIVO DE LA IMAGEN DEL PEDIDO
// ============================================================================

/** Bucket de las imágenes adjuntas a los pedidos. */
const PREPARTE_BUCKET = 'preparte-img';

/** Nombre de carpeta seguro a partir del nombre del cliente o del contrato. */
function normalizeFolder(value: string): string {
  return (
    value
      ?.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .toLowerCase() || ''
  );
}

/**
 * El cliente pudo haberle sacado los espacios a la URL al pasarla por el formulario: si la
 * key no existe tal cual, se busca entre los hermanos uno cuyo nombre sin espacios coincida.
 */
async function resolveActualKey(candidate: string): Promise<string> {
  const parts = candidate.split('/');
  const name = parts.pop() as string;
  const parent = parts.join('/');
  const listed = await storageList(PREPARTE_BUCKET, parent);
  if (!listed.ok) {
    logger.warn('No se pudo listar el bucket para resolver el nombre real', { data: { error: listed.error } });
    return candidate;
  }
  const withoutSpaces = (value: string) => value.replace(/\s+/g, '');
  const match = listed.data.find((entry) => withoutSpaces(entry.name) === withoutSpaces(name));
  if (!match) return candidate;
  return parent ? `${parent}/${match.name}` : match.name;
}

/**
 * Mueve la imagen ya subida a su ruta final
 * `<empresa>/<cliente>/<contrato>/<pedido>/<pedido>.<ext>` y devuelve su URL estable.
 *
 * Perímetro: la URL llega del cliente, así que lo único que se acepta es un archivo del
 * bucket de preparte que ya esté dentro de la carpeta de la empresa activa —que es donde
 * `uploadToStorage` deja todo lo que sube el navegador—. El destino se arma acá y también
 * cuelga de esa carpeta: el pedido no puede sacar el archivo de su empresa ni traerse uno
 * de otra.
 */
export async function movePreparteFile(
  fromUrl: string,
  clienteName: string,
  contratoName: string,
  numeroPedido: string
): Promise<string> {
  // Se usa tanto al crear como al editar un pedido: alcanza con cualquiera de los dos permisos.
  await assertPreparteActionAllowed('create', 'update');
  const companyId = await getActiveCompanyId();

  const source = parseStorageFileUrl(fromUrl);
  if (!source || source.bucket !== PREPARTE_BUCKET || !isSafeStorageKey(source.path)) {
    throw new Error('La imagen del pedido no es un archivo válido del storage');
  }
  if (!source.path.startsWith(`${companyId}/`)) {
    throw new Error('La imagen del pedido no pertenece a la empresa activa');
  }

  const fromPath = await resolveActualKey(source.path);
  const empresaDir = normalizeFolder(clienteName) || 'empresa';
  const contratoDir = normalizeFolder(contratoName) || 'servicio';
  // El número de pedido también se normaliza: llega del formulario y entra en la key, que
  // ahora queda PERSISTIDA en `preparte.preparteImage`. Un carácter raro ahí es permanente.
  const pedidoDir = normalizeFolder(numeroPedido) || 'pedido';
  const currentExt = fromPath.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const targetPath = `${companyId}/${empresaDir}/${contratoDir}/${pedidoDir}/${pedidoDir}.${currentExt}`;

  if (fromPath !== targetPath) {
    let moved = await storageMove(PREPARTE_BUCKET, fromPath, targetPath);
    if (!moved.ok && moved.code === 'already-exists') {
      // El pedido ya tenía una imagen: se reemplaza por la nueva.
      await storageRemove(PREPARTE_BUCKET, [targetPath]);
      moved = await storageMove(PREPARTE_BUCKET, fromPath, targetPath);
    }
    if (!moved.ok) {
      logger.error('Error moviendo el archivo del pedido', { data: { error: moved.error, fromPath, targetPath } });
      throw new Error(`No se pudo mover el archivo en Storage: ${moved.error}`);
    }
  }

  // La key es determinística (una imagen por pedido, que se PISA al reemplazarla), así que
  // el string guardado no cambiaría y el navegador serviría la foto vieja de su caché hasta
  // un día. El `?v=` lo renueva, igual que hace el logo de empresa —el otro caso de key que
  // se pisa en su lugar—. No se le mete timestamp a la key, como sí hacen `repair-images`,
  // `tire-discards` y `clothing-signatures`: esos son colecciones donde cada archivo se
  // suma, y acá reemplazar dejaría la foto anterior huérfana para siempre (no hay job de
  // limpieza). `parseStorageFileUrl` ignora el querystring, así que el reemplazo siguiente
  // vuelve a resolver la key sin problema.
  return `${buildStorageFileUrl(PREPARTE_BUCKET, targetPath)}?v=${Date.now()}`;
}
