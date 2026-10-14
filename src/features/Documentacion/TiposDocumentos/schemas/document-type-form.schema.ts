import { document_applies } from '@/generated/prisma/enums';
import { z } from 'zod';

/** Schema del formulario del modal de tipos de documento (validación de cliente; el servidor valida con `document-type.schema.ts`). */
export const documentTypeFormSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  applies: z.nativeEnum(document_applies),
  equipment_type: z.string().optional().nullable(),
  mandatory: z.boolean(),
  explired: z.boolean(),
  is_it_montlhy: z.boolean(),
  private: z.boolean(),
  down_document: z.boolean(),
  // Ticket 505: habilita el tipo en el checklist de documentos de un candidato
  available_for_pre_file: z.boolean(),
  multiresource: z.boolean(),
  has_policy_number: z.boolean(),
  description: z.string().optional(),
});

export type DocumentTypeFormValues = z.infer<typeof documentTypeFormSchema>;
