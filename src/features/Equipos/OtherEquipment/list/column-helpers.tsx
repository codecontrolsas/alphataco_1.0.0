import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertTriangle, CheckCircle2, Clock, Wrench, XCircle } from 'lucide-react';
import React from 'react';

// ============================================================================
// CONDITION CONFIG
// ============================================================================

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

// ============================================================================
// HELPERS
// ============================================================================

export const getEquipmentHref = (id: string) => `/dashboard/equipment/action?action=view&id=${id}&type=other`;

export function EmptyCell() {
  return <span className="text-muted-foreground">-</span>;
}

/** Texto identificador (N° de certificación, etc.) en monoespaciada. */
export function MonoCell({ value }: { value: string | number | null | undefined }) {
  if (value == null || value === '') return <EmptyCell />;
  return <span className="font-mono tabular-nums">{value}</span>;
}

/** Clientes a los que está afectado el equipo: el primero como badge y el resto en un tooltip. */
export function ContractorsCell({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-muted-foreground">Sin afectar</span>;

  const [first, ...rest] = names;

  if (rest.length === 0) {
    return <Badge variant="default">{first}</Badge>;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex">
            <Badge variant="default" className="cursor-pointer select-none">
              {first} +{rest.length}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent className="bg-black text-white rounded-lg p-2">
          <div className="flex flex-col gap-1">
            {rest.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
