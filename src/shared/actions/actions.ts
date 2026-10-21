'use server';

import { cookies } from 'next/headers';

/**
 * Server Action para establecer la cookie de pestañas principales
 * @param path La ruta de la página
 * @param mainTab La pestaña principal activa
 */
export async function setMainTabCookie(path: string, mainTab: string) {
  const cookieKey = `main_tab_${path.replace(/\//g, '_')}`;

  const cookieStore = await cookies();
  cookieStore.set(cookieKey, mainTab, {
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 días
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

/**
 * Server Action para establecer la cookie de sub-pestañas
 * @param path La ruta de la página
 * @param mainTab La pestaña principal activa
 * @param subTab La sub-pestaña activa
 */
export async function setSubTabCookie(path: string, mainTab: string, subTab: string) {
  const cookieKey = `sub_tab_${path.replace(/\//g, '_')}_${mainTab.replace(/\s+/g, '_')}`;

  const cookieStore = await cookies();
  cookieStore.set(cookieKey, subTab, {
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 días
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

/**
 * Función para obtener la pestaña principal guardada
 */
export async function getMainTabCookie(path: string): Promise<string | null> {
  const cookieKey = `main_tab_${path.replace(/\//g, '_')}`;
  const cookieStore = await cookies();
  return cookieStore.get(cookieKey)?.value || null;
}

/**
 * Función para obtener la sub-pestaña guardada
 */
export async function getSubTabCookie(path: string, mainTab: string): Promise<string | null> {
  const cookieKey = `sub_tab_${path.replace(/\//g, '_')}_${mainTab.replace(/\s+/g, '_')}`;
  const cookieStore = await cookies();
  return cookieStore.get(cookieKey)?.value || null;
}
