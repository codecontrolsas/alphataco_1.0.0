import { HSE_ACK_STATUS_UI, HSE_ASSIGNMENT_STATUS_UI } from '@/features/Hse/lib/status-presentation';
import { getMyHseDocuments } from '@/features/Portal/actions/hse-documents.queries';
import { getMyHseNotices } from '@/features/Portal/actions/hse-notices.queries';
import { getMyHseTrainings } from '@/features/Portal/actions/hse-trainings.queries';
import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import { HomeBlockSkeleton, HomeStatsSkeleton } from '@/features/Portal/fallback/PortalHomeSkeleton';
import { CERTIFICATE_PENDING_UI, trainingNextStep } from '@/features/Portal/lib/training-copy';
import {
  UPCOMING_WINDOW_DAYS,
  dueLabel,
  recentlyCompleted,
  summarizeWork,
  upcomingExpirations,
} from '@/features/Portal/lib/work-summary';
import { sectionsFor } from '@/features/Portal/navigation/registry';
import { getVisiblePortalSectionIds, requirePortalSection } from '@/features/Portal/navigation/sections.server';
import { cn } from '@/lib/utils';
import { argentinaDate, formatArgentinaDay, formatDateAr, formatLongDateAr } from '@/shared/lib/argentina-time';
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileSignature,
  FileText,
  GraduationCap,
  Inbox,
  PartyPopper,
} from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { DataList, type DataListItem } from '../ui/DataList';
import { EmptyState } from '../ui/EmptyState';
import { PageHeader } from '../ui/PageHeader';
import { SectionCard } from '../ui/SectionCard';
import { StatCard } from '../ui/StatCard';
import { StatusBadge } from '../ui/StatusBadge';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Las tres consultas del inicio, en paralelo. Memoizadas por request: los badges del menú ya las pidieron. */
function loadHomeData(employee: PortalEmployee) {
  return Promise.all([getMyHseDocuments(employee), getMyHseTrainings(employee), getMyHseNotices(employee)]);
}

/**
 * Inicio del portal: qué tengo que hacer, qué vence pronto, qué completé y a dónde ir. Cada bloque carga en su propio
 * Suspense con su esqueleto; el saludo y los accesos rápidos no esperan a las consultas.
 */
export async function PortalHome() {
  const employee = await requirePortalSection('home');
  const visibleIds = await getVisiblePortalSectionIds(employee.companyId);
  const hasHse = visibleIds.includes('documents') || visibleIds.includes('trainings');
  const today = argentinaDate();
  const role = [employee.position, employee.sector].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        title={`Hola, ${employee.firstname}`}
        description={
          <>
            <span>{capitalize(formatLongDateAr(today))}</span>
            {role && <span> · {role}</span>}
          </>
        }
      />

      <div className="space-y-8">
        {hasHse && (
          <section aria-labelledby="home-summary">
            <h2 id="home-summary" className="sr-only">
              Resumen
            </h2>
            <Suspense fallback={<HomeStatsSkeleton />}>
              <HomeStats employee={employee} today={today} />
            </Suspense>
          </section>
        )}

        <div className="grid gap-8 lg:grid-cols-3">
          {hasHse && (
            <>
              <div className="min-w-0 lg:col-span-2">
                <Suspense fallback={<HomeBlockSkeleton rows={3} />}>
                  <HomePending employee={employee} />
                </Suspense>
              </div>
              <div className="min-w-0">
                <Suspense fallback={<HomeBlockSkeleton />}>
                  <HomeUpcoming employee={employee} today={today} />
                </Suspense>
              </div>
              <div className="min-w-0 lg:col-span-2">
                <Suspense fallback={<HomeBlockSkeleton />}>
                  <HomeRecent employee={employee} />
                </Suspense>
              </div>
            </>
          )}
          <div className={cn('min-w-0', !hasHse && 'lg:col-span-3')}>
            <HomeQuickLinks visibleIds={visibleIds} />
          </div>
        </div>
      </div>
    </>
  );
}

async function HomeStats({ employee, today }: { employee: PortalEmployee; today: string }) {
  const [documents, trainings, notices] = await loadHomeData(employee);
  const work = summarizeWork(documents, trainings);
  const upcoming = upcomingExpirations(trainings, notices, today);
  const docs = work.pendingDocuments.length;
  const take = work.toTake.length;
  const sign = work.toSign.length;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Documentos por aceptar"
        value={docs}
        hint={docs === 0 ? 'Nada pendiente' : 'Leelos y respondé'}
        href="/portal/documents"
        icon={FileText}
        tone={docs > 0 ? 'warn' : 'ok'}
      />
      <StatCard
        label="Capacitaciones por hacer"
        value={take}
        hint={take === 0 ? 'Nada pendiente' : 'Material y examen'}
        href="/portal/trainings"
        icon={GraduationCap}
        tone={take > 0 ? 'warn' : 'ok'}
      />
      <StatCard
        label="Constancias por firmar"
        value={sign}
        hint={sign === 0 ? 'Nada pendiente' : 'Firmalas con tu contraseña'}
        href="/portal/trainings"
        icon={FileSignature}
        tone={sign > 0 ? 'brand' : 'ok'}
      />
      <StatCard
        label="Próximos vencimientos"
        value={upcoming.length}
        hint={
          upcoming.length === 0
            ? `Nada en ${UPCOMING_WINDOW_DAYS} días`
            : `En los próximos ${UPCOMING_WINDOW_DAYS} días`
        }
        href="#home-upcoming"
        icon={CalendarClock}
        tone={upcoming.some((u) => u.daysLeft < 0) ? 'danger' : upcoming.length > 0 ? 'warn' : 'ok'}
      />
    </div>
  );
}

async function HomePending({ employee }: { employee: PortalEmployee }) {
  const [documents, trainings] = await loadHomeData(employee);
  const work = summarizeWork(documents, trainings);
  const items: DataListItem[] = [
    ...work.pendingDocuments.map((d) => ({
      key: `doc:${d.ackId}`,
      href: `/portal/documents/${d.ackId}`,
      leading: <FileText className="size-5" />,
      title: d.title,
      meta: [
        d.typeName,
        `Versión ${d.version}`,
        d.publishedAt ? `publicado el ${formatArgentinaDay(d.publishedAt)}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      aside: <StatusBadge ui={HSE_ACK_STATUS_UI.pending} />,
    })),
    ...work.toSign.map((t) => ({
      key: `sign:${t.trainingId}`,
      href: `/portal/trainings/${t.trainingId}`,
      leading: <FileSignature className="size-5" />,
      title: t.title,
      meta: 'Aprobaste: falta firmar tu constancia',
      aside: <StatusBadge ui={CERTIFICATE_PENDING_UI} />,
    })),
    ...work.toTake.map((t) => ({
      key: `take:${t.trainingId}`,
      href: `/portal/trainings/${t.trainingId}`,
      leading: <GraduationCap className="size-5" />,
      title: t.title,
      meta: trainingNextStep(t),
      aside: <StatusBadge ui={HSE_ASSIGNMENT_STATUS_UI[t.status]} />,
    })),
  ];
  const nothingAssigned = documents.length === 0 && trainings.length === 0;

  return (
    <SectionCard
      id="home-pending"
      title="Para hacer"
      count={items.length > 0 ? items.length : undefined}
      bare={items.length > 0}
      description={
        work.blocked.length > 0
          ? `${work.blocked.length === 1 ? '1 capacitación' : `${work.blocked.length} capacitaciones`} sin intentos: consultá con el área de HSE.`
          : undefined
      }
    >
      {items.length > 0 ? (
        <DataList items={items.slice(0, 6)} label="Tareas pendientes" />
      ) : nothingAssigned ? (
        <EmptyState
          compact
          icon={Inbox}
          title="Todavía no tenés tareas asignadas"
          description="Cuando la empresa te asigne documentos para leer o capacitaciones, van a aparecer acá."
        />
      ) : (
        <EmptyState
          compact
          tone="success"
          icon={PartyPopper}
          title="Estás al día"
          description="No tenés documentos por aceptar, capacitaciones por hacer ni constancias por firmar."
        />
      )}
      {items.length > 6 && (
        <p className="text-muted-foreground text-sm">
          Y {items.length - 6} más en{' '}
          <Link className="text-brand-ink underline underline-offset-4" href="/portal/documents">
            Mis documentos
          </Link>{' '}
          y{' '}
          <Link className="text-brand-ink underline underline-offset-4" href="/portal/trainings">
            Mis capacitaciones
          </Link>
          .
        </p>
      )}
    </SectionCard>
  );
}

async function HomeUpcoming({ employee, today }: { employee: PortalEmployee; today: string }) {
  const [, trainings, notices] = await loadHomeData(employee);
  const upcoming = upcomingExpirations(trainings, notices, today);
  return (
    <SectionCard
      id="home-upcoming"
      title="Vencimientos"
      description={`Avisos y aprobaciones que vencen en los próximos ${UPCOMING_WINDOW_DAYS} días.`}
      bare={upcoming.length > 0}
    >
      {upcoming.length > 0 ? (
        <DataList
          label="Próximos vencimientos"
          items={upcoming.map((u) => ({
            key: u.key,
            href: u.href,
            leading: <CalendarClock className="size-5" />,
            title: u.title,
            meta: (
              <span className={u.daysLeft < 0 ? 'text-danger-subtle-foreground' : 'text-warn-subtle-foreground'}>
                {u.kind === 'training' ? 'Capacitación' : 'Documento'} · {dueLabel(u.daysLeft)}{' '}
                <span className="tabular-nums">({formatDateAr(u.dueOn)})</span>
              </span>
            ),
          }))}
        />
      ) : (
        <EmptyState
          compact
          tone="success"
          icon={CheckCircle2}
          title="Nada por vencer"
          description="No tenés avisos ni aprobaciones que venzan pronto."
        />
      )}
    </SectionCard>
  );
}

async function HomeRecent({ employee }: { employee: PortalEmployee }) {
  const [documents, trainings] = await loadHomeData(employee);
  const recent = recentlyCompleted(documents, trainings);
  return (
    <SectionCard id="home-recent" title="Completado recientemente" bare={recent.length > 0}>
      {recent.length > 0 ? (
        <DataList
          label="Completado recientemente"
          items={recent.map((r) => ({
            key: r.key,
            href: r.href,
            leading: r.kind === 'training' ? <GraduationCap className="size-5" /> : <FileText className="size-5" />,
            title: r.title,
            meta: <span className="tabular-nums">{formatArgentinaDay(r.at)}</span>,
            aside: (
              <StatusBadge
                ui={r.outcome === 'passed' ? HSE_ASSIGNMENT_STATUS_UI.passed : HSE_ACK_STATUS_UI[r.outcome]}
              />
            ),
          }))}
        />
      ) : (
        <EmptyState
          compact
          icon={ClipboardCheck}
          title="Todavía no completaste nada"
          description="Acá vas a ver los documentos que respondiste y las capacitaciones que aprobaste."
        />
      )}
    </SectionCard>
  );
}

function HomeQuickLinks({ visibleIds }: { visibleIds: string[] }) {
  const links = sectionsFor(visibleIds).filter((s) => s.id !== 'home');
  return (
    <SectionCard id="home-links" title="Accesos rápidos" bare>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        {links.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.id}>
              <Link
                href={s.href}
                className="bg-card hover:bg-muted/40 focus-visible:ring-ring flex min-h-16 items-center gap-3 rounded-xl border p-3 transition-colors outline-none focus-visible:ring-2 motion-reduce:transition-none"
              >
                <span
                  aria-hidden="true"
                  className="bg-brand-subtle text-brand-subtle-foreground flex size-10 shrink-0 items-center justify-center rounded-lg"
                >
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="text-muted-foreground block text-xs text-pretty">{s.description}</span>
                </span>
                <ChevronRight aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
