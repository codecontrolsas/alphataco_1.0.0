import { z } from 'zod';

/** Valores del modal "Subir documento" (`SimpleDocument`). Módulo sin directiva: sólo aporta el tipo. */
export const simpleDocumentSchema = z.object({
  applies: z.string(),
  id_document_types: z.string(),
  validity: z.string(),
  period: z.string(),
});

export type SimpleDocumentForm = z.infer<typeof simpleDocumentSchema>;
