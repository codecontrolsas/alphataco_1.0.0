import type { BadgeProps } from '@/components/ui/badge';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, AlertTriangle, BadgeCheck, CheckCircle2, Clock, Wrench, XCircle } from 'lucide-react';

/**
 * Iconos y colores de los estados que muestran las tablas de la ficha del cliente. El filtro y la celda
 * leen de acá, así que el icono de una opción es siempre el de su badge.
 */

type BadgeVariant = NonNullable<BadgeProps['variant']>;

/** `status_type` (estado documental de empleados y equipos). */
export const documentStatusIcons: Record<string, LucideIcon> = {
  Avalado: BadgeCheck,
  No_avalado: XCircle,
  Incompleto: AlertCircle,
  Completo: CheckCircle2,
  Completo_con_doc_vencida: Clock,
};

/** `condition_enum` (condición operativa de un equipo). */
export const conditionIcons: Record<string, LucideIcon> = {
  operativo: CheckCircle2,
  no_operativo: XCircle,
  en_reparacion: Wrench,
  operativo_condicionado: AlertTriangle,
  en_preparacion: Clock,
};

export const conditionVariants: Record<string, BadgeVariant> = {
  operativo: 'success',
  no_operativo: 'destructive',
  en_reparacion: 'yellow',
  operativo_condicionado: 'warning',
  en_preparacion: 'info',
};
