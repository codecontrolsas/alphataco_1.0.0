import { getPortalEmployeeForPage } from '@/features/Portal/actions/perimeter';
import { formatDateOnlyAr } from '@/shared/lib/argentina-time';
import { ChangePasswordForm } from './ChangePasswordForm';
import { PortalPageHeader } from './PortalPageHeader';

/** Perfil del empleado: datos del legajo de solo lectura y cambio de contraseña. */
export async function PortalProfile() {
  const employee = await getPortalEmployeeForPage();
  const rows: { label: string; value: string | null; mono?: boolean }[] = [
    { label: 'Legajo', value: employee.file, mono: true },
    { label: 'Apellido y nombre', value: `${employee.lastname} ${employee.firstname}`.trim() },
    { label: 'Puesto', value: employee.position },
    { label: 'Sector', value: employee.sector },
    {
      label: 'Fecha de ingreso',
      value: employee.admissionDate ? formatDateOnlyAr(employee.admissionDate) : null,
      mono: true,
    },
    { label: 'Correo del legajo', value: employee.email },
    { label: 'Empresa', value: employee.companyName },
  ];

  return (
    <>
      <PortalPageHeader
        title="Mi perfil"
        description="Tus datos según el legajo. Si algo no es correcto, avisale a Recursos Humanos."
      />
      <section aria-labelledby="profile-data" className="bg-card rounded-xl border">
        <h2 id="profile-data" className="sr-only">
          Datos del legajo
        </h2>
        <dl className="divide-y">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-1 px-4 py-3 sm:grid-cols-[12rem_1fr] sm:gap-4">
              <dt className="text-muted-foreground text-sm">{row.label}</dt>
              <dd className={row.mono ? 'font-mono tabular-nums break-words' : 'break-words'}>{row.value || '—'}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="profile-password" className="bg-card mt-6 space-y-4 rounded-xl border p-4">
        <h2 id="profile-password" className="font-semibold">
          Cambiar contraseña
        </h2>
        <div className="max-w-sm">
          <ChangePasswordForm />
        </div>
      </section>
    </>
  );
}
