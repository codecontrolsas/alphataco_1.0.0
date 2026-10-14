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

  // Pestaña activa derivada: si el usuario no eligió ninguna, la primera.
  const currentTabId = activeTabId ?? remitos[0]?.id ?? null;

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
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="flex-shrink-0 px-6 py-5 border-b ">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold text-balance">Gestión de Remitos</DialogTitle>
                  {customerName && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Cliente: <span className="font-medium text-foreground">{customerName}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pr-6">
                <div className="px-4 py-2 bg-background rounded-lg border shadow-sm">
                  <div className="text-xs text-muted-foreground">Remitos</div>
                  <div className="text-2xl font-bold text-primary">{stats.totalRemitos}</div>
                </div>
                <div className="px-4 py-2 bg-background rounded-lg border shadow-sm">
                  <div className="text-xs text-muted-foreground">Documentos</div>
                  <div className="text-2xl font-bold text-green-600">{stats.totalDocuments}</div>
                </div>
              </div>
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
                      Comience agregando un remito para gestionar los documentos de esta línea del parte diario.
                    </p>
                  </div>
                  <Button onClick={() => setIsAddingRemito(true)} size="lg">
                    <Plus className="h-5 w-5 mr-2" />
                    Agregar Primer Remito
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-shrink-0 mb-4 flex gap-2">
                  <Button onClick={() => setIsAddingRemito(true)} size="default">
                    <Plus className="h-4 w-4 mr-2" />
                    Nuevo Remito
                  </Button>
                  <Button onClick={() => setIsLinkingRemito(true)} size="default" variant="outline">
                    <Link2 className="h-4 w-4 mr-2" />
                    Vincular Remito Existente
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
                          {isLinked ? <Link2 className="h-4 w-4 text-blue-600" /> : <FileText className="h-4 w-4" />}
                          <span className="font-medium">{remito.remit_number}</span>
                          {remito.remito_documents.length > 0 && (
                            <Badge variant="secondary" className="text-xs h-5 px-2">
                              {remito.remito_documents.length}
                            </Badge>
                          )}
                          {isLinked && (
                            <Badge variant="outline" className="text-xs h-5 px-2 border-blue-600 text-blue-600">
                              Vinculado
                            </Badge>
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
