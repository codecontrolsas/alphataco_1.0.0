'use client';

import { CalendarIcon, X } from 'lucide-react';
import moment from 'moment';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { useDataTablePending } from './DataTablePendingContext';

interface DataTableDateRangeFilterProps {
  columnId: string;
  title: string;
  /** Namespace para prefijar los params de URL cuando hay múltiples DataTables en la misma página */
  paramNamespace?: string;
}

export function DataTableDateRangeFilter({ columnId, title, paramNamespace }: DataTableDateRangeFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { startTransition, isClientSide, notifyUrlChange, urlVersion } = useDataTablePending();

  // Prefijo de namespace para aislar parámetros entre DataTables en la misma página
  const prefix = paramNamespace ? `${paramNamespace}__` : '';
  const fromKey = `${prefix}${columnId}_from`;
  const toKey = `${prefix}${columnId}_to`;
  const pageKey = paramNamespace ? `${paramNamespace}__page` : 'page';

  // Leer valores actuales: desde browser URL en client-side mode
  const { fromValue, toValue } = React.useMemo(() => {
    if (isClientSide && typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return {
        fromValue: urlParams.get(fromKey),
        toValue: urlParams.get(toKey),
      };
    }
    return {
      fromValue: searchParams.get(fromKey),
      toValue: searchParams.get(toKey),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- urlVersion triggers re-read in client-side mode
  }, [isClientSide, searchParams, fromKey, toKey, urlVersion]);

  const fromDate = fromValue ? new Date(fromValue) : undefined;
  const toDate = toValue ? new Date(toValue) : undefined;

  const hasValue = !!(fromValue || toValue);

  /** Aplica `mutate` a los parámetros de la URL, vuelve a la página 1 y actualiza la ruta. */
  const updateParams = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(isClientSide ? window.location.search : searchParams.toString());
    mutate(params);
    params.set(pageKey, '1');

    if (isClientSide) {
      window.history.replaceState(window.history.state, '', `${pathname}?${params.toString()}`);
      notifyUrlChange();
    } else {
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`);
      });
    }
  };

  const updateParam = (key: string, value: string | null) => {
    updateParams((params) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
  };

  const clearFilter = () => {
    updateParams((params) => {
      params.delete(fromKey);
      params.delete(toKey);
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-9 border-dashed gap-1.5', hasValue && 'border-solid')}>
          <CalendarIcon className="h-3.5 w-3.5" />
          {title}
          {hasValue && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                {fromValue && toValue
                  ? `${moment(fromValue).format('DD/MM')} - ${moment(toValue).format('DD/MM')}`
                  : fromValue
                    ? `Desde ${moment(fromValue).format('DD/MM')}`
                    : `Hasta ${moment(toValue).format('DD/MM')}`}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3 space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Desde</p>
            <Calendar
              mode="single"
              selected={fromDate}
              onSelect={(date) => updateParam(fromKey, date ? moment(date).format('YYYY-MM-DD') : null)}
              initialFocus
            />
          </div>
          <Separator />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Hasta</p>
            <Calendar
              mode="single"
              selected={toDate}
              onSelect={(date) => updateParam(toKey, date ? moment(date).format('YYYY-MM-DD') : null)}
            />
          </div>
          {hasValue && (
            <Button variant="ghost" size="sm" className="w-full h-7" onClick={clearFilter}>
              <X className="h-3.5 w-3.5 mr-1" />
              Limpiar fechas
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
