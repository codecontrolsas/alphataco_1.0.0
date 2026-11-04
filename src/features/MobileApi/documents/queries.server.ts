import 'server-only';

import { loadEmployeeDocumentRows } from '@/features/Documentacion/DocumentosEmpleados/lib/employee-document-rows.server';
import { loadCompanyDocumentRows } from '@/features/Documentacion/DocumentosEmpresa/lib/company-document-rows.server';
import { loadEquipmentDocumentRows } from '@/features/Documentacion/DocumentosEquipos/lib/equipment-document-rows.server';
import { arToday, parseValidity } from '@/features/Documentacion/shared/compliance/dates';
import { describeTypeRequirement } from '@/features/Documentacion/shared/compliance/requirement-reason';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prisma } from '@/shared/lib/prisma';
import { runInTenantScope, type TenantContext } from '@/shared/lib/tenant-context';
import type { DocumentListQuery, DocumentResource } from '../contracts/documents';
import { InvalidCursorError, argentinaDateTime } from '../lib/labels';
import { allowedResources, canListPeriod, type DocumentAccess } from './access';
import {
  DOCUMENT_STATE_LABELS,
  DOCUMENT_STATE_TONE,
  DOCUMENT_STATUS_LABELS,
  EXPIRY_BUCKET_LABELS,
  documentStatus,
  expiryBucket,
  filterRows,
  labeledState,
  pageBucket,
  pageRows,
  searchVariants,
  summarize,
  toListItem,
  type ExpiryBucket,
  type EngineState,
  type MobileDocumentRow,
} from './rows';

/**
 * Consultas de Documentación para la API móvil. Las filas salen del MISMO motor de cumplimiento que las listas web
 * (`load*DocumentRows`), con el contexto de la petición en el ALS (esas consultas usan el cliente contextual). Las
 * lecturas por id se acotan SIEMPRE a la empresa a través del recurso (`employees.company_id`, `vehicles.company_id`,
 * `documents_company.applies`), como `document-scope.ts`.
 *
 * Archivados («ya no aplica», `archived_at`): el motor no lee esa columna; en las listas generales no aparecen porque
 * su tipo ya no aplica, y además se descartan explícitamente por id (defensa ante una fila archivada cuyo tipo vuelve a
 * aplicar antes de la reconciliación).
 */

export class DocumentNotFoundError extends Error {}

export interface LoadOptions {
  resource: DocumentResource;
  monthly: boolean;
  privateTypes: boolean;
  /** Documentos de un solo recurso (empleado o equipo): la lista embebida de su ficha. */
  resourceId?: string;
}

/** Ids archivados de la empresa (empleados y equipos; la empresa no archiva). */
async function archivedIds(companyId: string, resource: DocumentResource): Promise<Set<string>> {
  if (resource === 'company') return new Set();
  const rows =
    resource === 'employee'
      ? await prisma.documents_employees.findMany({
          where: { archived_at: { not: null }, employees: { company_id: companyId } },
          select: { id: true },
        })
      : await prisma.documents_equipment.findMany({
          where: { archived_at: { not: null }, vehicles: { company_id: companyId } },
          select: { id: true },
        });
  return new Set(rows.map((row) => row.id));
}

interface EngineRowBase {
  id: string;
  state: EngineState;
  period: string | null;
  isMissing: boolean;
  expiringSoon: boolean;
  notApplicable: boolean;
  document_types: {
    id: string;
    name: string;
    mandatory: boolean;
    explired: boolean;
    is_it_montlhy: boolean | null;
    private: boolean | null;
  };
}

function baseRow(row: EngineRowBase, validity: Date | string | null, monthly: boolean) {
  return {
    id: row.id,
    isMissing: row.isMissing,
    type: {
      id: row.document_types.id,
      name: row.document_types.name,
      mandatory: row.document_types.mandatory === true,
      monthly,
      hasExpiry: row.document_types.explired === true,
      private: row.document_types.private === true,
    },
    state: row.state,
    status: documentStatus(row.state, row.expiringSoon),
    validity: parseValidity(validity),
    period: row.period,
  };
}

/** Filas de una clase de recurso y un período, normalizadas para la app. Sin «ya no aplica» ni archivados. */
export async function loadMobileDocumentRows(
  ctx: TenantContext,
  options: LoadOptions,
  companyName: string
): Promise<MobileDocumentRow[]> {
  const { resource, monthly, privateTypes, resourceId = '' } = options;
  const { companyId } = ctx;
  const [archived, mapped] = await Promise.all([
    archivedIds(companyId, resource),
    (async (): Promise<MobileDocumentRow[]> => {
      if (resource === 'employee') {
        const rows = await loadEmployeeDocumentRows(companyId, monthly, privateTypes, resourceId);
        return rows
          .filter((row) => !row.notApplicable)
          .map((row) => {
            const { employees: e } = row;
            const name = `${e.lastname} ${e.firstname}`;
            return {
              ...baseRow(row, row.validity, monthly),
              resource: { kind: 'employee', id: e.id, name, fileNumber: e.file, domain: null, internNumber: null },
              search: searchVariants(name, `${e.firstname} ${e.lastname}`, e.file, row.document_types.name),
            };
          });
      }
      if (resource === 'equipment') {
        const rows = await loadEquipmentDocumentRows(companyId, monthly, privateTypes, resourceId);
        return rows
          .filter((row) => !row.notApplicable)
          .map((row) => {
            const v = row.vehicles;
            return {
              ...baseRow(row, row.validity, monthly),
              resource: {
                kind: 'equipment',
                id: v.id,
                name: v.domain ?? v.serie ?? v.intern_number ?? v.id,
                fileNumber: null,
                domain: v.domain,
                internNumber: v.intern_number,
              },
              search: searchVariants(v.domain, v.serie, v.intern_number, row.document_types.name),
            };
          });
      }
      const rows = await loadCompanyDocumentRows(companyId, monthly, privateTypes);
      return rows
        .filter((row) => !row.notApplicable)
        .map((row) => ({
          ...baseRow(row, row.validity, monthly),
          resource: { kind: 'company', id: companyId, name: companyName, fileNumber: null, domain: null, internNumber: null },
          search: searchVariants(companyName, row.document_types.name),
        }));
    })(),
  ]);
  return mapped.filter((row) => !archived.has(row.id));
}

async function companyNameOf(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { company_name: true } });
  return company?.company_name ?? 'Empresa';
}

export class DocumentQueryError extends Error {
  constructor(
    readonly status: 403 | 422,
    message: string
  ) {
    super(message);
  }
}

/** Ids de empleados y equipos afectados a un cliente (`contractor_employee` / `contractor_equipment`). */
async function customerResourceIds(customerId: string) {
  const [employees, equipment] = await Promise.all([
    prisma.contractor_employee.findMany({ where: { contractor_id: customerId }, select: { employee_id: true } }),
    prisma.contractor_equipment.findMany({ where: { contractor_id: customerId }, select: { equipment_id: true } }),
  ]);
  return new Set([...employees.map((row) => row.employee_id), ...equipment.map((row) => row.equipment_id)]);
}

/**
 * Filas del listado ya cargadas y filtradas. Sin `resource` ni `period`, junta todo lo que el usuario puede ver (como
 * recorrer las pestañas de la web). Pedir explícitamente una clase o un período sin permiso es 403. Devuelve las filas
 * ANTES de filtrar por `status` (`scoped`, base del `summary`) y DESPUÉS (`filtered`).
 */
async function loadListRows(
  ctx: TenantContext,
  query: DocumentListQuery,
  access: DocumentAccess,
  enabledModules: ReadonlySet<string>
) {
  const visible = allowedResources(access, enabledModules);
  if (query.resourceId && (!query.resource || query.resource === 'company')) {
    throw new DocumentQueryError(422, '`resourceId` exige `resource` = employee o equipment.');
  }
  if (query.bucket && query.group !== 'expiry') {
    throw new DocumentQueryError(422, '`bucket` exige `group=expiry`.');
  }
  if (query.resource && !visible.includes(query.resource)) {
    throw new DocumentQueryError(403, 'No tenés permiso para ver esos documentos.');
  }
  const resources = query.resource ? [query.resource] : visible;
  const loads: LoadOptions[] = [];
  for (const resource of resources) {
    for (const monthly of [false, true]) {
      if (query.period && (query.period === 'monthly') !== monthly) continue;
      if (!canListPeriod(access[resource], monthly)) continue;
      loads.push({ resource, monthly, privateTypes: access[resource].privateTypes, resourceId: query.resourceId });
    }
  }
  if (loads.length === 0) throw new DocumentQueryError(403, 'No tenés permiso para ver esos documentos.');

  const companyName = loads.some((load) => load.resource === 'company') ? await companyNameOf(ctx.companyId) : '';
  const [loaded, customerIds] = await Promise.all([
    Promise.all(loads.map((load) => loadMobileDocumentRows(ctx, load, companyName))),
    query.customerId ? customerResourceIds(query.customerId) : Promise.resolve(null),
  ]);
  const rows = loaded
    .flat()
    // Con cliente, solo recursos afectados a él: los documentos de la empresa no pertenecen a ningún cliente.
    .filter((row) => !customerIds || (row.resource.kind !== 'company' && customerIds.has(row.resource.id)));
  const scoped = filterRows(rows, { ...query, status: undefined });
  const filtered = query.status ? scoped.filter((row) => row.status === query.status) : scoped;
  return { scoped, filtered };
}

export async function listDocuments(
  ctx: TenantContext,
  query: DocumentListQuery,
  access: DocumentAccess,
  enabledModules: ReadonlySet<string>
) {
  return runInTenantScope(ctx, async () => {
    const { scoped, filtered } = await loadListRows(ctx, query, access, enabledModules);
    const { page, nextCursor, total } = pageRows(filtered, query);
    return { items: page.map(toListItem), nextCursor, total, summary: query.cursor ? null : summarize(scoped) };
  });
}

/**
 * `group=expiry`: vencidos / esta semana / este mes / más adelante, cada uno con su conteo (de todo lo que cumple los
 * filtros) y su primera página; con `bucket` + `cursor` se sigue paginando UNA agrupación. Ver `expiryBucket`.
 */
export async function listDocumentsByExpiry(
  ctx: TenantContext,
  query: DocumentListQuery,
  access: DocumentAccess,
  enabledModules: ReadonlySet<string>
) {
  return runInTenantScope(ctx, async () => {
    const { scoped, filtered } = await loadListRows(ctx, query, access, enabledModules);
    if (query.cursor && !query.bucket) throw new InvalidCursorError('El cursor es de una agrupación: indicá `bucket`.');
    const today = arToday();
    const byBucket = new Map<ExpiryBucket, MobileDocumentRow[]>();
    let missing = 0;
    let noExpiry = 0;
    for (const row of filtered) {
      const bucket = expiryBucket(row, today);
      if (!bucket) {
        if (row.status === 'missing') missing += 1;
        else noExpiry += 1;
        continue;
      }
      byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), row]);
    }
    const keys = (query.bucket ? [query.bucket] : (Object.keys(EXPIRY_BUCKET_LABELS) as ExpiryBucket[]));
    return {
      groups: keys.map((key) => ({
        key,
        label: EXPIRY_BUCKET_LABELS[key],
        count: byBucket.get(key)?.length ?? 0,
        ...pageBucket(byBucket.get(key) ?? [], key, query),
      })),
      excluded: { missing, noExpiry },
      summary: query.cursor ? null : summarize(scoped),
    };
  });
}

/** Opciones de los filtros: clases visibles con sus períodos, estados y tipos de documento (sin privados ajenos). */
export async function getDocumentFilterOptions(
  ctx: TenantContext,
  access: DocumentAccess,
  enabledModules: ReadonlySet<string>
) {
  const visible = allowedResources(access, enabledModules);
  const APPLIES = { employee: 'Persona', equipment: 'Equipos', company: 'Empresa' } as const;
  const LABELS = { employee: 'Empleados', equipment: 'Equipos', company: 'Empresa' } as const;
  const [types, customers] = await runInTenantScope(ctx, () =>
    Promise.all([
      prisma.document_types.findMany({
        where: {
          company_id: ctx.companyId,
          is_active: true,
          applies: { in: visible.map((resource) => APPLIES[resource]) },
        },
        select: { id: true, name: true, applies: true, is_it_montlhy: true, private: true },
        orderBy: { name: 'asc' },
      }),
      // Filtro por cliente: los clientes solo se ofrecen si hay clases afectables a un cliente (personal o equipos).
      visible.some((resource) => resource !== 'company')
        ? prisma.customers.findMany({
            where: { company_id: ctx.companyId },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : Promise.resolve([]),
    ])
  );
  const resourceOf = (applies: string) =>
    (Object.keys(APPLIES) as DocumentResource[]).find((resource) => APPLIES[resource] === applies) ?? null;
  return {
    customers,
    resources: visible.map((resource) => ({
      value: resource,
      label: LABELS[resource],
      periods: [
        ...(access[resource].permanent ? (['permanent'] as const) : []),
        ...(access[resource].monthly ? (['monthly'] as const) : []),
      ],
    })),
    statuses: (Object.keys(DOCUMENT_STATUS_LABELS) as (keyof typeof DOCUMENT_STATUS_LABELS)[]).map((value) => ({
      value,
      label: DOCUMENT_STATUS_LABELS[value],
    })),
    types: types.flatMap((type) => {
      const resource = resourceOf(type.applies);
      if (!resource) return [];
      const monthly = type.is_it_montlhy === true;
      if (!canListPeriod(access[resource], monthly)) return [];
      if (type.private === true && !access[resource].privateTypes) return [];
      return [{ id: type.id, name: type.name, resource, monthly }];
    }),
  };
}

// ─── Ficha ────────────────────────────────────────────────────────────────────

/** Referencia mínima de un documento REAL de la empresa (no archivado y con archivo), o null. */
export async function findDocumentRef(companyId: string, resource: DocumentResource, documentId: string) {
  const withFile = { document_path: { not: null }, NOT: { document_path: '' } };
  const typeSelect = {
    select: {
      id: true,
      name: true,
      is_it_montlhy: true,
      private: true,
      applies: true,
      special: true,
      conditions: true,
      multiresource: true,
      mandatory: true,
      explired: true,
      down_document: true,
      is_active: true,
      company_id: true,
    },
  } as const;
  if (resource === 'employee') {
    const row = await prisma.documents_employees.findFirst({
      where: { id: documentId, archived_at: null, ...withFile, employees: { company_id: companyId } },
      select: {
        applies: true,
        document_path: true,
        created_at: true,
        deny_reason: true,
        state: true,
        user_id: true,
        document_types: typeSelect,
      },
    });
    return row?.applies ? { ...row, resourceId: row.applies, policyNumber: null } : null;
  }
  if (resource === 'equipment') {
    const row = await prisma.documents_equipment.findFirst({
      where: { id: documentId, archived_at: null, ...withFile, vehicles: { company_id: companyId } },
      select: {
        applies: true,
        document_path: true,
        created_at: true,
        deny_reason: true,
        policy_number: true,
        state: true,
        user_id: true,
        document_types: typeSelect,
      },
    });
    return row?.applies ? { ...row, resourceId: row.applies, policyNumber: row.policy_number } : null;
  }
  const row = await prisma.documents_company.findFirst({
    where: { id: documentId, applies: companyId, ...withFile },
    select: {
      applies: true,
      document_path: true,
      created_at: true,
      deny_reason: true,
      state: true,
      user_id: true,
      document_types: typeSelect,
    },
  });
  return row ? { ...row, resourceId: row.applies, policyNumber: null } : null;
}

export type DocumentRef = NonNullable<Awaited<ReturnType<typeof findDocumentRef>>>;

/**
 * Documento REAL de la empresa que el usuario puede ver: ficha (`detalle-de-documento`), lista de ese recurso y
 * período, y privado solo con `view_private`. Lanza `DocumentQueryError(403)` sin permiso y `DocumentNotFoundError`
 * si no existe en la empresa, está archivado, no tiene archivo o ya no es una fila vigente de su lista.
 */
export async function resolveVisibleDocument(
  ctx: TenantContext,
  resource: DocumentResource,
  documentId: string,
  access: DocumentAccess
): Promise<{ ref: DocumentRef; row: MobileDocumentRow }> {
  if (!access.detail) throw new DocumentQueryError(403, 'No tenés permiso para ver la ficha de los documentos.');
  return runInTenantScope(ctx, async () => {
    const ref = await findDocumentRef(ctx.companyId, resource, documentId);
    if (!ref) throw new DocumentNotFoundError();
    const monthly = ref.document_types?.is_it_montlhy === true;
    const isPrivate = ref.document_types?.private === true;
    const kindAccess = access[resource];
    if (!canListPeriod(kindAccess, monthly) || (isPrivate && !kindAccess.privateTypes)) {
      throw new DocumentQueryError(403, 'No tenés permiso para ver este documento.');
    }
    const companyName = resource === 'company' ? await companyNameOf(ctx.companyId) : '';
    const rows = await loadMobileDocumentRows(
      ctx,
      {
        resource,
        monthly,
        privateTypes: kindAccess.privateTypes,
        resourceId: resource === 'company' ? undefined : ref.resourceId,
      },
      companyName
    );
    const row = rows.find((candidate) => candidate.id === documentId);
    if (!row) throw new DocumentNotFoundError();
    return { ref, row };
  });
}

/** Nombre de quien subió o movió documentos (`profile.id` guardado en `user_id` / `modified_by`). */
async function profileNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.flatMap((id) => (id ? [id] : [])))];
  if (unique.length === 0) return new Map();
  const profiles = await prisma.profile.findMany({
    where: { id: { in: unique } },
    select: { id: true, fullname: true, email: true },
  });
  return new Map(profiles.flatMap((profile) => (profile.fullname || profile.email ? [[profile.id, (profile.fullname || profile.email)!] as const] : [])));
}

/** Historial de movimientos del documento (empleados y equipos; la empresa no registra movimientos). */
async function documentVersions(resource: DocumentResource, documentId: string) {
  if (resource === 'company') return [];
  const logs =
    resource === 'employee'
      ? await prisma.documents_employees_logs.findMany({
          where: { documents_employees_id: documentId },
          orderBy: { updated_at: 'desc' },
          take: 20,
          select: { updated_at: true, modified_by: true },
        })
      : await prisma.documents_equipment_logs.findMany({
          where: { documents_equipment_id: documentId },
          orderBy: { updated_at: 'desc' },
          take: 20,
          select: { updated_at: true, modified_by: true },
        });
  const names = await profileNames(logs.map((log) => log.modified_by));
  return logs.map((log) => ({ at: argentinaDateTime(log.updated_at), by: names.get(log.modified_by) ?? null }));
}

export async function getDocumentDetail(
  ctx: TenantContext,
  resource: DocumentResource,
  documentId: string,
  access: DocumentAccess
) {
  const { ref, row } = await resolveVisibleDocument(ctx, resource, documentId, access);
  const type = ref.document_types;
  const monthly = type?.is_it_montlhy === true;

  const [classRows, versions, names] = await runInTenantScope(ctx, () =>
    Promise.all([
      // A cuántos recursos aplica el tipo: el mismo motor, de toda la clase y el período del documento.
      loadMobileDocumentRows(
        ctx,
        { resource, monthly, privateTypes: access[resource].privateTypes },
        resource === 'company' ? row.resource.name : ''
      ),
      documentVersions(resource, documentId),
      profileNames([ref.user_id]),
    ])
  );
  const sameType = classRows.filter((item) => item.type.id === row.type.id);
  const requirement = type
    ? describeTypeRequirement({
        id: type.id,
        companyId: type.company_id,
        applies: type.applies,
        mandatory: type.mandatory,
        isActive: type.is_active,
        monthly,
        hasExpiry: type.explired,
        downDocument: type.down_document === true,
        isPrivate: type.private === true,
        multiresource: type.multiresource,
        scope: { special: type.special, conditions: type.conditions },
      })
    : null;

  return {
    id: row.id,
    resource: row.resource,
    type: row.type,
    status: row.status,
    state: labeledState(row.state),
    validity: row.validity,
    period: row.period,
    uploadedAt: argentinaDate(ref.created_at),
    denyReason: ref.deny_reason ?? null,
    policyNumber: ref.policyNumber ?? null,
    hasFile: Boolean(ref.document_path),
    uploadedBy: ref.user_id ? names.get(ref.user_id) ?? null : null,
    review: {
      code: ref.state ?? 'pendiente',
      label: DOCUMENT_STATE_LABELS[ref.state ?? 'pendiente'] ?? ref.state ?? 'pendiente',
      tone: DOCUMENT_STATE_TONE[ref.state ?? 'pendiente'] ?? ('neutral' as const),
      reason: ref.state === 'rechazado' ? ref.deny_reason ?? null : null,
    },
    appliesTo: {
      total: sameType.length,
      upToDate: sameType.filter((item) => item.status === 'valid' || item.status === 'expiring').length,
    },
    ...(requirement
      ? {
          conditions: {
            ...requirement,
            multiresource: type!.multiresource,
            mandatory: type!.mandatory,
            downDocument: type!.down_document === true,
          },
        }
      : {}),
    versions,
  };
}
