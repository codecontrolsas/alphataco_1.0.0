'use server';

import { requireResourceAccess } from '@/features/Mantenimiento/shared/resource-access.server';
import { assertValidImageFile, sanitizeFileName } from '@/features/Mantenimiento/shared/utils/repair-images';
import { Logger } from '@/lib/logger';
import { storagePublicUrl, storageUpload } from '@/shared/lib/storage';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

const logger = new Logger('features/Mantenimiento/Gomeria/Ordenes/uploadDiscardPhoto');

const BUCKET = 'tire-discards';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Sube la foto de descarte/reparación de una cubierta y devuelve su URL estable.
 *
 * Server Action: el navegador ya no habla con el storage. La carpeta se arma en el
 * servidor como `<empresa>/<vehículo>/...` y la empresa sale del vehículo, no de la
 * sesión: el descarte también se registra desde el QR, donde el operario puede no ser
 * miembro de la empresa del equipo. Por eso el perímetro es de dos caminos
 * (`requireResourceAccess`): operario del QR con legajo de la empresa del equipo, o usuario
 * del dashboard con permiso sobre órdenes de gomería / cubiertas del equipo en esa empresa.
 */
export async function uploadDiscardPhoto(file: File, vehicleId: string): Promise<string> {
  // Tipo y tamaño se validan en el servidor: el `accept` del input no es una garantía.
  assertValidImageFile(file, MAX_FILE_SIZE);
  z.string().uuid('Equipo inválido').parse(vehicleId);

  const { companyId } = await requireResourceAccess('vehicle', vehicleId, {
    dashboardPermissions: [
      { module: 'mantenimiento', tab: 'ordenes_gomeria', action: 'update' },
      { module: 'mantenimiento', tab: 'ordenes_gomeria', action: 'create' },
      { module: 'equipos', tab: 'cubiertas-equipo', action: 'update' },
    ],
  });

  // id único: dos subidas en el mismo milisegundo con igual nombre no se pisan
  const path = `${companyId}/${vehicleId}/${Date.now()}_${randomUUID().slice(0, 8)}_${sanitizeFileName(file.name)}`;

  logger.debug('Subiendo foto de descarte', { data: { path, size: file.size } });

  const result = await storageUpload(BUCKET, path, file);

  if (!result.ok) {
    logger.error('Error al subir la foto de descarte', { data: { error: result.error, path } });
    throw new Error(`Error al subir la foto: ${result.error}`);
  }

  return storagePublicUrl(BUCKET, path);
}
