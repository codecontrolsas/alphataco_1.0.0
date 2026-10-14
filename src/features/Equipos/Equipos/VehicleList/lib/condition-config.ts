import { AlertTriangle, CheckCircle2, Clock, Wrench, XCircle } from 'lucide-react';
import type React from 'react';

// ============================================================================
// CONDITION CONFIG
// ============================================================================
// Íconos y variantes de badge por condición del equipo. Los usan las columnas, los filtros y los listados de
// dados de baja y de equipamiento; viven acá y `columns.tsx` los re-exporta para no romper esos imports.

type ConditionIconMap = Record<string, React.ComponentType<{ className?: string }>>;

export const conditionIcons: ConditionIconMap = {
  operativo: CheckCircle2,
  no_operativo: XCircle,
  en_reparacion: Wrench,
  operativo_condicionado: AlertTriangle,
  en_preparacion: Clock,
};

export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'yellow' | 'info';

export const conditionVariants: Record<string, BadgeVariant> = {
  operativo: 'success',
  no_operativo: 'destructive',
  en_reparacion: 'yellow',
  operativo_condicionado: 'info',
  en_preparacion: 'secondary',
};
