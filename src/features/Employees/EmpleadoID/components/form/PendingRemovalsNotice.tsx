'use client';

import { useQuery } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';
import { getAllAptitudeOptions, getAllContractorOptions, getAllWorkshopSectorOptions } from '../../actions.server';
import { diffIds } from '../../lib/employee-deltas';
import type { EmployeeFormData } from '../../schemas/employee-schema';

interface PendingRemovalsNoticeProps {
  /** Lo que cargó la ficha desde las pivotes. */
  baseline: {
    allocated_to: readonly (string | undefined)[];
    aptitudes: readonly (string | undefined)[];
    workshop_sector_ids: readonly (string | undefined)[];
  };
}

function RemovalLine({ label, names, count }: { label: string; names: string[]; count: number }) {
  if (count === 0) return null;
  return (
    <li>
      Se {count === 1 ? 'quita' : 'quitan'} {count} {label}
      {names.length > 0 && <span className="font-medium">: {names.join(', ')}</span>}
    </li>
  );
}

/**
 * Antes de guardar, avisa en rojo qué afectaciones, aptitudes o sectores de taller se van a quitar
 * (el servidor recibe solo estas bajas explícitas, nunca "el conjunto final").
 */
export function PendingRemovalsNotice({ baseline }: PendingRemovalsNoticeProps) {
  const allocated = useWatch<EmployeeFormData, 'allocated_to'>({ name: 'allocated_to' });
  const aptitudes = useWatch<EmployeeFormData, 'aptitudes'>({ name: 'aptitudes' });
  const sectors = useWatch<EmployeeFormData, 'workshop_sector_ids'>({ name: 'workshop_sector_ids' });

  const contractorRemoval = diffIds(baseline.allocated_to, allocated).remove;
  const aptitudeRemoval = diffIds(baseline.aptitudes, aptitudes).remove;
  const sectorRemoval = diffIds(baseline.workshop_sector_ids, sectors).remove;
  const hasRemovals = contractorRemoval.length + aptitudeRemoval.length + sectorRemoval.length > 0;

  // Mismas keys que el formulario de datos laborales: comparten caché, no hay pedidos extra.
  const { data: contractors = [] } = useQuery({
    queryKey: ['catalog', 'contractors'],
    queryFn: () => getAllContractorOptions(),
    staleTime: 10 * 60 * 1000,
    enabled: hasRemovals,
  });
  const { data: aptitudeOptions = [] } = useQuery({
    queryKey: ['catalog', 'aptitudes'],
    queryFn: () => getAllAptitudeOptions(),
    staleTime: 10 * 60 * 1000,
    enabled: hasRemovals,
  });
  const { data: sectorOptions = [] } = useQuery({
    queryKey: ['catalog', 'workshop-sectors'],
    queryFn: () => getAllWorkshopSectorOptions(),
    staleTime: 10 * 60 * 1000,
    enabled: hasRemovals,
  });

  if (!hasRemovals) return null;

  const namesOf = (ids: string[], lookup: Map<string, string>) =>
    ids.map((id) => lookup.get(id)).filter((name): name is string => !!name);

  return (
    <div
      role="status"
      className="border-danger bg-danger-subtle text-danger-subtle-foreground rounded-lg border p-3 text-sm"
    >
      <p className="font-medium">Al guardar se van a quitar</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        <RemovalLine
          label="afectación a contratistas"
          count={contractorRemoval.length}
          names={namesOf(contractorRemoval, new Map(contractors.map((c) => [c.id, c.name])))}
        />
        <RemovalLine
          label="aptitud técnica"
          count={aptitudeRemoval.length}
          names={namesOf(aptitudeRemoval, new Map(aptitudeOptions.map((a) => [a.id, a.nombre])))}
        />
        <RemovalLine
          label="sector de taller"
          count={sectorRemoval.length}
          names={namesOf(sectorRemoval, new Map(sectorOptions.map((s) => [s.id, s.name])))}
        />
      </ul>
    </div>
  );
}
