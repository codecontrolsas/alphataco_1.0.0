'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { categoricalColorVar } from '@/features/Dashboard/shared/charts/ChartColorVars';
import { ChartSummary } from '@/features/Dashboard/shared/charts/ChartSummary';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { Eye } from 'lucide-react';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { Cell, Label, Pie, PieChart } from 'recharts';
import type { ServiceDetailByClient, ServicesSummaryResult } from '../actions/types';
import { InfoTip } from '../shared/InfoTip';

const ServicesDetailDialog = dynamic(() => import('./ServicesDetailDialog'), { ssr: false });

const SERVICE_LABELS: Record<string, string> = {
  mensual: 'Mensual',
  adicional: 'Adicional',
  adicional_permanente: 'Adicional Permanente',
  sin_tipo: 'Sin tipo',
};

interface Props {
  /** Hoy en hora argentina, `DD/MM/YYYY`. */
  date: string;
  /** Hoy en hora argentina, `YYYY-MM-DD` (fecha inicial del diálogo de detalle). */
  today: string;
  /** `null` si no se pudo calcular. */
  servicesSummary: ServicesSummaryResult[] | null;
  /** `null` si no se pudo calcular. */
  clientDetail: ServiceDetailByClient[] | null;
}

export function ServicesSection({ date, today, servicesSummary, clientDetail }: Props) {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const typesSummary = React.useMemo(() => {
    const byType = new Map<string, { count: number; percentage: number }>();
    for (const row of servicesSummary ?? []) {
      const count = Number(row.service_count) || 0;
      const percentage = Number(row.percentage) || 0;
      const existing = byType.get(row.type_service);
      if (existing) {
        existing.count += count;
      } else {
        byType.set(row.type_service, { count, percentage });
      }
    }
    return Array.from(byType.entries()).map(([type, data]) => ({
      type,
      label: SERVICE_LABELS[type] ?? type,
      ...data,
    }));
  }, [servicesSummary]);

  const totalServices = typesSummary.reduce((sum, t) => sum + t.count, 0);

  const clientData = React.useMemo(
    () =>
      (clientDetail ?? []).map((c, i) => ({
        name: c.client_name,
        value: c.total_count,
        fill: categoricalColorVar(i),
      })),
    [clientDetail]
  );

  const chartConfig = React.useMemo<ChartConfig>(() => {
    const config: ChartConfig = { value: { label: 'Servicios' } };
    clientData.forEach((d, i) => {
      config[`client${i}`] = { label: d.name, color: d.fill };
    });
    return config;
  }, [clientData]);

  const totalClientServices = clientData.reduce((sum, d) => sum + d.value, 0);
  const clientSummary = `Servicios de hoy por cliente: ${clientData.map((d) => `${d.name} ${d.value}`).join(', ')}. Total ${totalClientServices}.`;

  return (
    <>
      <Card>
        <CardHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Servicios del Día</CardTitle>
              <CardDescription>{date}</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setDialogOpen(true)}>
              <Eye className="h-4 w-4" aria-hidden="true" />
              Ver detalle
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Types table */}
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-1">
                <h4 className="text-sm font-medium">Por tipo de servicio</h4>
                <InfoTip label="Cómo se calcula «Por tipo de servicio»">
                  Servicios de hoy (hora argentina) en estado pendiente o ejecutado, los mismos que cuenta la tarjeta de
                  servicios. Los que no tienen tipo informado figuran como «Sin tipo».
                </InfoTip>
              </div>
              {servicesSummary === null ? (
                <StateBlock
                  variant="error"
                  title="No se pudo cargar el resumen por tipo"
                  description="Recargá la página para volver a intentarlo."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo de Servicio</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typesSummary.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground text-center">
                          Hoy no hay servicios pendientes ni ejecutados con tipo informado
                        </TableCell>
                      </TableRow>
                    ) : (
                      typesSummary.map((t) => (
                        <TableRow key={t.type}>
                          <TableCell>{t.label}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {t.count.toLocaleString('es-AR')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className="tabular-nums">
                              {t.percentage.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>Total con tipo</TableCell>
                      <TableCell className="text-right tabular-nums">{totalServices.toLocaleString('es-AR')}</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Right: Client donut chart with center text */}
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-1">
                <h4 className="text-sm font-medium">Distribución por Cliente</h4>
                <InfoTip label="Cómo se calcula «Distribución por Cliente»">
                  Los mismos servicios de hoy (pendientes o ejecutados) que cuenta la tarjeta, por cliente. Los que no
                  tienen cliente figuran como «Sin cliente».
                </InfoTip>
              </div>
              {clientDetail === null ? (
                <StateBlock
                  variant="error"
                  title="No se pudo cargar la distribución por cliente"
                  description="Recargá la página para volver a intentarlo."
                />
              ) : clientData.length > 0 ? (
                <>
                  <div role="img" aria-label={clientSummary}>
                    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[220px]">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie
                          data={clientData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={50}
                          outerRadius={80}
                          strokeWidth={2}
                        >
                          {clientData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                          <Label
                            content={({ viewBox }) => {
                              if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                                return (
                                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-bold">
                                      {totalClientServices.toLocaleString('es-AR')}
                                    </tspan>
                                    <tspan
                                      x={viewBox.cx}
                                      y={(viewBox.cy ?? 0) + 20}
                                      className="fill-muted-foreground text-xs"
                                    >
                                      Servicios
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
                  <div className="flex flex-wrap gap-3 mt-3 justify-center">
                    {clientData.map((d) => (
                      <div key={d.name} className="flex items-center gap-1.5 text-xs">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: d.fill }}
                          aria-hidden="true"
                        />
                        <span className="truncate max-w-[120px]">{d.name}</span>: {d.value}
                      </div>
                    ))}
                  </div>
                  <ChartSummary
                    className="mt-3"
                    title="Distribución por cliente"
                    summary={clientSummary}
                    columns={[
                      { key: 'name', header: 'Cliente' },
                      { key: 'value', header: 'Servicios', numeric: true },
                    ]}
                    rows={clientData.map((d) => ({ name: d.name, value: d.value }))}
                  />
                </>
              ) : (
                <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm text-center">
                  Hoy no hay servicios con cliente de tipo mensual o adicional
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {dialogOpen && <ServicesDetailDialog open={dialogOpen} onOpenChange={setDialogOpen} initialDate={today} />}
    </>
  );
}
