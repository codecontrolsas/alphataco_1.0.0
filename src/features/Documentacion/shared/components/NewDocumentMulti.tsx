'use client';

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import InfoComponent from '@/shared/components/common/InfoComponent';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getMultiDocumentUploadData } from '../actions/multi-upload-data.server';
import UploadDocumentMultiEmployee from './UploadDocumentMultiEmployee';
import UploadDocumentMultiEquipment from './UploadDocumentMultiEquipment';

/**
 * Diálogo de carga multirrecurso. Sus datos (empleados o equipos, tipos, empresa) se piden al abrirlo y
 * se vuelven a pedir cada vez (sin caché): nunca ofrece un recurso o un tipo desactualizado, y la lista
 * de documentos no paga esa carga si nadie abre el diálogo.
 */
function NewDocumentMulti({ onlyEmployees, onlyEquipment }: { onlyEmployees?: boolean; onlyEquipment?: boolean }) {
  const [open, setOpen] = useState(false);
  // La carga se abre siempre desde una lista de personal o de equipos: nunca de las dos a la vez.
  const showEquipment = Boolean(onlyEquipment) && !onlyEmployees;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['multi-document-upload-data', Boolean(onlyEmployees), Boolean(onlyEquipment)],
    queryFn: () => getMultiDocumentUploadData({ onlyEmployees, onlyEquipment }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="brand">Documento Multirecurso</Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-h-[90dvh] w-full overflow-y-auto">
        <AlertDialogTitle>
          {showEquipment ? 'Documento multirrecurso de equipos' : 'Documento multirrecurso del personal'}
        </AlertDialogTitle>
        <InfoComponent
          iconSize="lg"
          size="sm"
          message={
            'Desde aqui solo podras subir documentos faltantes, si deseas reemplazar o eliminar un documento, dirigete al documento en cuestion y realiza la accion deseada.'
          }
        />
        {isLoading && (
          <div className="space-y-3" role="status" aria-label="Cargando datos del formulario">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {isError && (
          <div className="space-y-2 text-sm" role="alert">
            <p>No se pudieron cargar los datos del formulario.</p>
            <Button type="button" variant="outline" onClick={() => refetch()}>
              Reintentar
            </Button>
          </div>
        )}
        {data &&
          (showEquipment ? (
            <UploadDocumentMultiEquipment
              currentCompany={data.currentCompany}
              allDocumentTypes={data.equipmentDocumentTypes}
              equipments={data.equipments}
            />
          ) : (
            <UploadDocumentMultiEmployee
              employees={data.employees}
              allDocumentTypes={data.employeeDocumentTypes}
              currentCompany={data.currentCompany}
            />
          ))}
        <AlertDialogFooter className="hidden">
          <AlertDialogCancel id="close-create-document-modal">Cerrar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default NewDocumentMulti;
