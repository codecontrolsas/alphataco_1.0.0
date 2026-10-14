'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronDown, Palette } from 'lucide-react';
import {
  DEVIATION_SWATCH_CLASSES,
  EMPLOYEE_DEVIATION_LEGEND,
  EQUIPMENT_DEVIATION_LEGEND,
} from '../columns/deviation-styles';
import { ROW_HIGHLIGHT_LEGEND } from '../lib/row-highlight';

function Swatch({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('size-3.5 shrink-0 rounded-sm border', className)} />;
}

function LegendGroup({ title, items }: { title: string; items: { swatch: string; label: string }[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <Swatch className={item.swatch} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Qué significa cada color del detalle: resaltado de filas y desvíos de empleados y equipos. */
export function DailyReportColorLegend() {
  return (
    <Collapsible className="bg-card rounded-xl border">
      <CollapsibleTrigger className="hover:bg-muted/40 group flex w-full items-center gap-2 rounded-xl px-5 py-3 text-left text-sm font-medium">
        <Palette className="text-muted-foreground size-4" aria-hidden="true" />
        Referencias de colores
        <ChevronDown
          className="text-muted-foreground ml-auto size-4 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-6 border-t px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          <LegendGroup
            title="Filas"
            items={ROW_HIGHLIGHT_LEGEND.map((item) => ({ swatch: item.swatch, label: item.label }))}
          />
          <LegendGroup
            title="Empleados"
            items={EMPLOYEE_DEVIATION_LEGEND.map((item) => ({
              swatch: DEVIATION_SWATCH_CLASSES[item.tone],
              label: item.label,
            }))}
          />
          <LegendGroup
            title="Equipos"
            items={EQUIPMENT_DEVIATION_LEGEND.map((item) => ({
              swatch: DEVIATION_SWATCH_CLASSES[item.tone],
              label: item.label,
            }))}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
