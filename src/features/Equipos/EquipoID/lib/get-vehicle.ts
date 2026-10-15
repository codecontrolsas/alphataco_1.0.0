import { cache } from 'react';
import { getVehicleById } from './actions/vehicle-actions';

/**
 * `getVehicleById` memoizado por request: la página y `generateMetadata` piden la misma ficha en el
 * mismo render y sin esto la consultan dos veces. Va en un módulo aparte porque un archivo
 * `'use server'` sólo puede exportar funciones async.
 */
export const getVehicleByIdCached = cache(getVehicleById);
