'use client';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMaintenanceLayout } from '@/features/Mantenimiento/shared/components/maintenance-layout-provider';
import { BRAND_NAME } from '@/shared/lib/branding';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEmployeeDataMaintenance } from './use-employee-data-maintenance';

interface MaintenanceHeaderProps {
  title?: string;
  showBack?: boolean;
  backHref?: string;
  onBack?: () => void;
  employeeName?: string | null;
  employeeCuil?: string | null;
}

export function MaintenanceHeader({
  title,
  showBack = false,
  backHref,
  onBack,
  employeeName: propEmployeeName,
  employeeCuil: propEmployeeCuil,
}: MaintenanceHeaderProps) {
  const router = useRouter();

  // Obtener datos del empleado del contexto del layout, o usar props si se proporcionan
  // Si no hay contexto (no está dentro del provider), las props serán null y no mostrará nada
  let contextEmployeeName: string | null = null;
  let contextEmployeeCuil: string | null = null;

  try {
    const context = useMaintenanceLayout();
    contextEmployeeName = context.employeeName;
    contextEmployeeCuil = context.employeeCuil;
  } catch {
    // Si no hay contexto disponible (no está dentro del provider), usar solo las props
  }

  // Si no hay datos del contexto o props, obtenerlos del cliente
  const { employeeData: clientEmployeeData, isLoading: isLoadingEmployee } = useEmployeeDataMaintenance();

  // Priorizar: props > contexto > datos del cliente
  const employeeName = propEmployeeName ?? contextEmployeeName ?? clientEmployeeData.employeeName;
  const employeeCuil = propEmployeeCuil ?? contextEmployeeCuil ?? clientEmployeeData.employeeCuil;

  // Solo mostrar loading si no hay datos en props ni contexto
  const showLoading = !propEmployeeName && !contextEmployeeName && isLoadingEmployee;

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 border-b border-border">
      <div className="px-4 py-3">
        {/* Primera fila: Logo, título y botón back */}
        <div className="flex items-center gap-3 min-w-0">
          {showBack && (
            <Button variant="ghost" size="icon" onClick={handleBack} className="h-10 w-10 shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-brand-ink text-base font-bold tracking-tight lowercase shrink-0">{BRAND_NAME}</span>
            {title && <h1 className="text-lg font-semibold text-foreground truncate min-w-0">{title}</h1>}
          </div>
        </div>
        {/* Segunda fila: Información del empleado (se muestra debajo en pantallas pequeñas) */}
        {(showLoading || employeeName || employeeCuil) && (
          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground flex-wrap">
            {showLoading ? (
              <>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </>
            ) : (
              <>
                {employeeName && (
                  <span className="font-medium text-foreground truncate max-w-full">{employeeName}</span>
                )}
                {employeeCuil && <span className="text-muted-foreground shrink-0">CUIL: {employeeCuil}</span>}
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
