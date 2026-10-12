import { getCurrentUserProfile } from '../../actions/user-profile';
import { NavUser } from '../NavUser';

/**
 * Async Server Component — carga el perfil de la sesión y renderiza el menú del footer.
 * Se envuelve en Suspense desde `AppSidebar` para streaming independiente.
 *
 * El acceso a `/admin/panel` (heredado de GH) se quitó: esa ruta no existe en alphataco.
 */
export async function NavUserAsync() {
  const user = await getCurrentUserProfile();

  return <NavUser user={user} />;
}
