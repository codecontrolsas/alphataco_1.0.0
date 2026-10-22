'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ActionResult } from '@/features/Empresa/Clientes/lib/action-result';
import type { Logger } from '@/lib/logger';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { useMutation } from '@tanstack/react-query';
import moment from 'moment';
import 'moment/locale/es';
import { useState } from 'react';
import { toast } from 'sonner';

/** `2026-10` -> `Octubre 2026`. */
export const periodLabel = (period: string) => {
  const text = moment(period, 'YYYY-MM').locale('es').format('MMMM YYYY');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

/** `2026-10-31` -> `31/10/2026`. */
export const dayLabel = (value: string) => moment(value, 'YYYY-MM-DD').format('DD/MM/YYYY');

/** Período elegido de un reporte (Libro IVA, Retenciones): se refleja en `?period=` sin recargar la ruta. */
export function usePeriodParam(initialPeriod: string) {
  const [period, setPeriod] = useState(initialPeriod);
  const changePeriod = (next: string) => {
    setPeriod(next);
    const url = new URL(window.location.href);
    url.searchParams.set('period', next);
    window.history.replaceState(null, '', url.toString());
  };
  return { period, changePeriod };
}

/** Selector de período de un reporte. */
export function PeriodSelect({
  value,
  periods,
  onChange,
}: {
  value: string;
  periods: string[];
  onChange: (period: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44" aria-label="Período">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((p) => (
          <SelectItem key={p} value={p}>
            {periodLabel(p)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Descarga de un ZIP que genera el servidor (llega en base64): archivos para declarar. */
export function useZipDownload(
  generate: () => Promise<ActionResult<{ fileName: string; base64: string }>>,
  logger: Logger,
  logMessage: string
) {
  return useMutation({
    mutationFn: async () => unwrapAction(await generate()),
    onSuccess: ({ fileName, base64 }) => {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => {
      logger.error(logMessage, { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudieron generar los archivos');
    },
  });
}
