import { getMyHseTrainings } from '@/features/Portal/actions/hse-trainings.queries';
import { getPortalEmployeeForPage } from '@/features/Portal/actions/perimeter';
import { HseTrainingCard } from './HseTrainingCard';
import { TrainingsEmptyState } from './TrainingsEmptyState';

/** "Mis capacitaciones": primero lo que requiere acción (rindiendo, pendiente, vencida), después lo aprobado. */
export async function HseTrainingList() {
  const employee = await getPortalEmployeeForPage();
  const trainings = await getMyHseTrainings(employee);
  if (trainings.length === 0) return <TrainingsEmptyState />;
  const todo = trainings.filter((t) => t.status !== 'passed');
  const done = trainings.filter((t) => t.status === 'passed');
  return (
    <div className="space-y-8">
      <section aria-labelledby="trainings-todo" className="space-y-3">
        <h2 id="trainings-todo" className="font-semibold">
          Para hacer <span className="text-muted-foreground font-normal tabular-nums">({todo.length})</span>
        </h2>
        {todo.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
            Estás al día: aprobaste todas tus capacitaciones.
          </p>
        ) : (
          <ul className="space-y-3">
            {todo.map((t) => (
              <li key={t.trainingId}>
                <HseTrainingCard training={t} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <section aria-labelledby="trainings-done" className="space-y-3">
          <h2 id="trainings-done" className="font-semibold">
            Aprobadas <span className="text-muted-foreground font-normal tabular-nums">({done.length})</span>
          </h2>
          <ul className="space-y-3">
            {done.map((t) => (
              <li key={t.trainingId}>
                <HseTrainingCard training={t} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function HseTrainingListSkeleton({ label = 'Cargando tus capacitaciones' }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-muted h-20 animate-pulse rounded-xl motion-reduce:animate-none" />
      ))}
    </div>
  );
}
