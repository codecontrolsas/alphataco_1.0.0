import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatCompanyName } from '@/lib/utils';
import type { StoreCompany } from '@/shared/actions/session.server';
import { Building2 } from 'lucide-react';

interface CardsGridProps {
  allCompanies: StoreCompany[];
  onCardClick: (card: StoreCompany) => void;
}

/** Grilla de tarjetas de las empresas activas; cada una es un botón que abre el detalle. */
export function CardsGrid({ allCompanies, onCardClick }: CardsGridProps) {
  const activeCompanies = allCompanies?.filter((company) => company.is_active) ?? [];
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {activeCompanies.map((company) => (
        <li key={company.id} className="min-w-0">
          <button
            type="button"
            onClick={() => onCardClick(company)}
            className="bg-card hover:bg-muted/50 focus-visible:ring-ring flex min-h-24 w-full min-w-0 items-center gap-3 rounded-xl border p-4 text-left outline-none transition-colors focus-visible:ring-2"
          >
            <Avatar className="size-12 shrink-0">
              <AvatarImage src={company.company_logo ?? undefined} alt="" className="object-contain" />
              <AvatarFallback>
                <Building2 className="size-5" aria-hidden="true" />
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 text-sm font-medium break-words">{formatCompanyName(company.company_name)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
