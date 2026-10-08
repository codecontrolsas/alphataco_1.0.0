import type { SectionDef } from './types.ts';
import { generalSection } from './sections/general.ts';
import { procesosSection } from './sections/procesos.ts';
import { dashboardSection } from './sections/dashboard.ts';
import { empleadosSection } from './sections/empleados.ts';
import { seleccionSection } from './sections/seleccion.ts';
import { equiposSection } from './sections/equipos.ts';
import { documentacionSection } from './sections/documentacion.ts';
import { operacionesSection } from './sections/operaciones.ts';
import { mantenimientoSection } from './sections/mantenimiento.ts';
import { almacenesSection } from './sections/almacenes.ts';
import { comercialSection } from './sections/comercial.ts';
import { formulariosSection } from './sections/formularios.ts';
import { configuracionSection } from './sections/configuracion.ts';
import { ayudaSection } from './sections/ayuda.ts';
import { campoSection } from './sections/campo.ts';

export { COVERAGE_EXCLUSIONS } from './coverage.ts';
export { READING_PATHS, START_HERE } from './home.ts';

/** Secciones del manual en orden de lectura. El orden de las guías dentro de cada una es el del array. */
export const MANUAL_SECTIONS: SectionDef[] = [
  generalSection,
  procesosSection,
  dashboardSection,
  empleadosSection,
  seleccionSection,
  equiposSection,
  documentacionSection,
  operacionesSection,
  mantenimientoSection,
  almacenesSection,
  comercialSection,
  formulariosSection,
  configuracionSection,
  ayudaSection,
  campoSection,
];
