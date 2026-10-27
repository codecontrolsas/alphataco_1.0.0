import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getMyHseDocuments } from '@/features/Portal/actions/hse-documents.queries';
import { getPortalEmployeeForPage } from '@/features/Portal/actions/perimeter';
import { formatArgentinaDay } from '@/shared/lib/argentina-time';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { DocumentsEmptyState } from './DocumentsEmptyState';
import { HseDocumentCard } from './HseDocumentCard';

const METHOD_LABELS = {
  invitation: 'por invitación',
  temporary_password: 'con contraseña temporal',
  existing_account: 'con tu usuario del sistema',
} as const;

/** Inicio del portal: quién sos (legajo, puesto, sector), estado del acceso y lo que tenés pendiente. */
export async function PortalHome() {
  const employee = await getPortalEmployeeForPage();
  const pending = (await getMyHseDocuments(employee)).filter((d) => d.status === 'pending');
  const fullName = `${employee.lastname} ${employee.firstname}`.trim();
  const initials = `${employee.firstname[0] ?? ''}${employee.lastname[0] ?? ''}`.toUpperCase();
  const role = [employee.position, employee.sector].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-balance">Hola, {employee.firstname}</h1>

      <section aria-labelledby="home-profile" className="bg-card rounded-xl border p-4">
        <h2 id="home-profile" className="sr-only">
          Tus datos
        </h2>
        <div className="flex items-center gap-4">
          <Avatar className="size-16 shrink-0">
            {employee.picture && <AvatarImage src={employee.picture} alt={`Foto de ${fullName}`} />}
            <AvatarFallback className="bg-brand-subtle text-brand-subtle-foreground text-lg font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-0.5">
            <p className="text-muted-foreground font-mono text-sm tabular-nums">
              Legajo <span className="text-foreground font-semibold">{employee.file ?? '—'}</span>
            </p>
            <p className="truncate text-lg font-semibold">{fullName}</p>
            <p className="text-muted-foreground text-sm text-pretty">{role || 'Sin puesto asignado'}</p>
          </div>
        </div>
        <Link
          href="/portal/profile"
          className="focus-visible:ring-ring text-brand-ink mt-4 inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium outline-none focus-visible:ring-2"
        >
          Ver mi perfil <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </section>

      <section aria-labelledby="home-access" className="bg-card flex items-start gap-3 rounded-xl border p-4">
        <span className="bg-ok-subtle text-ok-subtle-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
          <ShieldCheck aria-hidden="true" className="size-5" />
        </span>
        <div className="space-y-0.5">
          <h2 id="home-access" className="font-medium">
            Acceso habilitado
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            Recursos Humanos te habilitó el portal el{' '}
            <span className="font-mono tabular-nums">{formatArgentinaDay(employee.access.grantedAt)}</span>,{' '}
            {METHOD_LABELS[employee.access.method]}.
          </p>
        </div>
      </section>

      <section aria-labelledby="home-pending" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="home-pending" className="font-semibold">
            Pendientes
          </h2>
          <Link
            href="/portal/documents"
            className="focus-visible:ring-ring text-brand-ink inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium outline-none focus-visible:ring-2"
          >
            Mis documentos <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
        {pending.length === 0 ? (
          <div className="bg-card rounded-xl border p-4">
            <DocumentsEmptyState compact />
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {pending.length === 1
                ? 'Tenés 1 documento para leer y aceptar.'
                : `Tenés ${pending.length} documentos para leer y aceptar.`}
            </p>
            <ul className="space-y-3">
              {pending.slice(0, 3).map((d) => (
                <li key={d.ackId}>
                  <HseDocumentCard document={d} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
