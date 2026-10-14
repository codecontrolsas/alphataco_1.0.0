/**
 * Schema Zod, etiquetas y tipos del formulario del informe de pedidos.
 * Módulo sin directiva: lo puede importar tanto el cliente como el servidor.
 */
import { preparte_status } from '@/generated/prisma/enums';
import { z } from 'zod';

export const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendientes',
  cancelado: 'Cancelados',
  reprogramado: 'Reprogramados',
  rechazado: 'Rechazados',
  vencido: 'Vencidos',
  confirmado: 'Confirmados',
};

export const ALL_STATUSES: preparte_status[] = Object.values(preparte_status);

export const reportSchema = z
  .object({
    from: z.string().min(1, 'La fecha desde es requerida'),
    to: z.string().min(1, 'La fecha hasta es requerida'),
    clientIds: z.array(z.string()).default([]),
    statuses: z.array(z.string()).default([]),
    groupBy: z.enum(['line', 'order']),
  })
  .refine((data) => data.to >= data.from, {
    message: 'La fecha hasta no puede ser menor que la fecha desde',
    path: ['to'],
  });

export type ReportFormValues = z.infer<typeof reportSchema>;

