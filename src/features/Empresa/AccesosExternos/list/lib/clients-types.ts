import type { getExternalApiClientsPaginated } from '../actions.server';

/** Fila de la lista de accesos externos, inferida de la lectura. */
export type ExternalApiClientListItem = Awaited<ReturnType<typeof getExternalApiClientsPaginated>>['data'][number];
