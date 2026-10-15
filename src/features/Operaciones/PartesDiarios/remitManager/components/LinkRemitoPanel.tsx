'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, Link2, Search } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import React from 'react';

import { useDebounce } from '@/shared/hooks/useDebounce';
import { useAvailableRemitosForLinking, useLinkExistingRemito } from '../hooks/useRemitos';

interface LinkRemitoPanelProps {
  dailyReportRowId: string;
  onClose: () => void;
  onRemitoLinked?: (remitoId: string) => void;
}

/** Vinculación de un remito existente dentro del gestor (panel en línea, sin modal encima del modal). */
export function LinkRemitoPanel({ dailyReportRowId, onClose, onRemitoLinked }: LinkRemitoPanelProps) {
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebounce(searchInput, 500);

  const { data: availableRemitos = [], isLoading } = useAvailableRemitosForLinking(dailyReportRowId, debouncedSearch);
  const linkRemito = useLinkExistingRemito(dailyReportRowId);

  // Cierra y resetea la búsqueda (el reseteo vive en el punto de origen).
  const handleClose = () => {
    setSearchInput('');
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Link2 className="h-5 w-5" aria-hidden="true" />
            Vincular remito existente
          </h3>
          <p className="text-muted-foreground text-sm">Remito de otra línea para vincular a esta línea del parte.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleClose}>
          Volver a los remitos
        </Button>
      </div>

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
                {searchInput ? 'No se encontraron remitos con ese número' : 'No hay remitos disponibles para vincular'}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
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
                    className={`border rounded-lg p-4 transition-colors ${
                      isSameCustomer
                        ? 'hover:bg-muted/50'
                        : 'border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-lg">{remito.remit_number}</h4>
                          <Badge variant="secondary" className="text-xs">
                            <FileText className="h-3 w-3 mr-1" />
                            {docCount} {docCount === 1 ? 'documento' : 'documentos'}
                          </Badge>
                          {!isSameCustomer && (
                            <Badge variant="destructive" className="text-xs">
                              Cliente diferente
                            </Badge>
                          )}
                        </div>

                        {customer && (
                          <p className="text-sm text-muted-foreground">
                            Cliente: <span className="font-medium text-foreground">{customer.name}</span>
                          </p>
                        )}

                        {reportDate && (
                          <p className="text-xs text-muted-foreground">
                            Parte diario: {moment.utc(reportDate).locale('es').format('D [de] MMMM, YYYY')}
                          </p>
                        )}

                        {!isSameCustomer && (
                          <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                            ⚠️ Este remito pertenece a un registro con otro cliente
                          </p>
                        )}
                      </div>

                      {isSameCustomer && (
                        <Button onClick={() => handleLink(remito.id)} disabled={linkRemito.isPending} size="sm">
                          <Link2 className="h-4 w-4 mr-2" />
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
    </div>
  );
}
