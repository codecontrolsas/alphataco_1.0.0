import { PostHog } from 'posthog-node';

let posthogInstance: PostHog | null = null;

/**
 * Obtiene la instancia singleton de PostHog para uso en el servidor.
 * Según la documentación oficial de PostHog para Next.js.
 */
export function getPostHogServer(): PostHog {
  if (!posthogInstance) {
    posthogInstance = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogInstance;
}
