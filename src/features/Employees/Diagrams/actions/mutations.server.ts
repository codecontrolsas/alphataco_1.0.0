'use server';

import type { Prisma } from '@/generated/prisma/client';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import moment from 'moment';
import { z } from 'zod';

import { assertAnyDiagramPermission, assertDiagramAction } from '../lib/diagram-access';
import { uuidLike } from '../lib/diagram-ids';
import { DIAGRAM_MUTATION_MAX_ROWS } from '../lib/massive-limits';

const logger = new Logger('features/Employees/Diagrams/mutations');

/**
 * Novedad a insertar. El comentario es opcional y se guarda por día:
 * una carga sobre un rango replica el mismo texto en cada día, salvo los
 * días que el usuario haya personalizado.
 */
export interface DiagramInsert {
  employee_id: string;
  diagram_type: string;
  day: number;
  month: number;
  year: number;
  comments?: string | null;
}

export interface DiagramUpdate {
  diagramId: string;
  diagram_type: string;
  /** Sólo se pisa cuando viene definido, para no borrar el comentario existente. */
  comments?: string | null;
}

async function requireActor(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Sesión requerida');
  return userId;
}

/** Ids de `diagram_type` que pertenecen a la empresa activa (perímetro sin RLS). */
async function assertDiagramTypesOwned(tx: Prisma.TransactionClient, ids: string[], companyId: string) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  const owned = await tx.diagram_type.count({ where: { id: { in: unique }, company_id: companyId } });
  if (owned !== unique.length) throw new Error('Tipo de novedad inválido para la empresa activa');
}

const diagramInsertSchema = z.object({
  employee_id: uuidLike,
  diagram_type: uuidLike,
  day: z.number().int().min(1).max(31),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  comments: z.string().max(500, 'El comentario no puede superar 500 caracteres').nullable().optional(),
});

const diagramUpdateSchema = z.object({
  diagramId: uuidLike,
  diagram_type: uuidLike,
  comments: z.string().max(500, 'El comentario no puede superar 500 caracteres').nullable().optional(),
});

/** Valida filas y que cada día/mes/año sea una fecha real (no 31/02). */
function parseInserts(diagramData: DiagramInsert[]): DiagramInsert[] {
  if (diagramData.length > DIAGRAM_MUTATION_MAX_ROWS) {
    throw new Error(`Máximo ${DIAGRAM_MUTATION_MAX_ROWS} novedades por carga`);
  }
  const parsed = z.array(diagramInsertSchema).safeParse(diagramData);
  if (!parsed.success) throw new Error('Datos de novedades inválidos');
  for (const row of parsed.data) {
    if (!moment({ year: row.year, month: row.month - 1, day: row.day }).isValid()) {
      throw new Error(`Fecha inválida: ${row.day}/${row.month}/${row.year}`);
    }
  }
  return parsed.data;
}

/**
 * Crea novedades por día. Los días que ya tienen registro (unique empleado+fecha) se omiten,
 * igual que antes, cuando cada INSERT fallaba por separado sin abortar el resto.
 * Devuelve `count` (filas realmente creadas) y `requested` (filas enviadas): si difieren, el resto ya existía.
 * Las mutaciones corren con el actor seteado: los triggers de `diagrams_logs` leen `app.user_id`.
 */
export async function CreateDiagrams(diagramData: DiagramInsert[]): Promise<{ count: number; requested: number }> {
  if (diagramData.length === 0) return { count: 0, requested: 0 };
  // `employees:update`: el formulario también se usa embebido en el detalle del empleado.
  await assertAnyDiagramPermission([
    ['new', 'create'],
    ['employees', 'update'],
  ]);
  const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);

  try {
    const rows = parseInserts(diagramData);

    return await withActor(actor, async (tx) => {
      const employeeIds = [...new Set(rows.map((d) => d.employee_id))];
      const ownedEmployees = await tx.employees.count({ where: { id: { in: employeeIds }, company_id: companyId } });
      if (ownedEmployees !== employeeIds.length) throw new Error('Empleado inválido para la empresa activa');
      await assertDiagramTypesOwned(
        tx,
        rows.map((d) => d.diagram_type),
        companyId
      );

      const result = await tx.employees_diagram.createMany({
        data: rows.map((d) => ({
          employee_id: d.employee_id,
          diagram_type: d.diagram_type,
          day: d.day,
          month: d.month,
          year: d.year,
          comments: d.comments ?? null,
        })),
        skipDuplicates: true,
      });
      return { count: result.count, requested: rows.length };
    });
  } catch (error) {
    logger.error('Error al crear novedades', { data: { error, rows: diagramData.length } });
    throw error;
  }
}

/**
 * Cambia la novedad (y opcionalmente el comentario) de registros existentes de la empresa activa.
 * Agrupa las filas por (novedad, comentario) y hace un `updateMany` por grupo dentro de una única transacción.
 * Devuelve `count` (filas realmente actualizadas) y `requested` (ids distintos enviados): los ids que no
 * existen o son de otra empresa no se actualizan, y la diferencia permite avisarlo.
 */
export async function UpdateDiagramsById(diagramData: DiagramUpdate[]): Promise<{ count: number; requested: number }> {
  if (diagramData.length === 0) return { count: 0, requested: 0 };
  // `employees:update`: el formulario también se usa embebido en el detalle del empleado.
  await assertDiagramAction('update', 'new', 'employees');
  const [companyId, actor] = await Promise.all([getActiveCompanyId(), requireActor()]);

  try {
    if (diagramData.length > DIAGRAM_MUTATION_MAX_ROWS) {
      throw new Error(`Máximo ${DIAGRAM_MUTATION_MAX_ROWS} novedades por modificación`);
    }
    const parsed = z.array(diagramUpdateSchema).safeParse(diagramData);
    if (!parsed.success) throw new Error('Datos de novedades inválidos');

    // Si un mismo id viene repetido, gana la última aparición.
    const byId = new Map(parsed.data.map((row) => [row.diagramId, row]));

    // Grupos con el mismo cambio: `comments` ausente (no se pisa) se distingue de `null` (se borra).
    const groups = new Map<string, { diagram_type: string; comments: string | null | undefined; ids: string[] }>();
    for (const row of byId.values()) {
      const key = JSON.stringify([row.diagram_type, row.comments === undefined ? { keep: true } : row.comments]);
      const group = groups.get(key) ?? { diagram_type: row.diagram_type, comments: row.comments, ids: [] };
      group.ids.push(row.diagramId);
      groups.set(key, group);
    }

    return await withActor(actor, async (tx) => {
      await assertDiagramTypesOwned(
        tx,
        [...groups.values()].map((g) => g.diagram_type),
        companyId
      );

      let count = 0;
      for (const { diagram_type, comments, ids } of groups.values()) {
        const payload: { diagram_type: string; comments?: string | null } = { diagram_type };
        if (comments !== undefined) payload.comments = comments;

        const updated = await tx.employees_diagram.updateMany({
          where: { id: { in: ids }, employees: { company_id: companyId } },
          data: payload,
        });
        count += updated.count;
      }
      return { count, requested: byId.size };
    });
  } catch (error) {
    logger.error('Error al actualizar novedades', { data: { error, rows: diagramData.length } });
    throw error;
  }
}
