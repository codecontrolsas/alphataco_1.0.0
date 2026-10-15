import type { BadgeProps } from '@/components/ui/badge';
import {
  tireServiceOrderStatusBadgesFromUi,
  tireServiceOrderStatusLabelsFromUi,
  tireStatusBadgesFromUi,
  tireStatusLabelsFromUi,
} from './tire-status-presentation';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

// TireStatus
export const tireStatusLabels: Record<string, string> = tireStatusLabelsFromUi;

export const tireStatusBadges: Record<string, BadgeVariant> = tireStatusBadgesFromUi;

// TireRetreadLevel
export const tireRetreadLabels: Record<string, string> = {
  FIRST: '1° Precurado',
  SECOND: '2° Precurado',
  THIRD: '3° Precurado',
};

// TireTreadType
export const tireTreadTypeLabels: Record<string, string> = {
  SMOOTH: 'Liso',
  MIXED: 'Mixto',
  BLOCK: 'Taco',
};

// TireServiceAction
export const tireServiceActionLabels: Record<string, string> = {
  REPLACE: 'Reemplazo',
  REPAIR: 'Reparación',
  CALIBRATE: 'Calibración',
  MISSING_REPORT: 'Extravío',
};

export const tireServiceActionBadges: Record<string, BadgeVariant> = {
  REPLACE: 'default',
  REPAIR: 'yellow',
  CALIBRATE: 'outline',
  MISSING_REPORT: 'destructive',
};

// TireOldDestination
export const tireOldDestinationLabels: Record<string, string> = {
  AVAILABLE: 'Disponible',
  DISCARD: 'Descarte',
  REPAIR: 'Reparación',
};

// TireServiceOrderStatus
export const tireServiceOrderStatusLabels: Record<string, string> = tireServiceOrderStatusLabelsFromUi;

export const tireServiceOrderStatusBadges: Record<string, BadgeVariant> = tireServiceOrderStatusBadgesFromUi;

// TirePositionSide
export const tirePositionSideLabels: Record<string, string> = {
  LEFT: 'Izquierda',
  RIGHT: 'Derecha',
  SPARE: 'Auxilio',
};
