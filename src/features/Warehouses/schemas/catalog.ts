import { z } from 'zod';
import { MATERIAL_TRACKING_TYPES } from './stock-movement';

/**
 * Schemas de los catalogos de Almacenes (depositos, materiales, categorias, unidades).
 * Modulo sin directiva: los usan los formularios y las server actions.
 */

const optionalText = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);
const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} es requerido`).max(max, `Máximo ${max} caracteres`);

export const warehouseFormSchema = z.object({
  code: requiredText('El código', 20),
  name: requiredText('El nombre', 120),
  address: optionalText(200),
  managerEmployeeId: z.string(),
});
export type WarehouseFormValues = z.infer<typeof warehouseFormSchema>;

export const materialFormSchema = z.object({
  code: requiredText('El código', 40),
  name: requiredText('El nombre', 200),
  description: optionalText(1000),
  categoryId: z.string(),
  unitId: z.string().uuid({ message: 'Elegí la unidad de medida' }),
  trackingType: z.enum(MATERIAL_TRACKING_TYPES),
  requiresApproval: z.boolean(),
  minStock: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{1,11}([.,]\d{1,4})?$/.test(v), 'Número inválido (hasta 4 decimales)'),
});
export type MaterialFormValues = z.infer<typeof materialFormSchema>;

export const materialCategoryFormSchema = z.object({
  name: requiredText('El nombre', 120),
});
export type MaterialCategoryFormValues = z.infer<typeof materialCategoryFormSchema>;

export const measurementUnitFormSchema = z.object({
  name: requiredText('El nombre', 60),
  abbreviation: requiredText('La abreviatura', 10),
});
export type MeasurementUnitFormValues = z.infer<typeof measurementUnitFormSchema>;
