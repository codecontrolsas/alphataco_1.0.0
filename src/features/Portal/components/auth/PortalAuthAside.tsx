import { FileCheck2, FileSignature, GraduationCap } from 'lucide-react';

const STEPS = [
  {
    icon: FileCheck2,
    title: 'Leé y aceptá tus documentos',
    text: 'Normas y procedimientos de la empresa, con tu respuesta registrada.',
  },
  {
    icon: GraduationCap,
    title: 'Hacé tus capacitaciones',
    text: 'Material para leer y examen desde el celular o la computadora.',
  },
  {
    icon: FileSignature,
    title: 'Firmá tus constancias',
    text: 'Con tu contraseña: quedan guardadas en tu legajo.',
  },
] as const;

/**
 * Panel derecho de las pantallas de acceso del portal (desde `lg`). Cuenta qué se hace en el portal; no muestra datos
 * de ejemplo. Siempre oscuro (`dark` en el subárbol), con los tokens de la marca.
 */
export function PortalAuthAside() {
  return (
    <aside
      aria-labelledby="portal-auth-aside"
      className="dark bg-background text-foreground relative hidden overflow-hidden px-12 py-8 lg:flex lg:flex-col lg:justify-between"
    >
      <div className="bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_70%_40%,#000_20%,transparent_75%)] bg-[size:48px_48px]" />
      <p className="text-muted-foreground relative font-mono text-xs tracking-wider uppercase">Portal del empleado</p>
      <div className="relative max-w-md">
        <h2 id="portal-auth-aside" className="text-4xl leading-tight font-semibold tracking-tight text-balance">
          Lo que la empresa te pide, en un solo lugar
        </h2>
        <ul className="mt-10 space-y-6">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="bg-brand-subtle text-brand-subtle-foreground flex size-11 shrink-0 items-center justify-center rounded-xl"
              >
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-medium">{title}</span>
                <span className="text-muted-foreground block text-sm text-pretty">{text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-muted-foreground relative text-sm">El acceso lo habilita Recursos Humanos.</p>
    </aside>
  );
}
