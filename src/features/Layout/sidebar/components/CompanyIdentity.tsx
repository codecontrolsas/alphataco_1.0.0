import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { Building2 } from 'lucide-react';

interface CompanyIdentityProps {
  name: string | null;
  logo: string | null;
}

/**
 * Identidad de la empresa en el header del sidebar cuando no hay nada que elegir (instancia de una sola empresa, o
 * una sola empresa sin lugar para otra): logo y nombre, sin desplegable ni controles. Mismo alto y sangría que el
 * selector (`SidebarMenuButton size="lg"`), así el header no salta entre un modo y otro, y en el sidebar colapsado
 * queda solo el logo.
 */
export function CompanyIdentity({ name, logo }: CompanyIdentityProps) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div
          data-slot="company-identity"
          title={name ?? undefined}
          className="flex h-12 w-full min-w-0 items-center gap-2 rounded-md p-2 text-left text-sm group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-0!"
        >
          <Avatar className="size-8 shrink-0 rounded-lg">
            <AvatarImage src={logo || ''} alt="" className="object-contain" />
            <AvatarFallback className="bg-brand text-brand-foreground rounded-lg">
              <Building2 className="size-4" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate font-semibold uppercase group-data-[collapsible=icon]:hidden">
            {name ?? 'Sin empresa'}
          </span>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
