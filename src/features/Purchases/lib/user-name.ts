/** Nombre de quien hizo algo en los historiales: nombre completo, si no el correo, si no "Usuario"; `null` si no hay perfil. */
export const userName = (profile: { fullname: string | null; email: string | null } | null) =>
  profile ? profile.fullname ?? profile.email ?? 'Usuario' : null;
