'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { getCheckOperationFormData } from '../../actions/check-reads.server';
import type { CheckOperationFormData } from '../../lib/check-types';
import { TREASURY_QUERY_KEYS } from '../../lib/query-keys';

/**
 * Diálogo de una operación sobre cheques de la cartera (depósito, descuento): carga los cheques
 * elegidos (solo los que siguen EN CARTERA) y las cuentas, y recién entonces monta el formulario,
 * que arma sus valores iniciales con esos datos.
 */
export function CheckOperationShell({
  open,
  onOpenChange,
  checkIds,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checkIds: string[];
  title: string;
  description: string;
  children: (data: CheckOperationFormData) => ReactNode;
}) {
  const { data, isLoading } = useQuery({
    queryKey: [...TREASURY_QUERY_KEYS.checkOperationForm, [...checkIds].sort().join(',')],
    queryFn: () => getCheckOperationFormData(checkIds),
    enabled: open,
    staleTime: 0,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : data.checks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Los cheques elegidos ya no están en cartera.</p>
        ) : (
          children(data)
        )}
      </DialogContent>
    </Dialog>
  );
}
