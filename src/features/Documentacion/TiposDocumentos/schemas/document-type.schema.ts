import { document_applies } from '@/generated/prisma/enums';
import { z } from 'zod';
import { parseDocumentConditions } from '../../shared/compliance/applicability';
import { EQUIPMENT_TYPE_VALUES } from '../config/equipmentTypes';

/**
 * Validación server-side de los datos de un tipo de documento. Módulo SIN directiva: lo usan las
 * server actions (el schema del formulario vive en el modal, que es 'use client', y no se puede importar acá).
 */

const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CONDITIONS = 50;

const nameSchema = z
  .string({ required_error: 'El nombre es requerido', invalid_type_error: 'El nombre no es válido' })
  .trim()
  .min(1, 'El nombre es requerido')
  .max(MAX_NAME_LENGTH, `El nombre no puede superar los ${MAX_NAME_LENGTH} caracteres`);

const appliesSchema = z.nativeEnum(document_applies, {
  errorMap: () => ({ message: 'El tipo de recurso no es válido' }),
});

const equipmentTypeSchema = z
  .enum(EQUIPMENT_TYPE_VALUES, { errorMap: () => ({ message: 'El tipo de equipo no es válido' }) })
  .nullable();

const descriptionSchema = z
  .string()
  .max(MAX_DESCRIPTION_LENGTH, `La descripción no puede superar los ${MAX_DESCRIPTION_LENGTH} caracteres`);

/**
 * Cada condición debe ser un objeto que el motor de cumplimiento sepa leer (`ids` + `filter_column`):
 * una condición ilegible se ignoraría en silencio y el tipo aplicaría a todos.
 */
const conditionsSchema = z
  .array(z.unknown())
  .max(MAX_CONDITIONS, 'Demasiadas condiciones')
  .superRefine((conditions, ctx) => {
    conditions.forEach((condition, index) => {
      if (parseDocumentConditions([condition]).length !== 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `La condición ${index + 1} no es válida`, path: [index] });
      }
    });
  });

const baseShape = {
  mandatory: z.boolean(),
  explired: z.boolean(),
  special: z.boolean(),
  multiresource: z.boolean(),
  has_policy_number: z.boolean().optional(),
  is_it_montlhy: z.boolean().optional(),
  private: z.boolean().optional(),
  down_document: z.boolean().optional(),
  /** Ticket 505: habilita el tipo en el checklist de documentos de un candidato */
  available_for_pre_file: z.boolean().optional(),
};

export const createDocumentTypeSchema = z
  .object({
    ...baseShape,
    name: nameSchema,
    applies: appliesSchema,
    equipment_type: equipmentTypeSchema.optional(),
    description: descriptionSchema.optional(),
    conditions: conditionsSchema.optional(),
  })
  .strict();

export const updateDocumentTypeSchema = z
  .object({
    mandatory: baseShape.mandatory.optional(),
    explired: baseShape.explired.optional(),
    special: baseShape.special.optional(),
    multiresource: baseShape.multiresource.optional(),
    has_policy_number: baseShape.has_policy_number,
    is_it_montlhy: baseShape.is_it_montlhy,
    private: baseShape.private,
    down_document: baseShape.down_document,
    available_for_pre_file: baseShape.available_for_pre_file,
    name: nameSchema.optional(),
    applies: appliesSchema.optional(),
    equipment_type: equipmentTypeSchema.optional(),
    description: descriptionSchema.nullable().optional(),
    conditions: conditionsSchema.optional(),
  })
  .strict();

export type CreateDocumentTypeData = z.infer<typeof createDocumentTypeSchema>;
export type UpdateDocumentTypeData = z.infer<typeof updateDocumentTypeSchema>;

/** Mensaje en español con el primer error de validación. */
export function firstSchemaError(error: z.ZodError): string {
  const issue = error.issues[0];
  return issue?.message ?? 'Datos del tipo de documento inválidos';
}
