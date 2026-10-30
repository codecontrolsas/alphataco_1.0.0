import { requirePortalSection } from '@/features/Portal/navigation/sections.server';
import { formatArgentinaDay, formatDateOnlyAr } from '@/shared/lib/argentina-time';
import { ShieldCheck } from 'lucide-react';
import { ChangePasswordForm } from '../account/ChangePasswordForm';
import { PortalAvatar } from '../layout/PortalAvatar';
import { KeyValueList } from '../ui/KeyValueList';
import { PageHeader } from '../ui/PageHeader';

const METHOD_LABELS = {
  invitation: 'por invitación',
  temporary_password: 'con contraseña temporal',
  existing_account: 'con tu usuario del sistema',
} as const;

/** Perfil del empleado: identidad, datos del legajo (solo lectura), estado del acceso y cambio de contraseña. */
export async function PortalProfile() {
  const employee = await requirePortalSection('profile');
  const fullName = `${employee.lastname} ${employee.firstname}`.trim();
  const role = [employee.position, employee.sector].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        title="Mi perfil"
        description="Tus datos según el legajo. Si algo no es correcto, avisale a Recursos Humanos."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section
            aria-labelledby="profile-identity"
            className="bg-card flex items-center gap-4 rounded-xl border p-4 sm:p-6"
          >
            <PortalAvatar employee={employee} decorative={false} className="size-16 rounded-2xl text-lg" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-muted-foreground font-mono text-sm tabular-nums">
                Legajo <span className="text-foreground font-semibold">{employee.file ?? 'sin número'}</span>
              </p>
              <h2 id="profile-identity" className="text-lg font-semibold break-words">
                {fullName}
              </h2>
              <p className="text-muted-foreground text-sm text-pretty">{role || 'Sin puesto asignado'}</p>
            </div>
          </section>

          <section aria-labelledby="profile-data" className="bg-card space-y-4 rounded-xl border p-4 sm:p-6">
            <h2 id="profile-data" className="text-base font-semibold">
              Datos del legajo
            </h2>
            <KeyValueList
              rows={[
                { label: 'Legajo', value: employee.file, mono: true },
                { label: 'Apellido y nombre', value: fullName },
                { label: 'Puesto', value: employee.position },
                { label: 'Sector', value: employee.sector },
                {
                  label: 'Fecha de ingreso',
                  value: employee.admissionDate ? formatDateOnlyAr(employee.admissionDate) : null,
                  mono: true,
                },
                { label: 'Correo del legajo', value: employee.email },
                { label: 'Empresa', value: employee.companyName },
              ]}
            />
          </section>

          <section aria-labelledby="profile-access" className="bg-card flex items-start gap-3 rounded-xl border p-4">
            <span
              aria-hidden="true"
              className="bg-ok-subtle text-ok-subtle-foreground flex size-11 shrink-0 items-center justify-center rounded-full"
            >
              <ShieldCheck className="size-5" />
            </span>
            <div className="space-y-0.5">
              <h2 id="profile-access" className="font-semibold">
                Acceso al portal habilitado
              </h2>
              <p className="text-muted-foreground text-sm text-pretty">
                Recursos Humanos te habilitó el portal el{' '}
                <span className="font-mono tabular-nums">{formatArgentinaDay(employee.access.grantedAt)}</span>,{' '}
                {METHOD_LABELS[employee.access.method]}.
              </p>
            </div>
          </section>
        </div>

        <section
          id="cambiar-contrasena"
          aria-labelledby="profile-password"
          className="bg-card scroll-mt-24 space-y-4 rounded-xl border p-4 sm:p-6"
        >
          <div className="space-y-1">
            <h2 id="profile-password" className="text-base font-semibold">
              Cambiar contraseña
            </h2>
            <p className="text-muted-foreground text-sm text-pretty">
              Al cambiarla cerramos tus otras sesiones abiertas (otros celulares o computadoras).
            </p>
          </div>
          <ChangePasswordForm />
        </section>
      </div>
    </>
  );
}
