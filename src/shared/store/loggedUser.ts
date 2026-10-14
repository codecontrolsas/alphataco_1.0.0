import { switchActiveCompany } from '@/shared/actions/company-user.actions';
import {
  getSessionBootstrap,
  getStoreCompanies,
  getStoreSharedUsers,
  getStoreVehicles,
  type StoreCompany,
  type StoreSharedCompany,
  type StoreSharedUser,
  type StoreVehicle,
} from '@/shared/actions/session.server';
import cookies from 'js-cookie';
import { toast } from 'sonner';
import { create } from 'zustand';
import { useCountriesStore } from './countries';

/**
 * Store de sesión/empresa activa del dashboard legacy.
 *
 * Sólo guarda estado: todo lo que toca la base vive en `@/shared/actions/session.server.ts`
 * (antes el store consultaba PostgREST y se suscribía a realtime desde el navegador).
 *
 * Ya NO guarda empleados ni documentos: el estado documental sale del motor
 * (`Documentacion/shared/compliance`) y cada pantalla lo pide paginado a su server action.
 */
type SessionUser = { id: string; email: string | null };
type StoreProfile = NonNullable<Awaited<ReturnType<typeof getSessionBootstrap>>>['profile'][number];

interface State {
  credentialUser: SessionUser | null;
  profile: StoreProfile[];
  showNoCompanyAlert: boolean;
  showMultiplesCompaniesAlert: boolean;
  allCompanies: StoreCompany[];
  actualCompany: StoreCompany | null;
  setActualCompany: (company: StoreCompany) => Promise<void>;
  vehicles: StoreVehicle[];
  sharedCompanies: StoreSharedCompany[];
  sharedUsers: StoreSharedUser[];
  fetchVehicles: () => Promise<void>;
  loggedUser: () => Promise<void>;
  FetchSharedUsers: () => Promise<void>;
  codeControlRole: string | undefined;
  roleActualCompany: string | undefined;
  active_sidebar: boolean;
  toggleSidebar: () => void;
}

export const useLoggedUserStore = create<State>((set, get) => {
  const toggleSidebar = () => {
    set({ active_sidebar: !get().active_sidebar });
  };

  const handleActualCompanyRole = () => {
    const profileId = get().profile[0]?.id;
    const user = get().sharedUsers.find((e) => e.profile_id.id === profileId);
    set({ roleActualCompany: user?.role || undefined });
  };

  const FetchSharedUsers = async () => {
    const companyId = get().actualCompany?.id;
    if (!companyId) return;
    const sharedUsers = await getStoreSharedUsers(companyId);
    set({ sharedUsers });
    handleActualCompanyRole();
  };

  const fetchVehicles = async () => {
    const companyId = get().actualCompany?.id;
    if (!companyId) return;
    const vehicles = await getStoreVehicles(companyId);
    set({ vehicles });
  };

  const setActualCompany = async (company: StoreCompany) => {
    const previous = get().actualCompany;
    set({ actualCompany: company });
    if (!company.id) return;

    // La empresa activa (JWT + cookie `actualComp`, que es httpOnly) la fija el servidor
    // tras validar la pertenencia; el cliente sólo guarda el rótulo que muestra la UI.
    cookies.set('actualCompName', company.company_name);

    // Se espera Y se mira el resultado: hasta que el servidor no la fije no hay empresa
    // activa (ni permisos, que son por empresa), y si la rechaza hay que volver atrás — si
    // no, la UI queda mostrando una empresa que el servidor no va a servir.
    const switched = await switchActiveCompany(company.id);
    if (!switched.ok) {
      set({ actualCompany: previous });
      if (previous?.company_name) cookies.set('actualCompName', previous.company_name);
      else cookies.remove('actualCompName');
      toast.error(switched.error ?? 'No se pudo cambiar de empresa');
      return;
    }

    void useCountriesStore.getState().documentTypes(company.id);
    void fetchVehicles();
    void FetchSharedUsers();
    handleActualCompanyRole();
  };

  /** Selección de empresa activa: la guardada en localStorage, la por defecto, la única o la primera compartida. */
  const selectCompany = async () => {
    const { allCompanies, sharedCompanies } = await getStoreCompanies();
    set({ allCompanies, sharedCompanies });

    const savedCompany = typeof window !== 'undefined' ? window.localStorage.getItem('company_id') : null;
    if (savedCompany) {
      const saved = sharedCompanies.find((sc) => sc.company_id.id === JSON.parse(savedCompany))?.company_id;
      if (saved) {
        await setActualCompany(saved);
        return;
      }
    }

    const byDefault = allCompanies.filter((company) => company.by_defect);
    if (allCompanies.length > 1) {
      if (byDefault.length > 0) {
        await setActualCompany(byDefault[0]);
      } else {
        set({ showMultiplesCompaniesAlert: true });
      }
    }
    if (allCompanies.length === 1) {
      set({ showMultiplesCompaniesAlert: false });
      await setActualCompany(allCompanies[0]);
    }
    if (allCompanies.length === 0 && sharedCompanies.length > 0) {
      await setActualCompany(sharedCompanies[0].company_id);
    }
    if (allCompanies.length === 0 && sharedCompanies.length === 0) {
      if (typeof window !== 'undefined' && window.location.pathname !== '/dashboard/configuration/companies/new') return;
      set({ showNoCompanyAlert: true });
    }
  };

  const loggedUser = async () => {
    const bootstrap = await getSessionBootstrap();
    if (!bootstrap) return;
    set({
      credentialUser: bootstrap.credentialUser,
      profile: bootstrap.profile,
      codeControlRole: bootstrap.profile[0]?.role ?? undefined,
    });
    if (bootstrap.profile[0]?.id) await selectCompany();
  };

  return {
    credentialUser: null,
    profile: [],
    FetchSharedUsers,
    showNoCompanyAlert: false,
    showMultiplesCompaniesAlert: false,
    allCompanies: [],
    actualCompany: null,
    setActualCompany,
    vehicles: [],
    sharedUsers: [],
    fetchVehicles,
    sharedCompanies: [],
    loggedUser,
    codeControlRole: undefined,
    roleActualCompany: undefined,
    toggleSidebar,
    active_sidebar: false,
  };
});
