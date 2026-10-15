'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissions } from '@/features/Permissions/hooks/usePermissions';
import { useQuery } from '@tanstack/react-query';
import moment from 'moment';
import { fetchKPIRevisions } from '../actions/actions';
import { KPI } from '../types';
import { KpiEditNumberForm } from './KpiEditNumberForm';

interface KpiDetailModalProps {
  kpi: KPI;
  isOpen: boolean;
  onClose: () => void;
}

export function KpiDetailModal({ kpi, isOpen, onClose }: KpiDetailModalProps) {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('configuracion', 'kpis', 'update');

  // Cargar revisiones con useQuery — se activa solo cuando el modal está abierto
  const {
    data: revisions = [],
    isFetching: loadingRevisions,
    refetch: refetchRevisions,
  } = useQuery({
    queryKey: ['kpi-revisions', kpi.id],
    queryFn: () => fetchKPIRevisions(kpi.id),
    enabled: isOpen && !!kpi.id,
    staleTime: 0,
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return moment(dateString).format('DD/MM/YYYY');
  };

  const isExpired = () => {
    if (!kpi.validity_date) return false;
    return moment(kpi.validity_date).isBefore(moment(), 'day');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">{kpi.name}</DialogTitle>
          <DialogDescription>Código: {kpi.code}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="detalle" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="detalle">Detalle</TabsTrigger>
            <TabsTrigger value="revisiones">Revisiones ({revisions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="detalle" className="space-y-4 mt-4">
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Código</label>
                  <p className="text-base">{kpi.code}</p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Número</label>
                  <p className="text-base">{kpi.number ?? <span className="text-muted-foreground">-</span>}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Fecha de Vigencia</label>
                  <p className="text-base">
                    {formatDate(kpi.validity_date)}
                    {isExpired() && <span className="ml-2 text-sm text-red-500 font-semibold">(Vencido)</span>}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Estado</label>
                  <p className="text-base">
                    <span className={kpi.is_active ? 'text-green-600' : 'text-gray-500'}>
                      {kpi.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-muted-foreground">Fórmula de Cálculo</label>
                <p className="text-base bg-muted p-3 rounded-md font-mono">{kpi.calculation_formula}</p>
              </div>

              <div>
                <label className="text-sm font-semibold text-muted-foreground">Soporte Técnico</label>
                <p className="text-base">
                  <span className={kpi.technical_support ? 'text-green-600' : 'text-gray-500'}>
                    {kpi.technical_support ? 'Sí' : 'No'}
                  </span>
                </p>
              </div>

              {kpi.improvement_opportunities && (
                <div>
                  <label className="text-sm font-semibold text-muted-foreground">Oportunidades de Mejora</label>
                  <p className="text-base bg-muted p-3 rounded-md whitespace-pre-wrap">
                    {kpi.improvement_opportunities}
                  </p>
                </div>
              )}

              {canUpdate && (
                <div className="pt-4 border-t">
                  <KpiEditNumberForm kpi={kpi} onSuccess={() => refetchRevisions()} />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="revisiones" className="space-y-4 mt-4">
            {loadingRevisions ? (
              <p className="text-center text-muted-foreground">Cargando revisiones...</p>
            ) : revisions.length === 0 ? (
              <p className="text-center text-muted-foreground">No hay revisiones registradas</p>
            ) : (
              <div className="space-y-4">
                {revisions.map((revision) => (
                  <div key={revision.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-semibold text-muted-foreground">Número Anterior</label>
                            <p className="text-base">{revision.previous_number ?? '-'}</p>
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-muted-foreground">Número Nuevo</label>
                            <p className="text-base font-semibold text-green-600">{revision.new_number ?? '-'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div>
                            <label className="text-sm font-semibold text-muted-foreground">Vigencia Anterior</label>
                            <p className="text-base">{formatDate(revision.previous_validity_date)}</p>
                          </div>
                          <div>
                            <label className="text-sm font-semibold text-muted-foreground">Vigencia Nueva</label>
                            <p className="text-base font-semibold text-green-600">
                              {formatDate(revision.new_validity_date)}
                            </p>
                          </div>
                        </div>
                        {revision.change_reason && (
                          <div className="mt-2">
                            <label className="text-sm font-semibold text-muted-foreground">Motivo del Cambio</label>
                            <p className="text-base bg-muted p-2 rounded-md">{revision.change_reason}</p>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <label className="text-sm font-semibold text-muted-foreground">Fecha</label>
                        <p className="text-sm">{formatDate(revision.created_at)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
