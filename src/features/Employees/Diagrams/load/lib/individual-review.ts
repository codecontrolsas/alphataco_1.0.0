import type { DiagramInsert, DiagramUpdate } from '../../actions/mutations.server';
import { diagramDayKey } from '../../lib/diagram-dates';
import { expandIsoRanges, type IsoRange } from '../../lib/massive-ranges';
import type { ExistingDayRow } from '../actions.server';
import type { IndividualReviewValues } from '../schemas';

type ReviewDay = IndividualReviewValues['days'][number];

/**
 * Filas de la revisión de una carga individual: un renglón por día único de los rangos. Los días libres arrancan en
 * «crear» y los que ya tienen novedad en «conservar» (reemplazar es una decisión explícita). Sin permiso de
 * crear o de modificar, el renglón arranca en la opción segura y la otra queda deshabilitada.
 */
export function buildReviewDays(params: {
  ranges: IsoRange[];
  existing: ExistingDayRow[];
  canCreate: boolean;
  generalComment: string;
}): ReviewDay[] {
  const existingByDay = new Map(
    params.existing.map((row) => [diagramDayKey({ year: row.year, month: row.month, day: row.day }), row])
  );

  return expandIsoRanges(params.ranges).map((date) => {
    const current = existingByDay.get(date);
    return {
      date,
      existingId: current?.id ?? null,
      previousName: current?.name ?? null,
      previousColor: current?.color ?? null,
      action: current ? 'keep' : params.canCreate ? 'create' : 'skip',
      comments: params.generalComment,
    };
  });
}

/** Comentario final de un día: el general, o el propio del día cuando se personalizó. */
function resolveComment(day: ReviewDay, general: string, customize: boolean): string {
  return (customize ? day.comments : general).trim();
}

/**
 * Altas y modificaciones que salen de la revisión. Las altas llevan `comments || null`; en los reemplazos un
 * comentario vacío no se envía, así se conserva el que el día ya tenía.
 */
export function buildWritePayload(params: {
  days: ReviewDay[];
  employeeId: string;
  diagramTypeId: string;
  generalComment: string;
  customizeComments: boolean;
}): { creates: DiagramInsert[]; updates: DiagramUpdate[]; untouched: number } {
  const creates: DiagramInsert[] = [];
  const updates: DiagramUpdate[] = [];
  let untouched = 0;

  for (const day of params.days) {
    const comments = resolveComment(day, params.generalComment, params.customizeComments);
    if (day.action === 'create') {
      const [year, month, dayOfMonth] = day.date.split('-').map(Number);
      creates.push({
        employee_id: params.employeeId,
        diagram_type: params.diagramTypeId,
        day: dayOfMonth,
        month,
        year,
        comments: comments || null,
      });
    } else if (day.action === 'replace' && day.existingId) {
      updates.push({
        diagramId: day.existingId,
        diagram_type: params.diagramTypeId,
        ...(comments ? { comments } : {}),
      });
    } else {
      untouched += 1;
    }
  }

  return { creates, updates, untouched };
}
