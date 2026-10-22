import { almacenesSection } from './sections/almacenes.ts';
import { ayudaSection } from './sections/ayuda.ts';
import { campoSection } from './sections/campo.ts';
import { comercialSection } from './sections/comercial.ts';
import { comprasSection } from './sections/compras.ts';
import { configuracionSection } from './sections/configuracion.ts';
import { dashboardSection } from './sections/dashboard.ts';
import { documentacionSection } from './sections/documentacion.ts';
import { empleadosSection } from './sections/empleados.ts';
import { equiposSection } from './sections/equipos.ts';
import { formulariosSection } from './sections/formularios.ts';
import { generalSection } from './sections/general.ts';
import { mantenimientoSection } from './sections/mantenimiento.ts';
import { operacionesSection } from './sections/operaciones.ts';
import { procesosSection } from './sections/procesos.ts';
import { seleccionSection } from './sections/seleccion.ts';
import { tesoreriaSection } from './sections/tesoreria.ts';
import type { SectionDef } from './types.ts';

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
  comprasSection,
  tesoreriaSection,
  comercialSection,
  formulariosSection,
  configuracionSection,
  ayudaSection,
  campoSection,
];
