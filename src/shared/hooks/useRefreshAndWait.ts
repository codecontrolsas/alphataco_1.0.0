'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useTransition } from 'react';

/**
 * `router.refresh()` que se puede esperar: la promesa se resuelve cuando el servidor terminó de
 * volver a renderizar la página. Sirve para dejar abierto un `toast.promise` (o no cambiar de
 * vista) hasta que los datos nuevos están en pantalla.
 *
 * El `useEffect` sincroniza con un sistema externo (la transición del router de Next), que es
 * un uso válido: no hay otra forma de enterarse de cuándo termina.
 */
export function useRefreshAndWait() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const resolveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isRefreshing && resolveRef.current) {
      resolveRef.current();
      resolveRef.current = null;
    }
  }, [isRefreshing]);

  const refreshAndWait = useCallback(
    () =>
      new Promise<void>((resolve) => {
        resolveRef.current = resolve;
        startTransition(() => router.refresh());
      }),
    [router]
  );

  return { refreshAndWait, isRefreshing };
}
