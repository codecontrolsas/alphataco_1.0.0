import { z } from 'zod';

export const dailyReportRowSchema = z
  .object({
    customer: z.string().min(1, 'Debe seleccionar un cliente'),
    services: z.string().min(1, 'Debe seleccionar un servicio'),
    item: z.string().min(1, 'Debe seleccionar un ítem'),
    completed_day: z.boolean().nullable().optional(),
    completed_night: z.boolean().nullable().optional(),
    employees: z.array(z.string()).default([]).optional(),
    equipment: z.array(z.string()).default([]).optional(),
    other_equipment: z.array(z.string()).default([]).optional(),
    equipos_cliente: z.array(z.string()).max(2, 'Solo se pueden seleccionar 2 equipos cliente').default([]).optional(),
    // Turno seleccionado para la jornada 12h (excluyente). Se persiste para
    // recordar el turno aunque la fila no tenga personal asignado.
    shift_12h: z.enum(['dia', 'noche']).optional(),
    // Campos para empleados con roles (jornadas 12/24 hrs)
    chofer_dia: z.string().optional(),
    chofer_noche: z.string().optional(),
    // Los ayudantes (ATG) admiten múltiples empleados por turno
    ayudante_dia: z.array(z.string()).default([]).optional(),
    ayudante_noche: z.array(z.string()).default([]).optional(),
    type_service: z
      .enum(['mensual', 'adicional', 'adicional_permanente'], {
        required_error: 'Debe seleccionar un tipo de servicio',
        invalid_type_error: 'Debe seleccionar un tipo de servicio',
      })
      .optional(),
    working_day: z.string().min(1, 'Debe seleccionar un tipo de jornada'),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    status: z.string().default('pendiente'),
    description: z.string().optional(),
    document_path: z.string().optional(),
    sector_service_id: z.string().optional(),
    areas_service_id: z.string().optional(),
    cancel_reason: z.string().optional(),
    reprogram_date: z.date().optional(),
    reasigment_reason: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.working_day === 'por horario') {
        return data.start_time && data.end_time;
      }
      return true;
    },
    {
      message: 'Debe ingresar horario de inicio y fin si la jornada es "por horario"',
      path: ['start_time'],
    }
  )
  .refine(
    (data) => {
      if (data.status === 'cancelado') {
        return data.cancel_reason && data.cancel_reason.trim() !== '';
      }
      return true;
    },
    {
      message: 'El motivo de cancelación es obligatorio cuando el estado es "Cancelado"',
      path: ['cancel_reason'],
    }
  )
  .refine(
    (data) => {
      if (data.status === 'reprogramado') {
        return data.reprogram_date;
      }
      return true;
    },
    {
      message: 'La fecha de reprogramación es obligatoria cuando el estado es "Reprogramado"',
      path: ['reprogram_date'],
    }
  )
  .refine(
    (data) => {
      if (data.status === 'ejecutado') {
        return (data?.employees?.length || 0) > 0 || (data?.equipment?.length || 0) > 0;
      }
      return true;
    },
    {
      message: 'Debe seleccionar al menos un empleado o equipo cuando el estado es "Ejecutado"',
      path: ['employees'],
    }
  );

export type DailyReportRowFormValues = z.infer<typeof dailyReportRowSchema>;
