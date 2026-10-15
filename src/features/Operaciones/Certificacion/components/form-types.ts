/**
 * Tipos compartidos por el formulario de línea de parte diario (tablero comercial).
 *
 * El schema Zod cambia entre alta y edición (`useFormSchema`): los valores comunes se infieren
 * de `rowFormBaseSchema` y los que sólo existen en un modo (o que el formulario carga pero el
 * schema no valida) se declaran acá como opcionales.
 */

import type { z } from 'zod';
import type { rowFormBaseSchema } from './hooks/useFormSchema';
import type { CertificationRow } from '../actions/queries.server';

/** Valores del formulario de línea (alta y edición). */
export type DailyReportRowFormValues = z.infer<typeof rowFormBaseSchema> & {
  /** Sólo en el alta. */
  date?: Date;
  /** Sólo en la edición. */
  status?: string;
  /** Jornada de 24 h: tramos cubiertos. */
  completed_day?: boolean;
  completed_night?: boolean;
};

/** Fila seleccionada que se está editando (la que arma `mapCertificationRow`). */
export type DailyReportRowFormRow = CertificationRow;
