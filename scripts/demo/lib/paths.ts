/** Rutas de los archivos de la demo en RustFS. */
import { COMPANY_PROFILE } from '../data/catalog.ts';

/**
 * Igual que `formatPathSegment` de la app (src/shared/utils/legacy-mappers.ts), que no se puede
 * importar desde un script (usa el alias `@/`). Si la app cambia la convencion, cambiarla aca.
 */
export function pathSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[áäàâ]/g, 'a')
    .replace(/[éëèê]/g, 'e')
    .replace(/[íïìî]/g, 'i')
    .replace(/[óöòô]/g, 'o')
    .replace(/[úüùû]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export const DOCUMENT_BUCKET = 'document-files';
export const REMIT_BUCKET = 'daily-reports';

/** Carpeta de la empresa en `document-files`: `<empresa>-(<cuit>)`. El reset limpia este prefijo. */
export function companyFolder(): string {
  return `${pathSegment(COMPANY_PROFILE.name)}-(${COMPANY_PROFILE.cuit})`;
}

/** Prefijo de los remitos en `daily-reports` (la app usa `<cliente>/remito-...`). */
export const REMIT_PREFIX = pathSegment(COMPANY_PROFILE.name);
