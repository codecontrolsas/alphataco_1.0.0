'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';

function CheckboxListSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-3/4" />
    </div>
  );
}

interface CheckOption {
  id: string;
  label: string;
}

function CheckboxList({
  options,
  selectedIds,
  onToggle,
}: {
  options: CheckOption[];
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {options.map((option) => (
        <div key={option.id} className="flex items-center space-x-2">
          <Checkbox
            id={option.id}
            checked={selectedIds.includes(option.id)}
            onCheckedChange={(checked) => onToggle(option.id, checked === true)}
          />
          <label
            htmlFor={option.id}
            className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {option.label}
          </label>
        </div>
      ))}
    </div>
  );
}

interface ContractorsCardProps {
  contractors: { id: string; name: string }[];
  isLoading: boolean;
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}

/** Contratistas a los que está afectado el empleado. */
export function ContractorsCard({ contractors, isLoading, selectedIds, onToggle }: ContractorsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Asignado a contratistas</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <CheckboxListSkeleton />
        ) : contractors.length > 0 ? (
          <CheckboxList
            options={contractors.map((c) => ({ id: c.id, label: c.name }))}
            selectedIds={selectedIds}
            onToggle={onToggle}
          />
        ) : (
          <p className="text-muted-foreground text-sm">No hay contratistas disponibles</p>
        )}
      </CardContent>
    </Card>
  );
}

interface AptitudesCardProps {
  /** Aptitudes activas que aplican al puesto elegido. */
  aptitudes: { id: string; nombre: string }[];
  isLoading: boolean;
  hasPosition: boolean;
  selectedIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}

/** Aptitudes técnicas: dependen del puesto elegido. */
export function AptitudesCard({ aptitudes, isLoading, hasPosition, selectedIds, onToggle }: AptitudesCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Aptitudes técnicas</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <CheckboxListSkeleton />
        ) : !hasPosition ? (
          <p className="text-muted-foreground text-sm">
            Primero seleccione un puesto para ver las aptitudes disponibles
          </p>
        ) : aptitudes.length > 0 ? (
          <CheckboxList
            options={aptitudes.map((a) => ({ id: a.id, label: a.nombre }))}
            selectedIds={selectedIds}
            onToggle={onToggle}
          />
        ) : (
          <p className="text-muted-foreground text-sm">No hay aptitudes disponibles para el puesto seleccionado</p>
        )}
      </CardContent>
    </Card>
  );
}
