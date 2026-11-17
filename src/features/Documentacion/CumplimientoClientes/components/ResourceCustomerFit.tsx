import { Logger } from '@/lib/logger';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import { getVisibleFitKinds, loadResourceCustomerFits } from '../lib/customer-compliance.server';
import type { FitResourceKind } from '../lib/customer-fit';
import { FitCellDetail } from './FitCellDetail';

const logger = new Logger('features/Documentacion/CumplimientoClientes/ResourceCustomerFit');

/**
 * En la ficha de una persona o un equipo: su estado frente a cada cliente al que está afectado (puede cumplir para uno y
 * no para otro). Sin permiso de documentación, sin afectaciones o si falla el cálculo, no muestra nada: es información
 * extra de la cabecera, no debe romperla.
 */
export async function ResourceCustomerFit({ kind, resourceId }: { kind: FitResourceKind; resourceId: string }) {
  const kinds = await getVisibleFitKinds();
  if (!kinds.includes(kind)) return null;
  try {
    const { typeNames, fits } = await loadResourceCustomerFits(await getActiveCompanyId(), kind, resourceId);
    if (fits.length === 0) return null;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-sm">
        <span className="text-muted-foreground">Por cliente:</span>
        {fits.map((f) => (
          <span key={f.customerId} className="inline-flex items-center gap-1.5">
            <span className="max-w-48 truncate">{f.name}</span>
            <FitCellDetail cell={f.cell} typeNames={typeNames} label={f.name} />
          </span>
        ))}
      </div>
    );
  } catch (error) {
    logger.warn('No se pudo calcular el estado por cliente', { data: { error, kind, resourceId } });
    return null;
  }
}
