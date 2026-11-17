'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { fitStatusLabel, type FitCell } from '../lib/customer-fit';
import { cellIssues } from '../utils/issue-text';
import { FitStatusBadge } from './FitStatusBadge';

/** Estado del recurso frente a un cliente; si hay algo que resolver, al tocarlo se ve qué. */
export function FitCellDetail({
  cell,
  typeNames,
  label,
}: {
  cell: FitCell;
  typeNames: Record<string, string>;
  label: string;
}) {
  const issues = cellIssues(cell, typeNames);
  if (issues.length === 0) return <FitStatusBadge status={cell.s} />;
  return (
    <Popover>
      <PopoverTrigger
        className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2"
        aria-label={`${label}: ${fitStatusLabel(cell.s)}, ver detalle`}
      >
        <FitStatusBadge status={cell.s} />
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="start">
        <p className="mb-2 font-medium">{label}</p>
        <ul className="space-y-1">
          {issues.map((text) => (
            <li key={text} className="text-muted-foreground">
              {text}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
