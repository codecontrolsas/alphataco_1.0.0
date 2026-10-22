import { navigationLinks } from '@/features/Layout/sidebar/constants/navigation';
import { Logger } from '@/lib/logger';
import { cache } from 'react';
import 'server-only';
import { MANUAL_SECTIONS } from '../catalog';
import { COVERAGE_EXCLUSIONS } from '../catalog/coverage';
import { READING_PATHS, START_HERE } from '../catalog/home';
import { checkManualIntegrity } from './integrity';
import { loadManual, type LoadedManual } from './manual-loader';

const logger = new Logger('features/Ayuda/Manual');

let cached: LoadedManual | null = null;
let lastProblemCount = 0;

/**
 * Lectura desde disco, una sola vez por pedido aunque la usen el header (botón "?") y la tab.
 * En desarrollo se relee en cada pedido para ver los cambios al guardar; los problemas de
 * integridad se loguean sólo cuando cambia su cantidad, para no ensuciar cada navegación.
 */
const readManual = cache((): LoadedManual => {
  const manual = loadManual(MANUAL_SECTIONS);
  const problems = checkManualIntegrity({
    sections: MANUAL_SECTIONS,
    readingPaths: READING_PATHS,
    startHere: START_HERE,
    exclusions: COVERAGE_EXCLUSIONS,
    manual,
    moduleRoots: navigationLinks.map((link) => link.href),
  });
  if (problems.length !== lastProblemCount) {
    lastProblemCount = problems.length;
    if (problems.length > 0) {
      logger.warn(`Manual de uso: ${problems.length} problema(s). Corré npm run manual:check`, {
        data: { problems: problems.slice(0, 20) },
      });
    }
  }
  return manual;
});

/**
 * El manual cargado. En producción se lee una vez por proceso: el contenido viaja en la imagen y
 * no cambia.
 */
export function getManual(): LoadedManual {
  if (process.env.NODE_ENV !== 'production') return readManual();
  if (!cached) {
    cached = loadManual(MANUAL_SECTIONS);
    if (cached.issues.length > 0) {
      logger.error('Manual de uso: guías que no se pudieron leer', { data: { issues: cached.issues } });
    }
  }
  return cached;
}
