'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { DiagramAxle, DiagramPosition } from '@/features/Mantenimiento/Gomeria/shared/TireDiagramRenderer';
import { TireDiagramRenderer } from '@/features/Mantenimiento/Gomeria/shared/TireDiagramRenderer';
import { useTireReturnWarehouse } from '@/features/Mantenimiento/Gomeria/shared/hooks/useTireReturnWarehouse';
import { TireReturnWarehouseSelect } from '@/features/Mantenimiento/Gomeria/shared/TireReturnWarehouseSelect';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Pencil, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AxleInput } from './actions.server';
import {
  getVehicleTemplateInfo,
  getVehicleTirePositionsWithDetails,
  resetVehicleToSubTypeTemplate,
} from './actions.server';
import { VehicleAxleEditor, type TirePositionSummary } from './vehicle-axle-editor';
import { VehicleAxleSizesForm } from './vehicle-axle-sizes-form';

// ============================================================================
// TYPES
// ============================================================================

interface VehicleTireDiagramSectionProps {
  vehicleId: string;
  canUpdate: boolean;
}

// ============================================================================
// LOADING SKELETON
// ============================================================================

function DiagramSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-44 w-full rounded-xl" />
          <Skeleton className="h-3 w-40" />
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function VehicleTireDiagramSection({ vehicleId, canUpdate }: VehicleTireDiagramSectionProps) {
  const queryClient = useQueryClient();

  const [editorOpen, setEditorOpen] = useState(false);
  const [inheritanceWarningOpen, setInheritanceWarningOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: templateInfo, isLoading: isLoadingTemplate } = useQuery({
    queryKey: ['vehicle-template-info', vehicleId],
    queryFn: () => getVehicleTemplateInfo(vehicleId),
    staleTime: 30 * 1000,
  });

  const { data: positions, isLoading: isLoadingPositions } = useQuery({
    queryKey: ['vehicle-tire-positions-details', vehicleId],
    queryFn: () => getVehicleTirePositionsWithDetails(vehicleId),
    enabled: !!templateInfo?.templateId,
    staleTime: 30 * 1000,
  });

  // ── Build diagram data ────────────────────────────────────────────────────

  const axles: DiagramAxle[] = [];
  const diagramPositions: DiagramPosition[] = [];

  if (positions) {
    const axleMap = new Map<string, DiagramAxle>();
    for (const pos of positions) {
      if (!pos.template_axle) continue;
      const key = pos.template_axle.id;
      if (!axleMap.has(key)) {
        axleMap.set(key, {
          id: pos.template_axle.id,
          axle_number: pos.template_axle.axle_number,
          tires_per_side: pos.template_axle.tires_per_side,
          tire_size: pos.template_axle.tire_size,
          is_drive_axle: pos.template_axle.is_drive_axle,
          is_spare: pos.template_axle.is_spare,
        });
      }
    }
    axles.push(...Array.from(axleMap.values()));

    for (const pos of positions) {
      diagramPositions.push({
        position_number: pos.position_number,
        axle_number: pos.axle_number,
        side: pos.side as 'LEFT' | 'RIGHT' | 'SPARE',
        tire_id: pos.tire_id,
        tire_serial: pos.tire?.serial_number ?? undefined,
        tire_brand: pos.tire?.brand?.name ?? undefined,
        tire_size: pos.effective_tire_size ?? pos.tire?.tire_type?.size ?? undefined,
      });
    }
  }

  // ── Current axles for editor ──────────────────────────────────────────────

  const currentAxles: AxleInput[] = axles.map((a) => ({
    axle_number: a.axle_number,
    tires_per_side: a.tires_per_side,
    tire_size: a.tire_size,
    is_drive_axle: a.is_drive_axle,
    is_spare: a.is_spare,
  }));

  const currentPositionsForEditor: TirePositionSummary[] = (positions ?? []).map((p) => ({
    position_number: p.position_number,
    tire_id: p.tire_id,
    tire_serial: p.tire?.serial_number,
    tire_brand: p.tire?.brand?.name,
    tire_has_stock: !!p.tire?.material_unit_id,
  }));

  // Al restablecer, las cubiertas montadas con stock vuelven a un depósito (Almacenes etapa 6).
  const mountedWithStock = (positions ?? []).some((p) => !!p.tire?.material_unit_id);
  const returnWarehouse = useTireReturnWarehouse(vehicleId, resetConfirmOpen && mountedWithStock);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleEditClick() {
    if (!templateInfo) return;
    // If currently inheriting from sub-type (not a vehicle override), show warning
    if (templateInfo.sourceType === 'sub_type') {
      setInheritanceWarningOpen(true);
    } else {
      setEditorOpen(true);
    }
  }

  async function handleReset() {
    setIsResetting(true);
    try {
      const result = await resetVehicleToSubTypeTemplate(vehicleId, returnWarehouse.warehouseId || null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['vehicle-template-info', vehicleId] });
      await queryClient.invalidateQueries({ queryKey: ['vehicle-tire-positions-details', vehicleId] });
      toast.success('Configuración restablecida al sub-tipo');
    } catch (err) {
      toast.error('Error al restablecer la configuración');
    } finally {
      setIsResetting(false);
      setResetConfirmOpen(false);
    }
  }

  function handleEditorSave() {
    void queryClient.invalidateQueries({ queryKey: ['vehicle-template-info', vehicleId] });
    void queryClient.invalidateQueries({ queryKey: ['vehicle-tire-positions-details', vehicleId] });
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isLoadingTemplate) {
    return <DiagramSkeleton />;
  }

  // ── No template ───────────────────────────────────────────────────────────

  if (!templateInfo || templateInfo.sourceType === 'none') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración de Cubiertas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Este equipo no tiene configuración de cubiertas.</p>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {canUpdate && (
                <Button variant="default" size="sm" onClick={() => setEditorOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Crear configuración personalizada
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/maintenance?tab=gomeria&subtab=plantillas">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ir a Plantillas
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>

        {/* Editor for creating new config */}
        <VehicleAxleEditor
          vehicleId={vehicleId}
          currentAxles={[]}
          currentPositions={[]}
          isNewConfig={true}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          onSave={handleEditorSave}
        />
      </Card>
    );
  }

  // ── Has template ──────────────────────────────────────────────────────────

  const isCustom = templateInfo.sourceType === 'vehicle';
  const sourceLabel = isCustom ? 'Personalizada' : `Heredada de ${templateInfo.subTypeName ?? 'sub-tipo'}`;
  const sourceBadgeVariant = isCustom ? 'default' : 'outline';

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap pb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">Configuración de Cubiertas</CardTitle>
            {templateInfo.templateName && (
              <span className="text-sm text-muted-foreground">— {templateInfo.templateName}</span>
            )}
            <Badge variant={sourceBadgeVariant} className="text-xs">
              {sourceLabel}
            </Badge>
          </div>

          {canUpdate && (
            <div className="flex items-center gap-2">
              {/* Reset to sub-type — only if it's an override and sub-type has a template */}
              {templateInfo.hasOverride && templateInfo.subTypeHasTemplate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setResetConfirmOpen(true)}
                  title="Restablecer configuración del sub-tipo"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Restablecer
                </Button>
              )}

              <Button variant="outline" size="sm" onClick={handleEditClick}>
                <Pencil className="h-4 w-4 mr-1" />
                Editar
              </Button>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {isLoadingPositions ? (
            <div className="space-y-3">
              <Skeleton className="h-44 w-full rounded-xl" />
            </div>
          ) : axles.length > 0 ? (
            <TireDiagramRenderer axles={axles} positions={diagramPositions} interactive={false} />
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No hay posiciones configuradas en esta plantilla.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Vehicle axle sizes form — overrides per axle.
          Uses template axles directly (independent of position generation) so
          the form is available before the first service order is created. */}
      {templateInfo.templateAxles.length > 0 && (
        <VehicleAxleSizesForm
          vehicleId={vehicleId}
          axles={templateInfo.templateAxles}
          hasGeometricOverride={templateInfo.sourceType === 'vehicle'}
        />
      )}

      {/* Axle Editor */}
      <VehicleAxleEditor
        vehicleId={vehicleId}
        currentAxles={currentAxles}
        currentPositions={currentPositionsForEditor}
        isNewConfig={!isCustom}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleEditorSave}
      />

      {/* Inheritance warning dialog */}
      <AlertDialog open={inheritanceWarningOpen} onOpenChange={setInheritanceWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Crear configuración personalizada</AlertDialogTitle>
            <AlertDialogDescription>
              Este equipo hereda la configuración del sub-tipo <strong>{templateInfo.subTypeName}</strong>. Al editar,
              se creará una configuración personalizada exclusiva para este equipo. Las posiciones actuales serán
              reemplazadas.
              <br />
              <br />
              ¿Desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setInheritanceWarningOpen(false);
                setEditorOpen(true);
              }}
            >
              Crear configuración propia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset confirmation */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restablecer configuración</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará la configuración personalizada de este equipo y volverá a usar la plantilla del
              sub-tipo <strong>{templateInfo.subTypeName}</strong>. Las cubiertas instaladas actualmente quedarán
              disponibles en el catálogo.
              <br />
              <br />
              ¿Desea continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mountedWithStock && returnWarehouse.needsChoice && (
            <TireReturnWarehouseSelect
              label="Depósito al que vuelven las cubiertas con stock"
              warehouses={returnWarehouse.warehouses}
              value={returnWarehouse.warehouseId}
              onChange={returnWarehouse.setWarehouseId}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleReset()}
              disabled={isResetting || (mountedWithStock && !returnWarehouse.warehouseId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isResetting ? 'Restableciendo...' : 'Restablecer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
