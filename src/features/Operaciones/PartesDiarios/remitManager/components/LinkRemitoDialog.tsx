'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { AlertTriangle, FileText, Link2, Search } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import React from 'react';

import { useAvailableRemitosForLinking, useLinkExistingRemito } from '../hooks/useRemitos';

interface LinkRemitoDialogProps {
  dailyReportRowId: string;
  isOpen: boolean;
  onClose: () => void;
  onRemitoLinked?: (remitoId: string) => void;
}

export function LinkRemitoDialog({ dailyReportRowId, isOpen, onClose, onRemitoLinked }: LinkRemitoDialogProps) {
  const [searchInput, setSearchInput] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  const { data: availableRemitos = [], isLoading } = useAvailableRemitosForLinking(dailyReportRowId, debouncedSearch);
  const linkRemito = useLinkExistingRemito(dailyReportRowId);

  // Debounce del input de búsqueda
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Al cerrar se limpia la búsqueda (en el handler, no en un efecto)
  const handleClose = () => {
    setSearchInput('');
    setDebouncedSearch('');
    onClose();
  };

  const handleLink = async (sourceRemitId: string) => {
    try {
      const newRemito = await linkRemito.mutateAsync(sourceRemitId);
      if (newRemito) {
        onRemitoLinked?.(newRemito.id);
        handleClose();
      }
    } catch (error) {
      // El error ya se maneja en el hook con toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Vincular remito existente
          </DialogTitle>
          <DialogDescription>
            Para un remito que cubre varias líneas: se suma a esta con los mismos documentos, sin volver a subirlos. Solo
            se vinculan remitos del mismo cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número de remito..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
            {searchInput && <p className="text-xs text-muted-foreground mt-1.5">Mostrando hasta 10 resultados</p>}
          </div>

          {isLoading ? (
            <div className="space-y-3 flex-shrink-0">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : availableRemitos.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center py-12">
              <div className="space-y-2">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {searchInput
                    ? 'No se encontraron remitos con ese número'
                    : 'No hay remitos disponibles para vincular'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto -mx-6 px-6">
              <div className="space-y-3 pr-4">
                {!searchInput && (
                  <p className="text-xs text-muted-foreground mb-3 px-1">Mostrando los últimos 10 remitos creados</p>
                )}
                {availableRemitos.map((remito) => {
                  const customer = remito.dailyreportrows?.customers;
                  const reportDate = remito.dailyreportrows?.dailyreport?.date;
                  const docCount = remito._count.remito_documents;
                  const isSameCustomer = remito.isSameCustomer;

                  return (
                    <div
                      key={remito.id}
                      className={cn(
                        'rounded-lg border p-4 transition-colors',
                        isSameCustomer ? 'hover:bg-muted/50' : 'border-danger/30 bg-danger-subtle/40'
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="font-mono text-lg font-semibold tabular-nums">{remito.remit_number}</h4>
                            <Badge variant="secondary">
                              <FileText aria-hidden="true" />
                              {docCount} {docCount === 1 ? 'documento' : 'documentos'}
                            </Badge>
                            {!isSameCustomer && (
                              <Badge variant="destructive">Cliente diferente</Badge>
                            )}
                          </div>

                          {customer && (
                            <p className="text-sm text-muted-foreground">
                              Cliente: <span className="font-medium text-foreground">{customer.name}</span>
                            </p>
                          )}

                          {reportDate && (
                            <p className="text-xs text-muted-foreground">
                              Parte diario:{' '}
                              <span className="font-mono tabular-nums">{moment.utc(reportDate).format('DD/MM/YYYY')}</span>
                            </p>
                          )}

                          {!isSameCustomer && (
                            <p className="text-danger-subtle-foreground flex items-center gap-1 text-xs font-medium">
                              <AlertTriangle className="size-3.5" aria-hidden="true" />
                              Pertenece a una línea de otro cliente: no se puede vincular.
                            </p>
                          )}
                        </div>

                        {isSameCustomer && (
                          <Button
                            type="button"
                            variant="brand"
                            onClick={() => handleLink(remito.id)}
                            disabled={linkRemito.isPending}
                            size="sm"
                          >
                            <Link2 className="mr-2 size-4" />
                            Vincular
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
