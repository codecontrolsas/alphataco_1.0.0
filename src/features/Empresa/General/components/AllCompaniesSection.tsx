'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { CardsGrid } from '@/features/Empresa/General/components/CardsGrid';
import { COMPANIES_QUERY_KEY, useCompanyData } from '@/features/Empresa/General/hooks/useCompanyData';
import { formatCompanyName } from '@/lib/utils';
import type { StoreCompany } from '@/shared/actions/session.server';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StateBlock } from '@/shared/components/common/StateBlock';
import { useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { useState } from 'react';

/**
 * Listado de todas las compañías del usuario con el detalle en un panel lateral.
 *
 * Antes la página montaba dos canales realtime de Supabase (tabla `company` y `storage.objects`)
 * que llamaban a `fetchCompanies()` en cada cambio. Los canales se eliminan: los datos salen de
 * React Query (`useCompanyData`) y el refresco es por invalidación de `COMPANIES_QUERY_KEY`, que
 * es lo que hacen el alta y la edición de empresa (el logo se refleja igual, porque su URL vive
 * en `company.company_logo`).
 */
export function AllCompaniesSection() {
  const queryClient = useQueryClient();
  const { allCompanies, isLoading } = useCompanyData();
  const [selectedCard, setSelectedCard] = useState<StoreCompany | null>(null);

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    setSelectedCard(null);
    queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY });
  };

  const activeCount = allCompanies?.filter((company) => company.is_active).length ?? 0;

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Todas las compañías" description="Aquí se verán todas las compañías" />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : activeCount === 0 ? (
        <StateBlock variant="empty" icon={Building2} title="No hay compañías activas" />
      ) : (
        <CardsGrid allCompanies={allCompanies} onCardClick={setSelectedCard} />
      )}

      <Sheet open={selectedCard !== null} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selectedCard && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3 pr-6">
                  <Avatar className="size-14 shrink-0">
                    <AvatarImage
                      src={selectedCard.company_logo ?? undefined}
                      alt="Logo de la empresa"
                      className="object-contain"
                    />
                    <AvatarFallback>
                      <Building2 className="size-6" aria-hidden="true" />
                    </AvatarFallback>
                  </Avatar>
                  <SheetTitle className="min-w-0 break-words">
                    {formatCompanyName(selectedCard.company_name)}
                  </SheetTitle>
                </div>
                <SheetDescription className="whitespace-pre-line">
                  {selectedCard.description || 'Sin descripción'}
                </SheetDescription>
              </SheetHeader>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}
