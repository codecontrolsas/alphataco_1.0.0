import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { PortalEmployee } from '@/features/Portal/actions/perimeter';
import { cn } from '@/lib/utils';

/**
 * Foto del legajo (o iniciales). Se arma en el servidor y viaja como slot a los componentes cliente: la foto es un data
 * URL y no conviene meterla en las props de cada componente interactivo.
 */
export function PortalAvatar({
  employee,
  className,
  decorative = true,
}: {
  employee: Pick<PortalEmployee, 'firstname' | 'lastname' | 'picture'>;
  className?: string;
  /** Al lado del nombre, la foto es decorativa (`alt=""`). */
  decorative?: boolean;
}) {
  const initials = `${employee.firstname[0] ?? ''}${employee.lastname[0] ?? ''}`.toUpperCase();
  const alt = decorative ? '' : `Foto de ${employee.firstname} ${employee.lastname}`.trim();
  return (
    <Avatar className={cn('size-8 shrink-0 rounded-lg', className)}>
      {employee.picture && <AvatarImage src={employee.picture} alt={alt} />}
      <AvatarFallback
        aria-hidden={decorative || undefined}
        className="bg-brand-subtle text-brand-subtle-foreground rounded-[inherit] text-xs font-semibold"
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
