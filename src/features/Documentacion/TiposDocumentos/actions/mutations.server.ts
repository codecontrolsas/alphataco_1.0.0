'use server';

import type { Prisma } from '@/generated/prisma/client';
import { document_applies } from '@/generated/prisma/enums';
import { Logger } from '@/lib/logger';
import { withActor } from '@/shared/lib/actor';
import { prisma } from '@/shared/lib/prisma';
import { getSessionUserId } from '@/shared/lib/session';
import { getActiveCompanyId } from '@/shared/lib/tenant';
import type { z } from 'zod';
import { refreshDocumentStatus } from '../../shared/compliance/server/document-status.server';
import { assertDocTypeIdPermission, assertDocTypePermission } from '../lib/document-type-permissions';
import { findScopedDocumentType } from '../lib/document-type-scope';
import {
  createDocumentTypeSchema,
  firstSchemaError,
  updateDocumentTypeSchema,
  type CreateDocumentTypeData,
  type UpdateDocumentTypeData,
} from '../schemas/document-type.schema';

const logger = new Logger('features/TiposDocumentos/mutations');

/**
 * Actor de la transacción: los triggers de auditoría de `documents_*` leen `app_current_user_id()`. Sin sesión no hay mutación posible.
 */
async function requireActor(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('Sesión requerida');
  return userId;
}

// ============================================================================
// CRUD MUTATIONS
// ============================================================================

export type CreateDocumentTypeInput = z.input<typeof createDocumentTypeSchema>;

/**
 * Crea un nuevo tipo de documento.
 */
export async function createDocumentType(input: CreateDocumentTypeInput) {
  const parsed = createDocumentTypeSchema.safeParse(input);
  if (!parsed.success) throw new Error(firstSchemaError(parsed.error));
  const data: CreateDocumentTypeData = parsed.data;

  const companyId = await getActiveCompanyId();
  const actor = await requireActor();
  await assertDocTypePermission(data.applies, 'create');

  logger.debug('Creando tipo de documento', { data: { name: data.name, applies: data.applies } });

  try {
    const created = await withActor(actor, async (tx) => {
      const row = await tx.document_types.create({
        data: {
          name: data.name,
          applies: data.applies,
          equipment_type: data.equipment_type ?? null,
          mandatory: data.mandatory,
          explired: data.explired,
          special: data.special,
          multiresource: data.multiresource,
          has_policy_number: data.has_policy_number ?? false,
          is_it_montlhy: data.is_it_montlhy ?? false,
          private: data.private ?? false,
          down_document: data.down_document ?? false,
          available_for_pre_file: data.available_for_pre_file ?? false,
          description: data.description ?? null,
          conditions: (data.conditions ?? []) as Prisma.InputJsonValue[],
        },
        select: { id: true },
      });
      // Un tipo nuevo cambia lo que se exige a toda la empresa: se refresca el cache de status.
      await refreshCompanyStatus(tx, data.applies, companyId);
      return row;
    });

    logger.info('Tipo de documento creado', { data: { id: created.id } });
    return created;
  } catch (error) {
    logger.error('Error al crear tipo de documento', { data: { error } });
    throw error;
  }
}

export type UpdateDocumentTypeInput = z.input<typeof updateDocumentTypeSchema>;

/**
 * Actualiza un tipo de documento existente.
 */
export async function updateDocumentType(id: string, input: UpdateDocumentTypeInput) {
  const parsed = updateDocumentTypeSchema.safeParse(input);
  if (!parsed.success) throw new Error(firstSchemaError(parsed.error));
  const data: UpdateDocumentTypeData = parsed.data;

  const companyId = await getActiveCompanyId();
  const actor = await requireActor();
  await assertDocTypeIdPermission(id, companyId, 'update');

  logger.debug('Actualizando tipo de documento', { data: { id } });

  try {
    // Perímetro de escritura: sólo tipos propios.
    const current = await findScopedDocumentType(prisma, id, companyId, { id: true, applies: true }, {}, 'write');

    // Build update payload explicitly so Prisma can type-check it
    const updatePayload: Prisma.document_typesUpdateInput = {};
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.applies !== undefined) {
      if (data.applies !== current.applies) {
        // Las filas de documentos viven en una tabla por alcance: con archivos cargados quedarían en la tabla equivocada.
        await assertNoUploadedDocuments(id, current.applies);
        await assertDocTypePermission(data.applies, 'update');
      }
      updatePayload.applies = data.applies;
    }
    if (data.equipment_type !== undefined) updatePayload.equipment_type = data.equipment_type;
    if (data.mandatory !== undefined) updatePayload.mandatory = data.mandatory;
    if (data.explired !== undefined) updatePayload.explired = data.explired;
    if (data.special !== undefined) updatePayload.special = data.special;
    if (data.multiresource !== undefined) updatePayload.multiresource = data.multiresource;
    if (data.has_policy_number !== undefined) updatePayload.has_policy_number = data.has_policy_number;
    if (data.is_it_montlhy !== undefined) updatePayload.is_it_montlhy = data.is_it_montlhy;
    if (data.private !== undefined) updatePayload.private = data.private;
    if (data.down_document !== undefined) updatePayload.down_document = data.down_document;
    if (data.available_for_pre_file !== undefined) updatePayload.available_for_pre_file = data.available_for_pre_file;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.conditions !== undefined) updatePayload.conditions = data.conditions as Prisma.InputJsonValue[];

    const updated = await withActor(actor, async (tx) => {
      const row = await tx.document_types.update({
        where: { id },
        data: updatePayload,
        select: { id: true },
      });
      // Cambiar condiciones/obligatoriedad/recurso afecta a toda la empresa: se refresca el
      // status de ese tipo de recurso (y del anterior si el tipo cambió de `applies`).
      await refreshCompanyStatus(tx, current.applies, companyId);
      if (data.applies !== undefined && data.applies !== current.applies) {
        await refreshCompanyStatus(tx, data.applies, companyId);
      }
      return row;
    });

    logger.info('Tipo de documento actualizado', { data: { id: updated.id } });
    return updated;
  } catch (error) {
    logger.error('Error al actualizar tipo de documento', { data: { error, id } });
    throw error;
  }
}

/**
 * Rechaza el cambio de alcance (`applies`) de un tipo que ya tiene documentos con archivo: las filas viven
 * en `documents_employees` / `documents_equipment` / `documents_company` según el alcance, y mover el tipo
 * las dejaría huérfanas en la tabla equivocada.
 */
async function assertNoUploadedDocuments(docTypeId: string, applies: document_applies): Promise<void> {
  const where = { id_document_types: docTypeId, document_path: { not: null } };
  const uploaded =
    applies === document_applies.Persona
      ? await prisma.documents_employees.count({ where })
      : applies === document_applies.Equipos
        ? await prisma.documents_equipment.count({ where })
        : await prisma.documents_company.count({ where });
  if (uploaded > 0) {
    throw new Error(
      `No se puede cambiar el alcance: el tipo tiene ${uploaded} documento(s) cargado(s). Cree un tipo nuevo o desactive este.`
    );
  }
}

// ============================================================================
// STATUS DE RECURSOS
// ============================================================================

/**
 * Refresca el cache de status (`employees.status` / `vehicles.status`) de TODA la empresa para
 * el tipo de recurso del documento. Lo escribe únicamente el motor de cumplimiento
 * (`refreshDocumentStatus`): un cambio en un tipo (alta, edición, baja, alta lógica, borrado)
 * altera lo que se exige a todos los recursos, no a un conjunto puntual. Los documentos de la
 * empresa (`Empresa`) no tienen status cacheado.
 */
async function refreshCompanyStatus(tx: Prisma.TransactionClient, applies: document_applies, companyId: string) {
  if (applies === document_applies.Persona || applies === document_applies.Equipos) {
    await refreshDocumentStatus(tx, applies, { companyId });
  }
}

// ============================================================================
// IS_ACTIVE FLOW — deactivate / hard-delete / reactivate
// ============================================================================

/**
 * Desactiva un tipo de documento (soft delete via is_active = false).
 * Modelo derivado: no hay filas vacías que borrar; sólo se refresca el status de la empresa.
 */
export async function deactivateDocumentType(docTypeId: string) {
  const companyId = await getActiveCompanyId();
  const actor = await requireActor();
  await assertDocTypeIdPermission(docTypeId, companyId, 'update');

  logger.info('Desactivando tipo de documento', { data: { docTypeId } });

  try {
    return await withActor(actor, async (tx) => {
      // Perímetro de escritura: sólo tipos propios.
      const docType = await findScopedDocumentType(
        tx,
        docTypeId,
        companyId,
        { id: true, applies: true, is_active: true },
        {},
        'write'
      );
      if (!docType.is_active) throw new Error('Tipo de documento no encontrado o ya esta inactivo');

      await tx.document_types.update({
        where: { id: docTypeId },
        data: { is_active: false },
      });

      await refreshCompanyStatus(tx, docType.applies, companyId);

      return { success: true };
    });
  } catch (error) {
    logger.error('Error al desactivar tipo de documento', { data: { error, docTypeId } });
    throw error;
  }
}

/**
 * Elimina permanentemente un tipo de documento.
 * Solo permitido si NO hay documentos subidos (document_path IS NOT NULL) asociados.
 * Recalcula el status de los recursos de la empresa.
 */
export async function hardDeleteDocumentType(docTypeId: string) {
  const companyId = await getActiveCompanyId();
  const actor = await requireActor();
  await assertDocTypeIdPermission(docTypeId, companyId, 'update');

  logger.info('Eliminando permanentemente tipo de documento', { data: { docTypeId } });

  try {
    return await withActor(actor, async (tx) => {
      // Perímetro de escritura: sólo tipos propios.
      const docType = await findScopedDocumentType(
        tx,
        docTypeId,
        companyId,
        { id: true, applies: true, mandatory: true },
        {},
        'write'
      );

      // El conteo de subidos es GLOBAL a propósito: `delete` del tipo cascadea todas sus filas.
      let uploadedCount = 0;
      if (docType.applies === document_applies.Persona) {
        uploadedCount = await tx.documents_employees.count({
          where: { id_document_types: docTypeId, document_path: { not: null } },
        });
      } else if (docType.applies === document_applies.Equipos) {
        uploadedCount = await tx.documents_equipment.count({
          where: { id_document_types: docTypeId, document_path: { not: null } },
        });
      } else {
        uploadedCount = await tx.documents_company.count({
          where: { id_document_types: docTypeId, document_path: { not: null } },
        });
      }

      if (uploadedCount > 0) {
        throw new Error(
          `No se puede eliminar: hay ${uploadedCount} documento(s) subido(s). Desactive el tipo en su lugar.`
        );
      }

      // El borrado cascadea (ON DELETE CASCADE) las filas del tipo: no hay filas vacías que limpiar a mano.
      await tx.document_types.delete({ where: { id: docTypeId } });

      await refreshCompanyStatus(tx, docType.applies, companyId);

      return { success: true };
    });
  } catch (error) {
    logger.error('Error al eliminar tipo de documento', { data: { error, docTypeId } });
    throw error;
  }
}

/**
 * Reactiva un tipo de documento (is_active = true).
 * Modelo derivado: no se crean filas pendientes; sólo se refresca el status de la empresa.
 */
export async function reactivateDocumentType(docTypeId: string) {
  const companyId = await getActiveCompanyId();
  const actor = await requireActor();
  await assertDocTypeIdPermission(docTypeId, companyId, 'update');

  logger.info('Reactivando tipo de documento', { data: { docTypeId } });

  try {
    return await withActor(actor, async (tx) => {
      // Perímetro de escritura: sólo tipos propios.
      const docType = await findScopedDocumentType(
        tx,
        docTypeId,
        companyId,
        { id: true, applies: true, is_active: true },
        {},
        'write'
      );
      if (docType.is_active) throw new Error('Tipo de documento no encontrado o ya esta activo');

      await tx.document_types.update({
        where: { id: docTypeId },
        data: { is_active: true },
      });

      await refreshCompanyStatus(tx, docType.applies, companyId);

      return { success: true };
    });
  } catch (error) {
    logger.error('Error al reactivar tipo de documento', { data: { error, docTypeId } });
    throw error;
  }
}
