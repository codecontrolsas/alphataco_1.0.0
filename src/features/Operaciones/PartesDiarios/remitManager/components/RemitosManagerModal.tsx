'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, FileText, Link2, Package, Plus } from 'lucide-react';
import React from 'react';

import { useRemitos, useRemitosStats } from '../hooks/useRemitos';
import { RemitosManagerProps } from '../types';
import { AddRemitForm } from './AddRemitForm';
import { LinkRemitoPanel } from './LinkRemitoPanel';
import { RemitTab } from './RemitTab';

export function RemitosManagerModal({ dailyReportRowId, customerName, isOpen, onClose }: RemitosManagerProps) {
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null);
  // Panel activo dentro del mismo modal: remitos / alta / vinculación (sin modales encadenados).
  const [mode, setMode] = React.useState<'list' | 'add' | 'link'>('list');

  const { data: remitos = [], isLoading, error } = useRemitos(dailyReportRowId);

  const stats = useRemitosStats(dailyReportRowId);

  // Pestaña activa derivada: si el usuario no eligió ninguna, la primera.
  const currentTabId = activeTabId ?? remitos[0]?.id ?? null;

  const handleRemitoCreated = (newRemitoId: string) => {
    setActiveTabId(newRemitoId);
    setMode('list');
  };

  const handleRemitoLinked = (newRemitoId: string) => {
    setActiveTabId(newRemitoId);
    setMode('list');
  };

  const handleClose = () => {
    setActiveTabId(null);
    setMode('list');
    onClose();
  };

  const existingNumbers = remitos.map((r) => r.remit_number);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-h-[90dvh] max-w-5xl flex flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="flex-shrink-0 px-4 py-5 border-b sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
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

              <div className="flex gap-3 sm:pr-6">
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

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6">
            {mode === 'add' ? (
              <AddRemitForm
                dailyReportRowId={dailyReportRowId}
                onClose={() => setMode('list')}
                existingNumbers={existingNumbers}
                onRemitoCreated={handleRemitoCreated}
              />
            ) : mode === 'link' ? (
              <LinkRemitoPanel
                dailyReportRowId={dailyReportRowId}
                onClose={() => setMode('list')}
                onRemitoLinked={handleRemitoLinked}
              />
            ) : isLoading ? (
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
              <div className="flex flex-1 items-center justify-center py-8">
                <div className="max-w-md space-y-6 text-center">
                  <div className="bg-muted mx-auto flex h-20 w-20 items-center justify-center rounded-2xl">
                    <FileText className="text-muted-foreground h-10 w-10" />
                  </div>
                  <div>
                    <h3 className="mb-2 text-xl font-semibold text-balance">No hay remitos registrados</h3>
                    <p className="text-muted-foreground text-sm text-balance">
                      Comience agregando un remito para gestionar los documentos de esta línea del parte diario.
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button type="button" onClick={() => setMode('add')}>
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar primer remito
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setMode('link')}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Vincular remito existente
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={currentTabId ?? undefined} onValueChange={setActiveTabId}>
                    <SelectTrigger className="w-full sm:w-72" aria-label="Remito">
                      <SelectValue placeholder="Elegir remito" />
                    </SelectTrigger>
                    <SelectContent>
                      {remitos.map((remito) => (
                        <SelectItem key={remito.id} value={remito.id}>
                          {remito.remit_number}
                          {' · '}
                          {remito.remito_documents.length}{' '}
                          {remito.remito_documents.length === 1 ? 'documento' : 'documentos'}
                          {remito.is_linked === true ? ' · Vinculado' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" onClick={() => setMode('add')}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nuevo remito
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setMode('link')}>
                    <Link2 className="mr-2 h-4 w-4" />
                    Vincular remito existente
                  </Button>
                </div>

                {remitos
                  .filter((remito) => remito.id === currentTabId)
                  .map((remito) => (
                    <RemitTab
                      key={remito.id}
                      remito={remito}
                      isActive
                      onActivate={() => setActiveTabId(remito.id)}
                      customerName={customerName}
                      dailyReportRowId={dailyReportRowId}
                    />
                  ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
