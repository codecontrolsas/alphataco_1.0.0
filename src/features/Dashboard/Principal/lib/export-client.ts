import { unwrapExportResult, type ExportResult } from '@/shared/lib/export-result';
import { toast } from 'sonner';

/**
 * Para el `fetchAllData` de los DataTable de los diálogos: devuelve los datos o, si la action
 * respondió con error (p. ej. «acote la exportación con filtros»), muestra ese mensaje en un toast y
 * lanza para cortar la descarga. El botón de exportación del DataTable agrega su propio aviso genérico.
 */
export function unwrapExportWithToast<T>(result: ExportResult<T>): T {
  if (!result.ok) toast.error(result.message);
  return unwrapExportResult(result);
}
