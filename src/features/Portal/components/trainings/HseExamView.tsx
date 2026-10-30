import { getMyOpenHseExam } from '@/features/Portal/actions/hse-trainings.queries';
import { requirePortalSection } from '@/features/Portal/navigation/sections.server';
import { redirect } from 'next/navigation';
import { HseExamRunner } from './HseExamRunner';

/**
 * Examen abierto del empleado. Sin intento abierto (no empezó, ya lo envió o se cerró por tiempo) vuelve a la
 * capacitación: un intento cerrado no se puede reabrir desde acá.
 */
export async function HseExamView({ trainingId }: { trainingId: string }) {
  const employee = await requirePortalSection('trainings');
  const exam = await getMyOpenHseExam(employee, trainingId);
  if (!exam) redirect(`/portal/trainings/${trainingId}`);
  return <HseExamRunner exam={exam} />;
}
