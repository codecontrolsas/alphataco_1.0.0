import { z } from 'zod';
import type { ChangeRowResourcesCommand, ChangeRowStatusCommand } from './types';

/**
 * Forma de los comandos que llegan desde el navegador o la app. Los tipos de TypeScript no se aplican en runtime:
 * sin esto, un arreglo ausente es un 500 y un uuid inválido un error de base de datos.
 * Módulo sin directiva: lo importan la Server Action y, más adelante, la API móvil.
 */

const uuid = z.string().uuid();
const meta = { commandId: uuid, capturedAt: z.string().datetime({ offset: true }).optional() };
const ids = z.array(uuid).default([]);
const employees = z
  .array(
    z.object({
      id: uuid,
      role: z.enum(['chofer_dia', 'chofer_noche', 'ayudante_dia', 'ayudante_noche']).optional(),
    })
  )
  .default([]);
const resourceSet = z.object({ employees, equipment: ids, otherEquipment: ids, customerEquipment: ids });

export const changeRowResourcesSchema = z.object({
  ...meta,
  rowId: uuid,
  baseVersion: z.number().int().positive(),
  add: resourceSet,
  remove: resourceSet,
}) satisfies z.ZodType<ChangeRowResourcesCommand, z.ZodTypeDef, unknown>;

export const changeRowStatusSchema = z.object({
  ...meta,
  rowId: uuid,
  baseVersion: z.number().int().positive(),
  status: z.enum(['ejecutado', 'cancelado', 'pendiente']).optional(),
  cancelReason: z.string().nullable().optional(),
  completeDay: z.boolean().optional(),
  completeNight: z.boolean().optional(),
}) satisfies z.ZodType<ChangeRowStatusCommand, z.ZodTypeDef, unknown>;
