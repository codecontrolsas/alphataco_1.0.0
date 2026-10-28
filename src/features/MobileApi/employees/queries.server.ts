import 'server-only';

import { clothingDeliveryTypeLabels } from '@/features/Clothing/utils/mappers';
import { loadEmployeeDocumentRows } from '@/features/Documentacion/DocumentosEmpleados/lib/employee-document-rows.server';
import { isModuleEnabledForCompany } from '@/features/Modules/server/modules.server';
import type { Prisma } from '@/generated/prisma/client';
import { argentinaDate } from '@/shared/lib/argentina-time';
import { prismaBase } from '@/shared/lib/prisma';
import { runInTenantScope, runWithTenantContext, type TenantContext } from '@/shared/lib/tenant-context';
import {
  costTypeLabels,
  documentStateLabels,
  documentTypeLabels,
  employeeStatusBadges,
  employeeStatusLabels,
  genderLabels,
  levelOfEducationLabels,
  maritalStatusLabels,
  nationalityLabels,
  reasonForTerminationLabels,
} from '@/shared/utils/mappers';
import moment from 'moment';
import { z } from 'zod';
import type { EmployeeListQuery } from '../contracts/employees';
import type { EmployeeAccess } from './access';
import { buildPhotoUrls } from './photo';

/**
 * Consultas de Empleados para la API móvil. Todas corren con el contexto de la petición (RLS por empresa con el rol
 * de aplicación) Y filtran por `company_id` explícito (defensa en profundidad, como `withCompany` en la web).
 * Nunca seleccionan `picture` en listas: la foto viaja por su propia ruta y aquí solo se calcula su versión.
 */

type Tone = 'ok' | 'warn' | 'danger' | 'neutral';

const BADGE_TONE: Record<string, Tone> = { success: 'ok', yellow: 'warn', destructive: 'danger' };

function docStatusOf(status: string | null) {
  if (!status) return null;
  return {
    code: status,
    label: employeeStatusLabels[status] ?? status,
    tone: BADGE_TONE[employeeStatusBadges[status] ?? ''] ?? 'neutral',
  };
}

/** Columnas `@db.Date`: llegan como medianoche UTC. */
const isoDay = (value: Date | null | undefined) => (value ? moment.utc(value).format('YYYY-MM-DD') : null);
const label = (value: string | null | undefined, labels: Record<string, string>) =>
  value ? labels[value] ?? value : null;

/** Versión (md5 del data URL) de la foto de cada empleado de la página, en UNA consulta. */
async function photoVersions(tx: Prisma.TransactionClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.$queryRaw<{ id: string; version: string }[]>`
    SELECT id::text AS id, md5(picture) AS version
    FROM employees
    WHERE id = ANY(${ids}::uuid[]) AND picture LIKE 'data:image/%'`;
  return new Map(rows.map((row) => [row.id, row.version]));
}

// ─── Listado ──────────────────────────────────────────────────────────────────

const cursorSchema = z.discriminatedUnion('s', [
  z.object({ s: z.literal('name'), l: z.string(), f: z.string(), id: z.string().uuid() }),
  z.object({ s: z.literal('file'), f: z.string(), id: z.string().uuid() }),
  z.object({ s: z.literal('admission'), d: z.string(), id: z.string().uuid() }),
]);
type Cursor = z.infer<typeof cursorSchema>;

export class InvalidCursorError extends Error {}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(raw: string | undefined, sort: EmployeeListQuery['sort']): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    if (parsed.s !== sort) throw new InvalidCursorError('El cursor es de otro orden');
    return parsed;
  } catch {
    throw new InvalidCursorError('Cursor inválido');
  }
}

const ORDER_BY: Record<EmployeeListQuery['sort'], Prisma.employeesOrderByWithRelationInput[]> = {
  name: [{ lastname: 'asc' }, { firstname: 'asc' }, { id: 'asc' }],
  file: [{ file: 'asc' }, { id: 'asc' }],
  admission: [{ date_of_admission: 'desc' }, { id: 'asc' }],
};

/** Condición "después del cursor" (keyset) para el orden pedido; estable gracias al desempate por id. */
function afterCursor(cursor: Cursor): Prisma.employeesWhereInput {
  switch (cursor.s) {
    case 'name':
      return {
        OR: [
          { lastname: { gt: cursor.l } },
          { lastname: cursor.l, firstname: { gt: cursor.f } },
          { lastname: cursor.l, firstname: cursor.f, id: { gt: cursor.id } },
        ],
      };
    case 'file':
      return { OR: [{ file: { gt: cursor.f } }, { file: cursor.f, id: { gt: cursor.id } }] };
    case 'admission': {
      const date = new Date(`${cursor.d}T00:00:00.000Z`);
      return { OR: [{ date_of_admission: { lt: date } }, { date_of_admission: date, id: { gt: cursor.id } }] };
    }
  }
}

/**
 * Búsqueda: solo dígitos (con puntos, guiones o espacios) busca por legajo, CUIL o DNI; texto busca por apellido y
 * nombre, cada palabra en alguno de los dos (así "perez juan" y "juan perez" encuentran lo mismo).
 */
function searchWhere(q: string | undefined): Prisma.employeesWhereInput | null {
  const text = q?.trim();
  if (!text) return null;
  const digits = text.replace(/[\s.\-/]/g, '');
  if (/^\d+$/.test(digits)) {
    return {
      OR: [{ file: { contains: digits } }, { cuil: { contains: digits } }, { document_number: { contains: digits } }],
    };
  }
  const words = text.split(/\s+/).filter(Boolean).slice(0, 4);
  return {
    AND: words.map((word) => ({
      OR: [
        { lastname: { contains: word, mode: 'insensitive' as const } },
        { firstname: { contains: word, mode: 'insensitive' as const } },
        { file: { contains: word, mode: 'insensitive' as const } },
      ],
    })),
  };
}

function listWhere(companyId: string, query: EmployeeListQuery, showDocStatus: boolean): Prisma.employeesWhereInput {
  const conditions: Prisma.employeesWhereInput[] = [
    { company_id: companyId },
    { is_active: query.status === 'active' },
  ];
  const search = searchWhere(query.q);
  if (search) conditions.push(search);
  if (query.sectorId) conditions.push({ hierarchical_position: query.sectorId });
  if (query.positionId) conditions.push({ company_position: query.positionId });
  if (query.customerId) conditions.push({ contractor_employee: { some: { contractor_id: query.customerId } } });
  // Con `documentacion` apagado el `status` (caché del cumplimiento documental) está congelado: no se filtra por él.
  if (query.docStatus && showDocStatus) conditions.push({ status: query.docStatus });
  return { AND: conditions };
}

/** Página del listado con paginación por cursor y respuesta liviana (sin foto: solo sus URLs prefirmadas). */
export async function listEmployees(ctx: TenantContext, query: EmployeeListQuery) {
  const cursor = decodeCursor(query.cursor, query.sort);
  const showDocStatus = await isModuleEnabledForCompany('documentacion', ctx.companyId);
  const where = listWhere(ctx.companyId, query, showDocStatus);
  const pageWhere = cursor ? { AND: [where, afterCursor(cursor)] } : where;

  return runWithTenantContext(prismaBase, ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.employees.findMany({
        where: pageWhere,
        orderBy: ORDER_BY[query.sort],
        take: query.limit + 1,
        select: {
          id: true,
          file: true,
          lastname: true,
          firstname: true,
          date_of_admission: true,
          is_active: true,
          status: true,
          company_positions: { select: { name: true } },
          hierarchy: { select: { name: true } },
        },
      }),
      cursor ? Promise.resolve(null) : tx.employees.count({ where }),
    ]);

    const page = rows.slice(0, query.limit);
    const versions = await photoVersions(
      tx,
      page.map((row) => row.id)
    );
    const last = page.at(-1);
    const hasMore = rows.length > query.limit && last !== undefined;

    let nextCursor: string | null = null;
    if (hasMore && last) {
      nextCursor = encodeCursor(
        query.sort === 'name'
          ? { s: 'name', l: last.lastname, f: last.firstname, id: last.id }
          : query.sort === 'file'
            ? { s: 'file', f: last.file, id: last.id }
            : { s: 'admission', d: isoDay(last.date_of_admission) ?? '1900-01-01', id: last.id }
      );
    }

    return {
      items: page.map((row) => ({
        id: row.id,
        fileNumber: row.file,
        fullName: `${row.lastname} ${row.firstname}`,
        position: row.company_positions?.name ?? null,
        sector: row.hierarchy?.name ?? null,
        isActive: row.is_active !== false,
        docStatus: showDocStatus ? docStatusOf(row.status) : null,
        photo: buildPhotoUrls(ctx.companyId, row.id, versions.get(row.id) ?? null),
      })),
      nextCursor,
      total,
    };
  });
}

/** Opciones de los filtros del listado (catálogos de la empresa). */
export async function getEmployeeFilterOptions(ctx: TenantContext, access: EmployeeAccess) {
  const showDocStatus = await isModuleEnabledForCompany('documentacion', ctx.companyId);
  return runWithTenantContext(prismaBase, ctx, async (tx) => {
    const [sectors, positions, customers] = await Promise.all([
      tx.hierarchy.findMany({
        where: { company_id: ctx.companyId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      tx.company_positions.findMany({
        where: { company_id: ctx.companyId, name: { not: null } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      tx.customers.findMany({
        where: { company_id: ctx.companyId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      statuses: [
        ...(access.listActive ? [{ value: 'active' as const, label: 'Activos' }] : []),
        ...(access.listInactive ? [{ value: 'inactive' as const, label: 'Bajas' }] : []),
      ],
      sectors,
      positions: positions.flatMap((position) => (position.name ? [{ id: position.id, name: position.name }] : [])),
      customers,
      docStatuses: showDocStatus
        ? Object.entries(employeeStatusLabels).map(([value, text]) => ({ value, label: text }))
        : [],
    };
  });
}

// ─── Legajo ───────────────────────────────────────────────────────────────────

/** Legajo de un empleado de la empresa, con los bloques que el usuario puede ver. null = no existe en la empresa. */
export async function getEmployeeDetail(ctx: TenantContext, employeeId: string, access: EmployeeAccess) {
  const showDocStatus = await isModuleEnabledForCompany('documentacion', ctx.companyId);
  return runWithTenantContext(prismaBase, ctx, async (tx) => {
    const employee = await tx.employees.findFirst({
      where: { id: employeeId, company_id: ctx.companyId },
      select: {
        id: true,
        file: true,
        firstname: true,
        lastname: true,
        is_active: true,
        status: true,
        termination_date: true,
        reason_for_termination: true,
        document_type: true,
        document_number: true,
        cuil: true,
        born_date: true,
        gender: true,
        nationality: true,
        marital_status: true,
        level_of_education: true,
        phone: true,
        email: true,
        street: true,
        street_number: true,
        postal_code: true,
        date_of_admission: true,
        normal_hours: true,
        cost_type: true,
        countries: { select: { name: true } },
        provinces: { select: { name: true } },
        cities: { select: { name: true } },
        hierarchy: { select: { name: true } },
        company_positions: { select: { name: true } },
        types_of_contract: { select: { name: true } },
        work_diagram: { select: { name: true } },
        guild: { select: { name: true } },
        covenant: { select: { name: true } },
        category: { select: { name: true } },
        cost_center: { select: { name: true } },
        contractor_employee: { select: { customers: { select: { name: true } } } },
        empleado_aptitudes: { select: { aptitudes_tecnicas: { select: { nombre: true } } } },
        employee_workshop_sectors: { select: { workshop_sectors: { select: { name: true } } } },
      },
    });
    if (!employee) return null;
    const versions = await photoVersions(tx, [employee.id]);
    const e = employee;

    return {
      id: e.id,
      fileNumber: e.file,
      fullName: `${e.lastname} ${e.firstname}`,
      firstName: e.firstname,
      lastName: e.lastname,
      isActive: e.is_active !== false,
      position: e.company_positions?.name ?? null,
      sector: e.hierarchy?.name ?? null,
      docStatus: showDocStatus ? docStatusOf(e.status) : null,
      termination:
        e.is_active === false
          ? { date: isoDay(e.termination_date), reason: label(e.reason_for_termination, reasonForTerminationLabels) }
          : null,
      photo: buildPhotoUrls(ctx.companyId, e.id, versions.get(e.id) ?? null),
      ...(access.personal
        ? {
            personal: {
              documentType: label(e.document_type, documentTypeLabels),
              documentNumber: e.document_number,
              cuil: e.cuil,
              // `born_date` es texto en la base.
              birthDate: e.born_date ? moment.utc(e.born_date).format('YYYY-MM-DD') : null,
              gender: label(e.gender, genderLabels),
              nationality: label(e.nationality, nationalityLabels),
              birthCountry: e.countries?.name ?? null,
              maritalStatus: label(e.marital_status, maritalStatusLabels),
              educationLevel: label(e.level_of_education, levelOfEducationLabels),
            },
          }
        : {}),
      ...(access.contact
        ? {
            contact: {
              phone: e.phone || null,
              email: e.email || null,
              address: [e.street, e.street_number].filter(Boolean).join(' ') || null,
              city: e.cities?.name ?? null,
              province: e.provinces?.name ?? null,
              postalCode: e.postal_code || null,
            },
          }
        : {}),
      ...(access.work
        ? {
            work: {
              admissionDate: isoDay(e.date_of_admission),
              contractType: e.types_of_contract?.name ?? null,
              workDiagram: e.work_diagram?.name ?? null,
              normalHours: e.normal_hours,
              guild: e.guild?.name ?? null,
              covenant: e.covenant?.name ?? null,
              category: e.category?.name ?? null,
              costCenter: e.cost_center?.name ?? null,
              costType: label(e.cost_type, costTypeLabels),
              customers: e.contractor_employee.flatMap((item) => (item.customers ? [item.customers.name] : [])),
              aptitudes: e.empleado_aptitudes.flatMap((item) =>
                item.aptitudes_tecnicas ? [item.aptitudes_tecnicas.nombre] : []
              ),
              workshopSectors: e.employee_workshop_sectors.flatMap((item) =>
                item.workshop_sectors ? [item.workshop_sectors.name] : []
              ),
            },
          }
        : {}),
      sections: { documents: access.documents.visible, diagram: access.diagram, clothing: access.clothing },
    };
  });
}

/** `true` si el empleado existe en la empresa (para responder 404 antes de calcular una sección). */
export async function employeeExists(ctx: TenantContext, employeeId: string): Promise<boolean> {
  const row = await runWithTenantContext(prismaBase, ctx, (tx) =>
    tx.employees.findFirst({ where: { id: employeeId, company_id: ctx.companyId }, select: { id: true } })
  );
  return row !== null;
}

// ─── Documentación ────────────────────────────────────────────────────────────

/** Estados de las listas de documentos: `pendiente` es la fila faltante (igual que `documentListStateLabels`). */
const DOCUMENT_STATE_LABELS: Record<string, string> = { ...documentStateLabels, pendiente: 'Faltante' };
const DOCUMENT_STATE_TONE: Record<string, Tone> = {
  aprobado: 'ok',
  presentado: 'neutral',
  rechazado: 'danger',
  vencido: 'warn',
  pendiente: 'danger',
};

const toDay = (value: Date | string | null) => (value ? argentinaDate(new Date(value)) : null);

/**
 * Documentación del legajo con el MISMO motor de cumplimiento que la ficha web (`loadEmployeeDocumentRows`): estado
 * derivado, faltantes, "ya no aplica" y privados según `view_private`. Corre con el contexto de la petición en el ALS
 * porque esas consultas usan el cliente contextual.
 */
export async function getEmployeeDocuments(ctx: TenantContext, employeeId: string, access: EmployeeAccess) {
  const { permanent: canPermanent, monthly: canMonthly, privateTypes } = access.documents;
  const [permanentRows, monthlyRows] = await runInTenantScope(ctx, () =>
    Promise.all([
      canPermanent ? loadEmployeeDocumentRows(ctx.companyId, false, privateTypes, employeeId) : Promise.resolve(null),
      canMonthly ? loadEmployeeDocumentRows(ctx.companyId, true, privateTypes, employeeId) : Promise.resolve(null),
    ])
  );

  type Row = NonNullable<typeof permanentRows>[number];
  const toDocument = (row: Row, monthly: boolean) => ({
    id: row.id,
    type: row.document_types.name,
    monthly,
    mandatory: row.document_types.mandatory === true,
    state: {
      code: row.state,
      label: DOCUMENT_STATE_LABELS[row.state] ?? row.state,
      tone: row.notApplicable ? ('neutral' as const) : DOCUMENT_STATE_TONE[row.state] ?? 'neutral',
    },
    validity: toDay(row.validity),
    period: row.period,
    expiringSoon: row.expiringSoon,
    notApplicable: row.notApplicable,
    denyReason: row.deny_reason,
  });

  // Lo que pide acción primero: faltantes y rechazados, vencidos, por vencer; después por nombre.
  const RANK: Record<string, number> = { pendiente: 0, rechazado: 1, vencido: 2, presentado: 4, aprobado: 5 };
  const sortDocs = <T extends ReturnType<typeof toDocument>>(docs: T[]) =>
    docs.sort(
      (a, b) =>
        Number(a.notApplicable) - Number(b.notApplicable) ||
        (a.expiringSoon ? 3 : RANK[a.state.code] ?? 9) - (b.expiringSoon ? 3 : RANK[b.state.code] ?? 9) ||
        a.type.localeCompare(b.type, 'es')
    );

  const permanent = permanentRows ? sortDocs(permanentRows.map((row) => toDocument(row, false))) : null;
  const monthly = monthlyRows ? sortDocs(monthlyRows.map((row) => toDocument(row, true))) : null;
  const all = [...(permanent ?? []), ...(monthly ?? [])].filter((doc) => !doc.notApplicable);

  return {
    permanent,
    monthly,
    summary: {
      total: all.length,
      missing: all.filter((doc) => doc.state.code === 'pendiente').length,
      expired: all.filter((doc) => doc.state.code === 'vencido').length,
      expiringSoon: all.filter((doc) => doc.expiringSoon).length,
    },
  };
}

// ─── Diagrama ─────────────────────────────────────────────────────────────────

/** Novedades del diagrama desde una semana atrás hasta tres semanas adelante (hora argentina). */
export async function getEmployeeDiagram(ctx: TenantContext, employeeId: string) {
  const today = moment.utc(argentinaDate());
  const from = today.clone().subtract(7, 'days');
  const to = today.clone().add(21, 'days');
  const months: { year: number; month: number }[] = [];
  for (const cursor = from.clone().startOf('month'); cursor.isSameOrBefore(to, 'month'); cursor.add(1, 'month')) {
    months.push({ year: cursor.year(), month: cursor.month() + 1 });
  }

  const rows = await runWithTenantContext(prismaBase, ctx, (tx) =>
    tx.employees_diagram.findMany({
      where: {
        employee_id: employeeId,
        company_id: ctx.companyId,
        OR: months.map(({ year, month }) => ({ year, month })),
      },
      select: {
        day: true,
        month: true,
        year: true,
        comments: true,
        diagram_type_employees_diagram_diagram_typeTodiagram_type: {
          select: { name: true, short_description: true, color: true },
        },
      },
    })
  );

  const fromDay = from.format('YYYY-MM-DD');
  const toDayStr = to.format('YYYY-MM-DD');
  const days = rows
    .map((row) => {
      const type = row.diagram_type_employees_diagram_diagram_typeTodiagram_type;
      const date = moment
        .utc({ year: Number(row.year), month: Number(row.month) - 1, day: Number(row.day) })
        .format('YYYY-MM-DD');
      return {
        date,
        type: type?.name ?? 'Sin tipo',
        shortName: type?.short_description ?? null,
        color: type?.color ?? null,
        comments: row.comments,
      };
    })
    .filter((day) => day.date >= fromDay && day.date <= toDayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  return { from: fromDay, to: toDayStr, days };
}

// ─── Indumentaria ─────────────────────────────────────────────────────────────

const CLOTHING_LIMIT = 20;

/** Últimas entregas de indumentaria y EPP (sin importes: la app no muestra costos). */
export async function getEmployeeClothing(ctx: TenantContext, employeeId: string) {
  const deliveries = await runWithTenantContext(prismaBase, ctx, (tx) =>
    tx.clothing_deliveries.findMany({
      where: { employee_id: employeeId, company_id: ctx.companyId },
      orderBy: { delivered_at: 'desc' },
      take: CLOTHING_LIMIT,
      select: {
        id: true,
        delivered_at: true,
        delivery_type: true,
        cancelled_at: true,
        clothing_delivery_items: {
          select: {
            quantity: true,
            clothing_items: { select: { name: true } },
            clothing_sizes: { select: { name: true } },
          },
        },
      },
    })
  );
  return {
    deliveries: deliveries.map((delivery) => ({
      id: delivery.id,
      deliveredAt: argentinaDate(delivery.delivered_at),
      type: clothingDeliveryTypeLabels[delivery.delivery_type] ?? delivery.delivery_type,
      cancelled: delivery.cancelled_at !== null,
      items: delivery.clothing_delivery_items.map((item) => ({
        name: item.clothing_items.name,
        quantity: item.quantity,
        size: item.clothing_sizes?.name ?? null,
      })),
    })),
  };
}

// ─── Foto ─────────────────────────────────────────────────────────────────────

/** Foto guardada (data URL) de un empleado de la empresa. */
export async function getEmployeePicture(companyId: string, employeeId: string): Promise<string | null> {
  const row = await runWithTenantContext(prismaBase, { companyId, userId: null, kind: 'api' }, (tx) =>
    tx.employees.findFirst({ where: { id: employeeId, company_id: companyId }, select: { picture: true } })
  );
  return row?.picture ?? null;
}
