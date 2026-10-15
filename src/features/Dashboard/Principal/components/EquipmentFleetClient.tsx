'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { statusColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { Cell, Label, Pie, PieChart } from 'recharts';
import { cancelledNote } from '../lib/cancelled-note';
import { IndicatorStats } from '../shared/IndicatorStats';
import { RadialGauge } from '../shared/RadialGauge';

// bundle-dynamic-imports — dialogs load only when opened
const VehiclesOnRepairDialog = dynamic(() => import('./VehiclesOnRepairDialog'), {
  ssr: false,
});
const AvailableVehiclesDialog = dynamic(() => import('./AvailableVehiclesDialog'), {
  ssr: false,
});

interface Props {
  totalActive: number;
  totalNotAvailable: number;
  totalInUse: number;
  /** Operativos que hoy están solo en servicios cancelados. */
  totalCancelled: number;
  totalFleet: number;
  operativityPercent: number | null;
  usagePercent: number | null;
  // Motor unit metrics (Chasis & Tractor)
  motorActive: number;
  motorInUse: number;
  motorCancelled: number;
  motorNotAvailable: number;
  motorFleet: number;
  motorOperativityPercent: number | null;
  motorUsagePercent: number | null;
  // Tipos "motora" (Chasis & Tractor) — para filtrar el modal de disponibles
  motorTypeIds: string[];
}

interface Slice {
  name: string;
  value: number;
  fill: string;
}

const OPERATIVE_DESCRIPTION =
  'Equipos activos que no están fuera de servicio (no operativo, en reparación o en preparación).';
const OUT_OF_SERVICE_DESCRIPTION =
  'Equipos activos no operativos, en reparación o en preparación. La cifra abre el listado.';
const IN_USE_DESCRIPTION =
  'Equipos operativos cargados en el parte diario de hoy. Los servicios cancelados no cuentan: se indican aparte.';
const AVAILABLE_DESCRIPTION =
  'Operativos − en operaciones. El listado muestra los equipos con condición operativa u operativa condicionada que no están en el parte de hoy (o solo en servicios cancelados).';

/** Dona con total al centro, leyenda con valores y alternativa textual. */
function DonutBlock({
  title,
  slices,
  centerValue,
  centerLabel,
}: {
  title: string;
  slices: Slice[];
  centerValue: number;
  centerLabel: string;
}) {
  const config = React.useMemo<ChartConfig>(
    () => Object.fromEntries(slices.map((s, i) => [`slice${i}`, { label: s.name, color: s.fill }])),
    [slices]
  );
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const summary = `${title}: ${slices.map((s) => `${s.name} ${s.value}`).join(', ')} (${centerLabel.toLowerCase()} ${centerValue}).`;

  return (
    <div className="w-full space-y-2">
      <div role="img" aria-label={summary}>
        <ChartContainer config={config} className="mx-auto aspect-square w-full max-h-[160px]">
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent />} />
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={38} outerRadius={62} strokeWidth={2}>
              {slices.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-xl font-bold">
                          {centerValue}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 16} className="fill-muted-foreground text-[10px]">
                          {centerLabel}
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </div>
      <div className="flex gap-3 justify-center flex-wrap">
        {slices.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} aria-hidden="true" />
            {d.name}: {d.value}
          </div>
        ))}
      </div>
      <ChartSummary
        title={title}
        summary={summary}
        columns={[
          { key: 'name', header: 'Categoría' },
          { key: 'value', header: 'Equipos', numeric: true },
          { key: 'share', header: '%', numeric: true },
        ]}
        rows={slices.map((s) => ({
          name: s.name,
          value: s.value,
          share: total > 0 ? `${Math.round((s.value / total) * 100)} %` : '—',
        }))}
      />
    </div>
  );
}

export const EquipmentFleetClient = React.memo(function EquipmentFleetClient({
  totalActive,
  totalNotAvailable,
  totalInUse,
  totalCancelled,
  totalFleet,
  operativityPercent,
  usagePercent,
  motorActive,
  motorInUse,
  motorCancelled,
  motorNotAvailable,
  motorFleet,
  motorOperativityPercent,
  motorUsagePercent,
  motorTypeIds,
}: Props) {
  const [repairDialogOpen, setRepairDialogOpen] = React.useState(false);
  // Qué variante del modal de disponibles está abierta: 'all' (toda la flota) o 'motor' (Chasis & Tractor)
  const [availableDialog, setAvailableDialog] = React.useState<'all' | 'motor' | null>(null);

  const operativityData = React.useMemo<Slice[]>(
    () => [
      { name: 'Operativos', value: totalActive, fill: statusColorVar('operational') },
      { name: 'Fuera de servicio', value: totalNotAvailable, fill: statusColorVar('unavailable') },
    ],
    [totalActive, totalNotAvailable]
  );

  const usageData = React.useMemo<Slice[]>(
    () => [
      { name: 'En operaciones', value: totalInUse, fill: statusColorVar('inUse') },
      { name: 'Disponible / Sin asignar', value: totalActive - totalInUse, fill: statusColorVar('available') },
    ],
    [totalInUse, totalActive]
  );

  const motorOperativityData = React.useMemo<Slice[]>(
    () => [
      { name: 'Operativos', value: motorActive, fill: statusColorVar('operational') },
      { name: 'Fuera de servicio', value: motorNotAvailable, fill: statusColorVar('unavailable') },
    ],
    [motorActive, motorNotAvailable]
  );

  const motorUsageData = React.useMemo<Slice[]>(
    () => [
      { name: 'En operaciones', value: motorInUse, fill: statusColorVar('inUse') },
      { name: 'Disponible / Sin asignar', value: motorActive - motorInUse, fill: statusColorVar('available') },
    ],
    [motorInUse, motorCancelled, motorActive]
  );

  const motorOperativityStats = React.useMemo(
    () => [
      { label: 'Operativos', value: motorActive, description: OPERATIVE_DESCRIPTION },
      {
        label: 'Fuera de servicio',
        value: motorNotAvailable,
        description: OUT_OF_SERVICE_DESCRIPTION,
      },
      { label: 'Total flota', value: motorFleet, description: 'Operativos + fuera de servicio (equipos activos).' },
    ],
    [motorActive, motorNotAvailable, motorFleet]
  );

  const motorUsageStats = React.useMemo(
    () => [
      {
        label: 'En operaciones',
        value: motorInUse,
        note: cancelledNote(motorCancelled),
        description: IN_USE_DESCRIPTION,
      },
      {
        label: 'Disponible / Sin asignar',
        value: motorActive - motorInUse,
        onClick: motorActive - motorInUse > 0 ? () => setAvailableDialog('motor') : undefined,
        description: AVAILABLE_DESCRIPTION,
      },
      { label: 'Operativos', value: motorActive, description: OPERATIVE_DESCRIPTION },
    ],
    [motorInUse, motorActive]
  );

  const operativityStats = React.useMemo(
    () => [
      { label: 'Operativos', value: totalActive, description: OPERATIVE_DESCRIPTION },
      {
        label: 'Fuera de servicio',
        value: totalNotAvailable,
        onClick: totalNotAvailable > 0 ? () => setRepairDialogOpen(true) : undefined,
        description: OUT_OF_SERVICE_DESCRIPTION,
      },
      { label: 'Total flota', value: totalFleet, description: 'Operativos + fuera de servicio (equipos activos).' },
    ],
    [totalActive, totalNotAvailable, totalFleet]
  );

  const usageStats = React.useMemo(
    () => [
      {
        label: 'En operaciones',
        value: totalInUse,
        note: cancelledNote(totalCancelled),
        description: IN_USE_DESCRIPTION,
      },
      {
        label: 'Disponible / Sin asignar',
        value: totalActive - totalInUse,
        onClick: totalActive - totalInUse > 0 ? () => setAvailableDialog('all') : undefined,
        description: AVAILABLE_DESCRIPTION,
      },
      { label: 'Operativos', value: totalActive, description: OPERATIVE_DESCRIPTION },
    ],
    [totalInUse, totalCancelled, totalActive]
  );

  return (
    <>
      <Card>
        <CardHeader className="border-b px-6 py-4">
          <div>
            <CardTitle className="text-base">Equipos — Estado de Flota</CardTitle>
            <CardDescription>Operatividad y uso de la flota de vehículos activos</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {/* Unidades Motoras (Chasis & Tractor) — primera fila */}
          {motorFleet > 0 && (
            <div className="mb-6 pb-4 border-b">
              <h4 className="text-sm font-medium mb-3">
                Solo Unidades Motoras <span className="text-muted-foreground font-normal">(Chasis & Tractor)</span>
              </h4>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {/* Motor: Operatividad */}
                <div className="flex flex-col items-center gap-2">
                  <DonutBlock
                    title="Operatividad de unidades motoras"
                    slices={motorOperativityData}
                    centerValue={motorFleet}
                    centerLabel="Total"
                  />
                  <IndicatorStats items={motorOperativityStats} className="w-full mt-1" />
                  <RadialGauge
                    value={motorOperativityPercent}
                    label="Operatividad"
                    accentColor={statusColorVar('operational')}
                  />
                </div>

                {/* Motor: Uso */}
                <div className="flex flex-col items-center gap-2">
                  <DonutBlock
                    title="Uso de unidades motoras operativas"
                    slices={motorUsageData}
                    centerValue={motorActive}
                    centerLabel="Operativos"
                  />
                  <IndicatorStats items={motorUsageStats} className="w-full mt-1" />
                  <RadialGauge value={motorUsagePercent} label="Uso" accentColor={statusColorVar('inUse')} />
                </div>
              </div>
            </div>
          )}

          {/* Operatividad y Uso — segunda fila */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Operatividad */}
            <div className="flex flex-col items-center gap-2">
              <h4 className="text-sm font-medium self-start">Operatividad — Todos los Equipos</h4>
              <DonutBlock
                title="Operatividad de todos los equipos"
                slices={operativityData}
                centerValue={totalFleet}
                centerLabel="Flota"
              />
              <IndicatorStats items={operativityStats} className="w-full mt-1" />
              <RadialGauge
                value={operativityPercent}
                label="Operatividad"
                accentColor={statusColorVar('operational')}
              />
            </div>

            {/* Uso */}
            <div className="flex flex-col items-center gap-2">
              <h4 className="text-sm font-medium self-start">Uso — Todos los Equipos</h4>
              <DonutBlock
                title="Uso de todos los equipos operativos"
                slices={usageData}
                centerValue={totalActive}
                centerLabel="Operativos"
              />
              <IndicatorStats items={usageStats} className="w-full mt-1" />
              <RadialGauge value={usagePercent} label="Uso" accentColor={statusColorVar('inUse')} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 mt-4 pt-3 border-t md:grid-cols-2 md:gap-6">
            <p className="text-[11px] text-muted-foreground text-center">
              <span className="font-semibold">Operatividad</span> = Equipos operativos / Total de flota × 100
            </p>
            <p className="text-[11px] text-muted-foreground text-center">
              <span className="font-semibold">Uso</span> = Equipos en operaciones / Equipos operativos × 100
            </p>
          </div>
        </CardContent>
      </Card>

      {repairDialogOpen && (
        <VehiclesOnRepairDialog open={repairDialogOpen} onOpenChange={setRepairDialogOpen} count={totalNotAvailable} />
      )}

      {availableDialog === 'motor' && (
        <AvailableVehiclesDialog
          open
          onOpenChange={(open) => !open && setAvailableDialog(null)}
          count={motorActive - motorInUse}
          typeIds={motorTypeIds}
        />
      )}

      {availableDialog === 'all' && (
        <AvailableVehiclesDialog
          open
          onOpenChange={(open) => !open && setAvailableDialog(null)}
          count={totalActive - totalInUse}
        />
      )}
    </>
  );
});
