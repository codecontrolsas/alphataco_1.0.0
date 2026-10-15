'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, FileText, Link2, Package, Plus } from 'lucide-react';
import React from 'react';

import { useRemitos, useRemitosStats } from '../hooks/useRemitos';
import { RemitosManagerProps } from '../types';
import { AddRemitDialog } from './AddRemitDialog';
import { LinkRemitoDialog } from './LinkRemitoDialog';
import { RemitTab } from './RemitTab';

export function RemitosManagerModal({ dailyReportRowId, customerName, isOpen, onClose }: RemitosManagerProps) {
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
  const [isAddingRemito, setIsAddingRemito] = React.useState(false);
  const [isLinkingRemito, setIsLinkingRemito] = React.useState(false);

  const { data: remitos = [], isLoading, error } = useRemitos(dailyReportRowId);

  const stats = useRemitosStats(dailyReportRowId);

  // Pestaña visible: la elegida si sigue existiendo (pudo borrarse); si no, la primera
  const currentTabId = remitos.some((remito) => remito.id === activeTabId) ? activeTabId : (remitos[0]?.id ?? null);

  const handleRemitoCreated = (newRemitoId: string) => {
    setActiveTabId(newRemitoId);
    setIsAddingRemito(false);
  };

  const handleRemitoLinked = (newRemitoId: string) => {
    setActiveTabId(newRemitoId);
    setIsLinkingRemito(false);
  };

  const handleClose = () => {
    setActiveTabId(null);
    setIsAddingRemito(false);
    setIsLinkingRemito(false);
    onClose();
  };

  const existingNumbers = remitos.map((r) => r.remit_number);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="flex-shrink-0 px-6 py-5 border-b ">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-muted text-muted-foreground rounded-lg p-2">
                  <Package className="size-5" aria-hidden="true" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold text-balance">Remitos de la línea</DialogTitle>
                  {customerName && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Cliente: <span className="font-medium text-foreground">{customerName}</span>
                    </p>
                  )}
                </div>
              </div>

              <dl className="flex gap-3 sm:pr-6">
                <div className="bg-card rounded-lg border px-4 py-2">
                  <dt className="text-muted-foreground text-xs">Remitos</dt>
                  <dd className="font-mono text-2xl font-semibold tabular-nums">{stats.totalRemitos}</dd>
                </div>
                <div className="bg-card rounded-lg border px-4 py-2">
                  <dt className="text-muted-foreground text-xs">Documentos</dt>
                  <dd className="font-mono text-2xl font-semibold tabular-nums">{stats.totalDocuments}</dd>
                </div>
              </dl>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col px-6 py-5">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            ) : error ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Error al cargar los remitos: {error.message}</AlertDescription>
              </Alert>
            ) : remitos.length === 0 ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-6 max-w-md">
                  <div className="mx-auto w-20 h-20 bg-muted rounded-2xl flex items-center justify-center">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2 text-balance">No hay remitos registrados</h3>
                    <p className="text-sm text-muted-foreground text-balance">
                      Agregá el remito del servicio (número y documentos) o vinculá uno que ya esté cargado en otra línea del mismo cliente.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" variant="brand" onClick={() => setIsAddingRemito(true)}>
                      <Plus className="mr-2 size-4" />
                      Agregar remito
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setIsLinkingRemito(true)}>
                      <Link2 className="mr-2 size-4" />
                      Vincular remito existente
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-shrink-0 flex-wrap gap-2">
                  <Button type="button" variant="brand" size="sm" onClick={() => setIsAddingRemito(true)}>
                    <Plus className="mr-2 size-4" />
                    Nuevo remito
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setIsLinkingRemito(true)}>
                    <Link2 className="mr-2 size-4" />
                    Vincular remito existente
                  </Button>
                </div>

                <Tabs
                  value={currentTabId ?? undefined}
                  onValueChange={setActiveTabId}
                  className="flex-1 flex flex-col overflow-hidden"
                >
                  <TabsList className="flex-shrink-0 w-fit justify-start h-auto p-1.5 bg-muted/50 rounded-lg mb-4 overflow-x-auto">
                    {remitos.map((remito) => {
                      // Usar el campo is_linked de la base de datos
                      const isLinked = remito.is_linked === true;

                      return (
                        <TabsTrigger
                          key={remito.id}
                          value={remito.id}
                          className="flex items-center gap-2 px-4 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all"
                        >
                          {isLinked ? (
                            <Link2 className="text-info-subtle-foreground size-4" aria-hidden="true" />
                          ) : (
                            <FileText className="size-4" aria-hidden="true" />
                          )}
                          <span className="font-mono font-medium tabular-nums">{remito.remit_number}</span>
                          {remito.remito_documents.length > 0 && (
                            <Badge variant="secondary" className="text-xs h-5 px-2">
                              {remito.remito_documents.length}
                            </Badge>
                          )}
                          {isLinked && (
                            <Badge variant="info">Vinculado</Badge>
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>

                  <div className="flex-1 overflow-auto pr-1">
                    {remitos.map((remito) => (
                      <TabsContent key={remito.id} value={remito.id} className="h-full m-0">
                        <RemitTab
                          remito={remito}
                          isActive={currentTabId === remito.id}
                          onActivate={() => setActiveTabId(remito.id)}
                          customerName={customerName}
                          dailyReportRowId={dailyReportRowId}
                        />
                      </TabsContent>
                    ))}
                  </div>
                </Tabs>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AddRemitDialog
        dailyReportRowId={dailyReportRowId}
        isOpen={isAddingRemito}
        onClose={() => setIsAddingRemito(false)}
        existingNumbers={existingNumbers}
        onRemitoCreated={handleRemitoCreated}
      />

      <LinkRemitoDialog
        dailyReportRowId={dailyReportRowId}
        isOpen={isLinkingRemito}
        onClose={() => setIsLinkingRemito(false)}
        onRemitoLinked={handleRemitoLinked}
      />
    </>
  );
}
