import { checkPermissionServer } from '@/features/Permissions/actions/permissions.server';
import { RecordHeader } from '@/shared/components/common/RecordHeader';
import { SectionCard } from '@/shared/components/common/SectionCard';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { formatArgentinaDateTime, formatDateAr } from '@/shared/lib/argentina-time';
import { Ban, ChevronLeft, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getHseRecordDetail, type HseRecordDetail } from '../actions/records.queries';
import { HseStatusBadge } from '../components/HseStatusBadge';
import { InstructorsEditor } from '../components/InstructorsEditor';
import { HSE_ATTENDEE_RESULT_LABELS, HSE_INSTRUCTOR_KIND_LABELS, HSE_RECORD_MODALITY_LABELS } from '../lib/pdf-content';
import { HSE_RECORD_STATUS_UI } from '../lib/status-presentation';
import { formatPercent } from '../lib/training-status';
import { AttendeesSection } from './components/AttendeesSection';
import { RecordActions } from './components/RecordActions';

export async function getHseRecordTitle(id: string) {
  const record = await getHseRecordDetail(id).catch(() => null);
  return record ? `Acta ${record.number} | HSE` : 'Acta | HSE';
}

/** Lo que falta para cerrar (las mismas reglas que valida `hse_close_training_record`), o null. */
function closeBlocker(record: HseRecordDetail): string | null {
  if (record.instructors.length === 0) return 'cargá al menos un capacitador.';
  if (!record.attendees.some((a) => a.attended)) return 'marcá al menos un asistente presente.';
  return null;
}

/** Detalle de un acta: datos, capacitadores y asistentes (en borrador, editables; cerrada, lo congelado). */
export async function HseRecordDetailPage({ id }: { id: string }) {
  const [record, canUpdate, canApprove, canDelete] = await Promise.all([
    getHseRecordDetail(id),
    checkPermissionServer('hse', 'actas', 'update'),
    checkPermissionServer('hse', 'actas', 'approve'),
    checkPermissionServer('hse', 'actas', 'delete'),
  ]);
  if (record === null) {
    const canView = await checkPermissionServer('hse', 'actas', 'view');
    if (!canView) return <StateBlock variant="noperm" title="No tenés permiso para ver esta información" />;
    notFound();
  }

  const isDraft = record.status === 'draft';
  const frozen = record.frozen;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/hse?tab=actas"
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-2 sm:min-h-0"
      >
        <ChevronLeft aria-hidden="true" className="size-4" /> Actas
      </Link>

      <RecordHeader
        identity={
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <HseStatusBadge ui={HSE_RECORD_STATUS_UI[record.status]} />
              <span className="text-muted-foreground text-sm tabular-nums">{formatDateAr(record.heldOn)}</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">Acta {record.number}</h1>
            <p className="text-muted-foreground">
              <Link
                href={`/dashboard/hse/trainings/${record.training.id}?tab=capacitaciones`}
                className="text-brand-ink focus-visible:ring-ring rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2"
              >
                {record.training.title}
              </Link>
            </p>
          </div>
        }
        actions={
          <RecordActions
            recordId={record.id}
            number={record.number}
            status={record.status}
            formValues={{
              trainingId: record.training.id,
              heldOn: record.heldOn,
              modality: record.modality,
              location: record.location ?? '',
              durationMinutes: record.durationMinutes ? String(record.durationMinutes) : '',
              topics: record.topics,
              observations: record.observations ?? '',
            }}
            closeBlocker={closeBlocker(record)}
            can={{ update: canUpdate, approve: canApprove, delete: canDelete }}
          />
        }
      />

      {record.status === 'voided' && (
        <div role="note" className="bg-danger-subtle text-danger-subtle-foreground flex gap-3 rounded-xl p-4">
          <Ban aria-hidden="true" className="size-5 shrink-0" />
          <p className="text-sm text-pretty">
            Anulada el {record.voidedAt ? formatArgentinaDateTime(record.voidedAt) : '—'}. Motivo: {record.voidReason}
          </p>
        </div>
      )}
      {record.contentSha256 && (
        <div role="note" className="bg-muted/50 flex gap-3 rounded-xl p-4">
          <ShieldCheck aria-hidden="true" className="text-muted-foreground size-5 shrink-0" />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="text-pretty">
              Cerrada el {record.closedAt ? formatArgentinaDateTime(record.closedAt) : '—'}
              {frozen?.closedBy.name ? ` por ${frozen.closedBy.name}` : ''}. Lo que sigue es lo congelado al cerrar; la
              columna «Firma hoy» muestra las firmas posteriores.
            </p>
            <p className="text-muted-foreground font-mono text-xs break-all">Huella SHA-256: {record.contentSha256}</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Dictado">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Modalidad</dt>
              <dd>{HSE_RECORD_MODALITY_LABELS[record.modality]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Lugar</dt>
              <dd>{record.location ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Duración</dt>
              <dd className="tabular-nums">{record.durationMinutes ? `${record.durationMinutes} minutos` : '—'}</dd>
            </div>
          </dl>
        </SectionCard>
        <SectionCard title="Temario" className="lg:col-span-2">
          <p className="text-sm whitespace-pre-line text-pretty">{record.topics}</p>
          {record.observations && (
            <>
              <h3 className="mt-4 text-sm font-medium">Observaciones</h3>
              <p className="text-muted-foreground text-sm whitespace-pre-line text-pretty">{record.observations}</p>
            </>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Capacitadores"
        description={isDraft ? 'Se copiaron los habituales de la capacitación: ajustalos a este dictado.' : undefined}
      >
        {isDraft || !frozen ? (
          <InstructorsEditor
            target={{ kind: 'record', id: record.id }}
            instructors={record.instructors}
            editable={isDraft && canUpdate}
            emptyText="Sin capacitadores. Hace falta al menos uno para cerrar el acta."
          />
        ) : (
          <ul className="divide-y rounded-lg border">
            {frozen.instructors.map((i, index) => (
              <li key={`${i.fullName}-${index}`} className="p-3">
                <p className="font-medium">{i.fullName}</p>
                <p className="text-muted-foreground text-sm">
                  {[HSE_INSTRUCTOR_KIND_LABELS[i.kind], i.roleTitle, i.license ? `Mat. ${i.license}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Asistentes"
        description={
          isDraft
            ? 'Arranca con quienes tienen la capacitación asignada. Marcá quién estuvo y sumá a los que faltan.'
            : 'Resultado y firma registrados al cerrar.'
        }
      >
        {isDraft || !frozen ? (
          <AttendeesSection recordId={record.id} attendees={record.attendees} editable={isDraft && canUpdate} />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[680px] text-sm">
              <caption className="sr-only">Asistentes congelados al cerrar el acta</caption>
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Legajo
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Apellido y nombre
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Asistió
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Resultado
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Firma al cerrar
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Firma hoy
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {frozen.attendees.map((a) => {
                  const live = record.attendees.find((x) => x.employeeId === a.employeeId);
                  return (
                    <tr key={a.employeeId}>
                      <td className="px-3 py-2 font-mono tabular-nums">{a.file ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{a.fullName}</span>
                        {a.position && <span className="text-muted-foreground block text-xs">{a.position}</span>}
                      </td>
                      <td className="px-3 py-2">{a.attended ? 'Sí' : 'No'}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {HSE_ATTENDEE_RESULT_LABELS[a.result.status]}
                        {a.result.scorePercent !== null && a.result.scorePercent !== undefined
                          ? ` · ${formatPercent(a.result.scorePercent)}`
                          : ''}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {a.certificate ? formatArgentinaDateTime(a.certificate.signedAt) : 'Pendiente'}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {live?.signedAt ? formatArgentinaDateTime(live.signedAt) : 'Sin firmar'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
