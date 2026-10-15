'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { preparte_status } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { zodResolver } from '@hookform/resolvers/zod';
import { saveAs } from 'file-saver';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { getPreparteReportData } from '../actions/report.server';
import type { Cliente } from '../types/entities';

import { ALL_STATUSES, reportSchema, STATUS_LABELS, type ReportFormValues } from './report/report-schema';
import { buildPreparteReportWorkbook, getPreparteReportFileName } from './report/report-workbook';

const logger = new Logger('PreparteReportModal');

interface PreparteReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: Cliente[];
  /** Mientras los clientes se cargan bajo demanda, la lista muestra un aviso en vez de quedar vacía. */
  isLoadingCustomers?: boolean;
}

// ── Componente ──────────────────────────────────────────────────────────

export function PreparteReportModal({ open, onOpenChange, customers, isLoadingCustomers = false }: PreparteReportModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const form = useForm<ReportFormValues>({
    resolver: zodResolver(reportSchema),
    defaultValues: {
      from: '',
      to: '',
      clientIds: [],
      statuses: [],
      groupBy: 'line',
    },
  });

  async function onSubmit(values: ReportFormValues) {
    setIsGenerating(true);
    try {
      const result = await getPreparteReportData({
        from: values.from,
        to: values.to,
        clientIds: values.clientIds.length > 0 ? values.clientIds : undefined,
        statuses: values.statuses.length > 0 ? (values.statuses as preparte_status[]) : undefined,
        groupBy: values.groupBy,
      });

      if (result.summary.total === 0) {
        toast.warning('No se encontraron registros con los filtros seleccionados');
        setIsGenerating(false);
        return;
      }

      // Generar Excel
      const workbook = buildPreparteReportWorkbook(result, values.groupBy);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      saveAs(blob, getPreparteReportFileName(values.from, values.to));

      toast.success('Informe generado exitosamente');
      onOpenChange(false);
    } catch (error) {
      logger.error('Error generando reporte', { data: { error } });
      toast.error('Error al generar el informe');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generar Informe</DialogTitle>
          <DialogDescription>Seleccione los filtros para generar el informe de pedidos</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Fechas */}
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Desde</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="to"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hasta</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Clientes */}
            <FormField
              control={form.control}
              name="clientIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Clientes <span className="text-muted-foreground font-normal">(vacío = todos)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="max-h-32 overflow-y-auto border rounded-md p-2 space-y-1" aria-busy={isLoadingCustomers}>
                      {isLoadingCustomers && <p className="text-muted-foreground text-sm">Cargando clientes...</p>}
                      {customers.map((c) => (
                        <label
                          key={c.id}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={field.value.includes(c.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...field.value, c.id]);
                              } else {
                                field.onChange(field.value.filter((id) => id !== c.id));
                              }
                            }}
                            className="rounded"
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Estados */}
            <FormField
              control={form.control}
              name="statuses"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Estados <span className="text-muted-foreground font-normal">(vacío = todos)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-1 border rounded-md p-2">
                      {ALL_STATUSES.map((s) => (
                        <label
                          key={s}
                          className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={field.value.includes(s)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                field.onChange([...field.value, s]);
                              } else {
                                field.onChange(field.value.filter((v) => v !== s));
                              }
                            }}
                            className="rounded"
                          />
                          {STATUS_LABELS[s] || s}
                        </label>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Agrupar por */}
            <FormField
              control={form.control}
              name="groupBy"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agrupar por</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="line" id="group-line" />
                        <Label htmlFor="group-line">Línea</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="order" id="group-order" />
                        <Label htmlFor="group-order">Pedido</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isGenerating}>
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Generar Informe
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
