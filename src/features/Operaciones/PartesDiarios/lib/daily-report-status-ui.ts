import {
  Ban,
  CheckCircle2,
  CircleAlert,
  CircleDot,
  Clock,
  FileCheck2,
  Lock,
  RefreshCw,
  UserX,
  type LucideIcon,
} from 'lucide-react';

/**
 * Íconos de los estados del parte y de sus filas. El label y el color viven en `@/shared/utils/mappers`
 * (`dailyReportStatus*` / `dailyReportRowStatus*`); acá solo el ícono, para que el badge, el filtro
 * y el encabezado del parte muestren el mismo.
 */
export const DAILY_REPORT_STATUS_ICONS: Record<string, LucideIcon> = {
  abierto: CircleDot,
  cerrado: Lock,
  cerrado_completo: CheckCircle2,
  cerrado_incompleto: CircleAlert,
};

export const DAILY_REPORT_ROW_STATUS_ICONS: Record<string, LucideIcon> = {
  pendiente: Clock,
  sin_recursos_asignados: UserX,
  ejecutado: CheckCircle2,
  reprogramado: RefreshCw,
  cancelado: Ban,
  en_certificacion: FileCheck2,
};
