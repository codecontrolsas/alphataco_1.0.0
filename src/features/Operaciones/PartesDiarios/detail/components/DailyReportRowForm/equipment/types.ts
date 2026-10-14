import type { DailyReportRowForForm } from '../../../form-data.server';

/** Otro equipo ya guardado en la línea que se edita (puede estar fuera de las opciones por baja o condición). */
export type SavedOtherEquipment = NonNullable<
  NonNullable<DailyReportRowForForm>['dailyreportequipmentrelations'][number]['other_equipment']
>;
