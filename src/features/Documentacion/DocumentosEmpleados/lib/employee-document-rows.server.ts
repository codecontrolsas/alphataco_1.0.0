import 'server-only';

import type { Prisma } from '@/generated/prisma/client';
import type { InMemoryTableSpec } from '@/shared/lib/in-memory-table';
import { prisma } from '@/shared/lib/prisma';
import { cache } from 'react';
import { normalizePeriod } from '../../shared/compliance/dates';
import {
  DOCUMENT_STATE_RANK,
  loadDocumentEntries,
  periodSearchValues,
  type DocumentEntry,
} from '../../shared/compliance/server/document-entries.server';

/**
 * Filas de las listas de documentos de empleados (permanentes y mensuales), calculadas por el motor
 * de cumplimiento. Tienen la MISMA forma que las filas Prisma que usaban las listas (`employees`,
 * `document_types`, `created_at`...) más `isMissing` / `expiringSoon` / `notApplicable`, así que
 * columnas y tablas casi no cambian. El id de una fila faltante es `missing:<empleado>:<tipo>[:<período>]`.
 */

const EMPLOYEE_DISPLAY_SELECT = {
  id: true,
  firstname: true,
  lastname: true,
  document_number: true,
  file: true,
  // Afectaciones del empleado (M:M → customers)
  contractor_employee: { select: { customers: { select: { id: true, name: true } } } },
} as const;

type EmployeeDisplay = Prisma.employeesGetPayload<{ select: typeof EMPLOYEE_DISPLAY_SELECT }>;

/** Datos de presentación de los empleados: activos de la empresa, o el de la ficha si es una lista embebida. */
const loadEmployeeDisplay = cache(async (companyId: string, employeeId: string) => {
  const employees = await prisma.employees.findMany({
    where: employeeId
      ? { id: employeeId, company_id: companyId }
      : { company_id: companyId, OR: [{ is_active: true }, { is_active: null }] },
    select: EMPLOYEE_DISPLAY_SELECT,
  });
  return new Map(employees.map((e) => [e.id, e]));
});

function toEmployeeDocumentRow(entry: DocumentEntry, employee: EmployeeDisplay) {
  return {
    id: entry.rowId,
    created_at: entry.doc ? entry.doc.createdAt : null,
    validity: entry.extra ? entry.extra.validityDate : null,
    state: entry.state,
    deny_reason: entry.extra ? entry.extra.denyReason : null,
    document_path: entry.doc ? entry.doc.path : null,
    period: entry.period,
    applies: entry.resourceId,
    id_document_types: entry.typeId,
    employees: employee,
    document_types: {
      id: entry.typeId,
      name: entry.typeName,
      mandatory: entry.type.mandatory,
      multiresource: entry.type.multiresource,
      explired: entry.type.hasExpiry,
      is_it_montlhy: entry.type.monthly,
      private: entry.type.isPrivate,
    },
    /** Último movimiento del documento (sólo se completa para la página que se muestra). */
    documents_employees_logs: [] as Array<{ updated_at: Date }>,
    /** Fila sintética: el tipo es obligatorio y no hay documento. */
    isMissing: entry.isMissing,
    /** Vence dentro de los próximos 30 días. */
    expiringSoon: entry.expiringSoon,
    /** El tipo ya no aplica al empleado (sólo en la ficha del empleado). */
    notApplicable: entry.notApplicable,
    /** Criterio por el que se pide el documento (sólo en la ficha del recurso). */
    requestedBy: entry.requestedBy,
  };
}

export type EmployeeDocumentRow = ReturnType<typeof toEmployeeDocumentRow>;

/**
 * Todas las filas de la lista (sin filtros del usuario), una vez por request.
 * `employeeId` vacío = lista general (empleados activos de la empresa).
 */
export const loadEmployeeDocumentRows = cache(
  async (companyId: string, monthly: boolean, canViewPrivate: boolean, employeeId: string) => {
    const [{ entries }, employees] = await Promise.all([
      loadDocumentEntries(companyId, 'Persona', monthly, canViewPrivate, employeeId),
      loadEmployeeDisplay(companyId, employeeId),
    ]);
    const rows: EmployeeDocumentRow[] = [];
    for (const entry of entries) {
      const employee = employees.get(entry.resourceId);
      if (employee) rows.push(toEmployeeDocumentRow(entry, employee));
    }
    return rows;
  }
);

/** Completa `documents_employees_logs` (fecha del último movimiento) de las filas ya paginadas: 1 consulta. */
export async function attachEmployeeDocumentLogs(rows: EmployeeDocumentRow[]): Promise<EmployeeDocumentRow[]> {
  const ids = rows.filter((r) => !r.isMissing).map((r) => r.id);
  if (ids.length === 0) return rows;
  const logs = await prisma.documents_employees_logs.groupBy({
    by: ['documents_employees_id'],
    where: { documents_employees_id: { in: ids } },
    _max: { updated_at: true },
  });
  const latest = new Map(logs.map((l) => [l.documents_employees_id, l._max.updated_at]));
  return rows.map((row) => {
    const updatedAt = latest.get(row.id);
    return updatedAt ? { ...row, documents_employees_logs: [{ updated_at: updatedAt }] } : row;
  });
}

function employeeNames(row: EmployeeDocumentRow): string[] {
  const { lastname, firstname } = row.employees;
  return [lastname, firstname, `${lastname} ${firstname}`, `${firstname} ${lastname}`];
}

/**
 * Búsqueda, filtros, facetas y orden de las listas de empleados. `typeColumnId` es el id de la
 * columna del tipo de documento (`document_type` en permanentes, `documentType` en mensuales).
 */
export function employeeDocumentSpec(typeColumnId: string): InMemoryTableSpec<EmployeeDocumentRow> {
  return {
    rowId: (row) => row.id,
    search: {
      contains: (row) => [...employeeNames(row), row.document_types.name],
      // Legajo: coincidencia exacta ("1" no debe traer "10" ni "100").
      exact: (row) => [row.employees.file],
    },
    textFilters: {
      employee: employeeNames,
      deny_reason: (row) => [row.deny_reason],
      period: (row) => periodSearchValues(row.period),
    },
    exactFilters: { fileNumber: (row) => [row.employees.file] },
    facets: {
      state: (row) => [{ id: row.state }],
      [typeColumnId]: (row) => [{ id: row.id_document_types, name: row.document_types.name }],
      mandatory: (row) => [{ id: String(row.document_types.mandatory) }],
      multiresource: (row) => [{ id: String(row.document_types.multiresource) }],
      contractor: (row) =>
        row.employees.contractor_employee.flatMap((ce) =>
          ce.customers ? [{ id: ce.customers.id, name: ce.customers.name }] : []
        ),
    },
    dateRanges: {
      created_at: (row) => row.created_at,
      validity: (row) => row.validity,
    },
    sorters: {
      created_at: (row) => row.created_at,
      validity: (row) => row.validity,
      state: (row) => DOCUMENT_STATE_RANK[row.state],
      period: (row) => normalizePeriod(row.period) ?? row.period,
      employee: (row) => `${row.employees.lastname} ${row.employees.firstname}`,
      [typeColumnId]: (row) => row.document_types.name,
    },
    defaultSort: [(row) => row.employees.lastname, (row) => row.employees.firstname, (row) => row.document_types.name],
  };
}
