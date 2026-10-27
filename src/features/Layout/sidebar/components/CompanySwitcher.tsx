'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { switchActiveCompany } from '@/shared/actions/company-user.actions';
import Cookies from 'js-cookie';
import { Building2, CheckIcon, ChevronsUpDown, PlusCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import type { CompanyRow, CompanySelectorProps } from '../types/types';

/**
 * Selector de empresa en el header del sidebar — ocupa el lugar del `TeamSwitcher` del bloque
 * sidebar-07, con su mismo boton `size="lg"`.
 *
 * A diferencia del bloque, el desplegable sigue siendo un `Command` dentro de un `Popover` y no
 * un `DropdownMenu`: el buscador ya estaba y hay usuarios con muchas empresas asignadas.
 */
export function CompanySwitcher({
  sharedCompanies,
  allCompanies,
  currentCompany,
  canCreateCompany,
  companyLimitText,
}: CompanySelectorProps) {
  const { isMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<CompanyRow | null>(
    currentCompany?.[0] || allCompanies[0] || null
  );

  const totalCompanies = [...sharedCompanies, ...allCompanies];

  const handleNewCompany = async (company: CompanyRow) => {
    if (!company.id) return;
    // La empresa activa (JWT + cookie `actualComp`) la escribe el servidor tras validar la
    // pertenencia; acá sólo queda el rótulo que muestra la UI.
    const result = await switchActiveCompany(company.id);
    if (!result.ok) {
      toast.error(result.error ?? 'No se pudo cambiar de empresa');
      return;
    }
    Cookies.set('actualCompName', company.company_name);
    setSelectedCompany(company);
    setOpen(false);
    location.reload();
  };

  const groups = [
    {
      label: 'Compañia actual',
      teams:
        totalCompanies?.length === 1
          ? totalCompanies?.map((company) => ({
              label: company?.company_name,
              value: company?.id,
              logo: company?.company_logo,
            }))
          : totalCompanies
              ?.filter((company) => company?.id === selectedCompany?.id)
              ?.map((company) => ({
                label: company?.company_name,
                value: company?.id,
                logo: company?.company_logo,
              })),
    },
    {
      label: 'Otras compañias',
      teams:
        totalCompanies?.length === 1
          ? []
          : totalCompanies
              ?.filter((company) => company?.id !== selectedCompany?.id)
              ?.map((company) => ({
                label: company?.company_name,
                value: company?.id,
                logo: company?.company_logo,
              })),
    },
  ];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <SidebarMenuButton
              size="lg"
              role="combobox"
              aria-expanded={open}
              aria-label="Selecciona una compañía"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="size-8 rounded-lg">
                <AvatarImage
                  src={selectedCompany?.company_logo || ''}
                  alt={selectedCompany?.company_name}
                  className="object-contain"
                />
                <AvatarFallback className="bg-brand text-brand-foreground rounded-lg">
                  <Building2 className="size-4" />
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                {selectedCompany ? (
                  <span className="truncate font-semibold uppercase">{selectedCompany.company_name}</span>
                ) : (
                  <span className="truncate text-muted-foreground">Seleccionar compañía</span>
                )}
                <span className="truncate text-xs text-sidebar-foreground/70">Empresa activa</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
            </SidebarMenuButton>
          </PopoverTrigger>
          <PopoverContent
            className="w-(--radix-popover-trigger-width) min-w-56 p-0"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <Command>
              <CommandList>
                <CommandInput placeholder="Buscar compañia" />
                <CommandEmpty>Compañia no encontrada</CommandEmpty>
                {groups?.map((group) => (
                  <CommandGroup key={group.label} heading={group.label}>
                    {group?.teams?.map((team) => (
                      <CommandItem
                        key={team.value}
                        onSelect={() => {
                          const company = totalCompanies.find((c) => c?.id === team?.value);
                          if (company) {
                            handleNewCompany(company);
                          }
                          setOpen(false);
                        }}
                        className="text-sm"
                      >
                        <Avatar className="mr-2 h-5 w-5">
                          <AvatarImage src={team.logo || ''} alt={team.label} className="size-5 object-contain" />
                          <AvatarFallback className="bg-primary/10">
                            <Building2 className="size-3 text-primary" />
                          </AvatarFallback>
                        </Avatar>
                        {team.label}
                        <CheckIcon
                          className={cn(
                            'ml-auto h-4 w-4',
                            selectedCompany?.id === team.value ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
              <CommandSeparator />
              <div className="w-full p-2">
                {canCreateCompany ? (
                  <Link
                    href="/dashboard/configuration/companies/new"
                    className={cn(buttonVariants({ variant: 'outline' }), 'flex w-full justify-center p-4')}
                  >
                    <PlusCircle className="mr-2 size-4" />
                    Agregar compañía
                  </Link>
                ) : (
                  // Límite de empresas alcanzado (ticket 807): no se ofrece el alta.
                  <p className="text-muted-foreground px-2 py-1.5 text-center text-xs">{companyLimitText}</p>
                )}
              </div>
            </Command>
          </PopoverContent>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
