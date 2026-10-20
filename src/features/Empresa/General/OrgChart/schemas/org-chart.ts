import { z } from 'zod';

// Sin directiva: lo importan la server action y el formulario del panel.

const uuid = z.string().uuid('Valor inválido');

export const orgChartCargoSchema = z.object({
  sector_id: uuid,
  position_id: z.string().uuid('Elegí el puesto'),
  reports_to_id: uuid.nullable(),
  employee_id: uuid.nullable(),
});

export const orgChartCargoUpdateSchema = orgChartCargoSchema.extend({ id: uuid });

export type OrgChartCargoInput = z.infer<typeof orgChartCargoSchema>;
export type OrgChartCargoUpdateInput = z.infer<typeof orgChartCargoUpdateSchema>;
