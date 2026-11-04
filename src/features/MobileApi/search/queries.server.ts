import 'server-only';

import { HSE_TRAINING_KIND_LABELS } from '@/features/Hse/lib/constants';
import { Logger } from '@/lib/logger';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prismaBase } from '@/shared/lib/prisma';
import { runWithTenantContext, type TenantContext } from '@/shared/lib/tenant-context';
import moment from 'moment';
import { SEARCH_GROUP_LIMIT, type SearchGroupType } from '../contracts/search';
import { allowedResources } from '../documents/access';
import { listDocuments } from '../documents/queries.server';
import type { EmployeeAccess } from '../employees/access';
import { listEmployees } from '../employees/queries.server';
import type { EquipmentAccess } from '../equipment/access';
import { listEquipment } from '../equipment/queries.server';
import { toReportDateString } from '@/features/Operaciones/PartesDiarios/detail/lib/report-date';
import { matchAppModules, type SearchAccess } from './access';

const logger = new Logger('features/MobileApi/search');

/**
 * Búsqueda global: una consulta, un grupo por tipo con hasta 5 resultados y su total. Reutiliza las listas de cada
 * pantalla (`listEmployees`, `listEquipment`, `listDocuments`) con `limit: 5`, así la búsqueda, los permisos y los
 * índices son los de la lista. Los grupos corren en paralelo; para no pagar de más se desactiva lo que solo enriquece
 * la lista (resumen documental, chofer, mantenimiento): la búsqueda devuelve identificación, no estado.
 */

const FIRST_PAGE = { limit: SEARCH_GROUP_LIMIT } as const;

/** Accesos de Empleados sin el resumen documental (el motor de cumplimiento recorre toda la empresa). */
const lightEmployees = (access: EmployeeAccess): EmployeeAccess => ({
  ...access,
  documentList: { visible: false, permanent: false, monthly: false, privateTypes: false },
});

/** Accesos de Equipos sin resumen documental, chofer ni mantenimiento. */
const lightEquipment = (access: EquipmentAccess): EquipmentAccess => ({
  ...access,
  reports: false,
  vehicle: {
    ...access.vehicle,
    maintenance: false,
    documentList: { visible: false, permanent: false, monthly: false, privateTypes: false },
  },
  other: { ...access.other, certifications: false },
});

/**
 * Fecha escrita por el usuario: `2026-11-04`, `04/11/2026`, `4-11-26`, o `4/11` (año en curso, hora argentina).
 * null si no es una fecha válida.
 */
export function parseSearchDate(text: string, today: string = argentinaDate()): string | null {
  const value = text.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(value);
  const dm = /^(\d{1,2})[/\-.](\d{1,2})$/.exec(value);
  let year: string;
  let month: string;
  let day: string;
  if (iso) [, year, month, day] = iso;
  else if (dmy) {
    [, day, month, year] = dmy;
    if (year.length === 2) year = `20${year}`;
  } else if (dm) {
    [, day, month] = dm;
    year = today.slice(0, 4);
  } else return null;
  const parsed = moment.utc(`${year}-${month}-${day}`, 'YYYY-M-D', true);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
}

type Group = { type: SearchGroupType; total: number; items: unknown[] };

async function searchEmployees(ctx: TenantContext, q: string, access: SearchAccess): Promise<Group> {
  const light = lightEmployees(access.employees);
  const base = { q, sort: 'name' as const, alerts: false, ...FIRST_PAGE };
  const [active, inactive] = await Promise.all([
    access.employees.listActive ? listEmployees(ctx, { ...base, status: 'active' }, light) : null,
    access.employees.listInactive ? listEmployees(ctx, { ...base, status: 'inactive' }, light) : null,
  ]);
  const items = [...(active?.items ?? []), ...(inactive?.items ?? [])].slice(0, SEARCH_GROUP_LIMIT);
  return {
    type: 'employees',
    total: (active?.total ?? 0) + (inactive?.total ?? 0),
    items: items.map((item) => ({
      id: item.id,
      fileNumber: item.fileNumber,
      fullName: item.fullName,
      position: item.position,
      sector: item.sector,
      isActive: item.isActive,
    })),
  };
}

async function searchEquipment(ctx: TenantContext, q: string, access: SearchAccess): Promise<Group> {
  const light = lightEquipment(access.equipment);
  const base = { q, ...FIRST_PAGE };
  const kinds = [
    { kind: 'vehicle' as const, active: access.equipment.vehicle.listActive, inactive: access.equipment.vehicle.listInactive },
    { kind: 'other' as const, active: access.equipment.other.listActive, inactive: access.equipment.other.listInactive },
  ];
  const pages = await Promise.all(
    kinds.flatMap(({ kind, active, inactive }) => [
      active ? listEquipment(ctx, { ...base, kind, status: 'active' }, light, access.employees) : null,
      inactive ? listEquipment(ctx, { ...base, kind, status: 'inactive' }, light, access.employees) : null,
    ])
  );
  const found = pages.flatMap((page) => (page ? [page] : []));
  return {
    type: 'equipment',
    total: found.reduce((sum, page) => sum + (page.total ?? 0), 0),
    items: found
      .flatMap((page) =>
        page.items.map((item) => ({
          id: item.id,
          kind: item.kind,
          identifier: item.identifier,
          domain: item.domain,
          internNumber: item.internNumber,
          type: item.type,
          brand: item.brand,
          model: item.model,
          isActive: item.isActive,
        }))
      )
      .slice(0, SEARCH_GROUP_LIMIT),
  };
}

async function searchDocuments(
  ctx: TenantContext,
  q: string,
  access: SearchAccess,
  enabled: ReadonlySet<string>
): Promise<Group> {
  if (allowedResources(access.documents, enabled).length === 0) return { type: 'documents', total: 0, items: [] };
  const page = await listDocuments(ctx, { q, ...FIRST_PAGE }, access.documents, enabled);
  return {
    type: 'documents',
    total: page.total ?? 0,
    items: page.items.map((item) => ({
      id: item.id,
      type: item.type.name,
      resource: {
        kind: item.resource.kind,
        id: item.resource.id,
        name: item.resource.name,
        fileNumber: item.resource.fileNumber,
      },
      status: item.status,
      validity: item.validity,
      hasDetail: item.hasDetail,
    })),
  };
}

async function searchTrainings(ctx: TenantContext, q: string): Promise<Group> {
  const where = {
    company_id: ctx.companyId,
    status: 'published' as const,
    title: { contains: q, mode: 'insensitive' as const },
  };
  const [rows, total] = await runWithTenantContext(prismaBase, ctx, (tx) =>
    Promise.all([
      tx.hse_trainings.findMany({
        where,
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        take: SEARCH_GROUP_LIMIT,
        select: { id: true, title: true, kind: true },
      }),
      tx.hse_trainings.count({ where }),
    ])
  );
  return {
    type: 'trainings',
    total,
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: { code: row.kind, label: HSE_TRAINING_KIND_LABELS[row.kind] },
    })),
  };
}

/** Un parte por día y empresa: la búsqueda por fecha trae a lo sumo uno. */
async function searchDailyReports(ctx: TenantContext, q: string): Promise<Group> {
  const day = parseSearchDate(q);
  if (!day) return { type: 'daily-reports', total: 0, items: [] };
  const reports = await runWithTenantContext(prismaBase, ctx, (tx) =>
    tx.dailyreport.findMany({
      where: { company_id: ctx.companyId, date: new Date(`${day}T00:00:00.000Z`), is_active: { not: false } },
      take: SEARCH_GROUP_LIMIT,
      select: { id: true, date: true, status: true, _count: { select: { dailyreportrows: true } } },
    })
  );
  return {
    type: 'daily-reports',
    total: reports.length,
    items: reports.map((report) => ({
      id: report.id,
      date: toReportDateString(report.date),
      status: report.status,
      rowCount: report._count.dailyreportrows,
    })),
  };
}

export async function searchAll(
  ctx: TenantContext,
  q: string,
  access: SearchAccess,
  enabled: ReadonlySet<string>
) {
  const tasks: { type: SearchGroupType; run: () => Promise<Group> }[] = [
    ...(access.groups.employees ? [{ type: 'employees' as const, run: () => searchEmployees(ctx, q, access) }] : []),
    ...(access.groups.equipment ? [{ type: 'equipment' as const, run: () => searchEquipment(ctx, q, access) }] : []),
    ...(access.groups.documents ? [{ type: 'documents' as const, run: () => searchDocuments(ctx, q, access, enabled) }] : []),
    ...(access.groups.trainings ? [{ type: 'trainings' as const, run: () => searchTrainings(ctx, q) }] : []),
    ...(access.groups['daily-reports']
      ? [{ type: 'daily-reports' as const, run: () => searchDailyReports(ctx, q) }]
      : []),
  ];
  const settled = await Promise.allSettled(tasks.map((task) => task.run()));
  const groups: Group[] = [];
  const failed: SearchGroupType[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') groups.push(result.value);
    else {
      failed.push(tasks[index].type);
      logger.error('Error en un grupo de la búsqueda', { data: { error: result.reason, group: tasks[index].type } });
    }
  });
  const modules = matchAppModules(access, q);
  groups.push({ type: 'modules', total: modules.length, items: modules.slice(0, SEARCH_GROUP_LIMIT) });
  return { q, groups, failed };
}
