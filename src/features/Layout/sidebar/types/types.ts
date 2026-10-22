import type { fetchUserCompanies } from '@/shared/actions/company.actions';
import type { CurrentUserProfile } from '../actions/user-profile';

/**
 * Empresa tal como la devuelve la capa de datos (Prisma), no el tipo generado de Supabase:
 * `database.types` es lo último que queda de PostgREST y no tiene por qué tipar la UI.
 */
export type CompanyRow = Awaited<ReturnType<typeof fetchUserCompanies>>['allCompanies'][number];

export type CompanySelectorProps = {
  sharedCompanies: CompanyRow[];
  allCompanies: CompanyRow[];
  currentCompany: CompanyRow[];
};

export type UserMenuProps = {
  /** Perfil de la sesión, tipado desde la query de Prisma (no desde los tipos generados por Supabase). */
  user: CurrentUserProfile;
};
