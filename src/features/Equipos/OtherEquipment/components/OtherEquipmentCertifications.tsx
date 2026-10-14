'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { EnhancedDatePicker } from '@/components/ui/enhanced-datepicket';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  createOtherEquipmentCertification,
  deleteOtherEquipmentCertification,
  getOtherEquipmentCertifications,
  type OtherEquipmentCertification,
} from '@/features/Equipos/OtherEquipment/actions/actionsServer';
import { PermissionGuard } from '@/features/Permissions';
import { Logger } from '@/lib/logger';
import { argentinaDate, formatArgentinaDay } from '@/shared/lib/argentina-time';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Plus, Trash2 } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/es';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const logger = new Logger('OtherEquipmentCertifications');

const CERTIFICATIONS_QUERY_KEY = ['other-equipment-certifications'] as const;

const ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.webp';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const certificationSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  expiration_date: z.date().nullable().optional(),
});

type CertificationFormData = z.infer<typeof certificationSchema>;

interface OtherEquipmentCertificationsProps {
  equipmentId: string;
  initialData: OtherEquipmentCertification[];
}

export function OtherEquipmentCertifications({ equipmentId, initialData }: OtherEquipmentCertificationsProps) {
  const queryClient = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [certToDelete, setCertToDelete] = useState<OtherEquipmentCertification | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: certifications } = useQuery({
    queryKey: [...CERTIFICATIONS_QUERY_KEY, equipmentId],
    queryFn: () => getOtherEquipmentCertifications(equipmentId),
    initialData,
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<CertificationFormData>({
    resolver: zodResolver(certificationSchema),
    defaultValues: {
      name: '',
      expiration_date: null,
    },
  });

  // El archivo viaja en el FormData y lo sube la server action; la fecha va
  // como 'YYYY-MM-DD' formateada en el navegador para no correr el día por la zona horaria.
  const createMutation = useMutation({
    mutationFn: async (data: CertificationFormData) => {
      const formData = new FormData();
      formData.set('equipmentId', equipmentId);
      formData.set('name', data.name);
      formData.set('expiration_date', data.expiration_date ? moment(data.expiration_date).format('YYYY-MM-DD') : '');
      if (selectedFile) formData.set('file', selectedFile);
      return createOtherEquipmentCertification(formData);
    },
    onSuccess: () => {
      toast.success('Documento creado correctamente');
      queryClient.invalidateQueries({ queryKey: [...CERTIFICATIONS_QUERY_KEY, equipmentId] });
      form.reset();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setOpenCreate(false);
    },
    onError: (error: unknown) => {
      logger.error('Error al crear documento', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al crear el documento');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteOtherEquipmentCertification(id),
    onSuccess: () => {
      toast.success('Documento eliminado correctamente');
      queryClient.invalidateQueries({ queryKey: [...CERTIFICATIONS_QUERY_KEY, equipmentId] });
      setCertToDelete(null);
    },
    onError: (error) => {
      logger.error('Error al eliminar documento', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'Error al eliminar el documento');
    },
  });

  const onSubmit = (data: CertificationFormData) => {
    createMutation.mutate(data);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      toast.error('El archivo no puede superar los 10MB');
      e.target.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      form.reset();
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    setOpenCreate(open);
  };

  // Vencimientos contra el "hoy" argentino (el navegador puede estar en otra zona)
  const isExpiringSoon = (date: string | null): boolean => {
    if (!date) return false;
    return moment(date, 'YYYY-MM-DD').diff(moment(argentinaDate(), 'YYYY-MM-DD'), 'days') <= 30;
  };

  const isExpired = (date: string | null): boolean => {
    if (!date) return false;
    return moment(date, 'YYYY-MM-DD').isBefore(moment(argentinaDate(), 'YYYY-MM-DD'), 'day');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Documentos</h3>
        <PermissionGuard module="equipos" tab="detalle-otro-equipo" action="update">
          <Dialog open={openCreate} onOpenChange={handleDialogClose}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Agregar documento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuevo Documento</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Nombre del documento" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormItem>
                    <FormLabel>Archivo</FormLabel>
                    <FormControl>
                      <div className="flex flex-col gap-2">
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept={ACCEPTED_FILE_TYPES}
                          onChange={handleFileChange}
                          className="cursor-pointer"
                        />
                        {selectedFile && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <FileUp className="h-4 w-4" />
                            <span className="truncate">{selectedFile.name}</span>
                            <span className="text-xs">({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                          </div>
                        )}
                      </div>
                    </FormControl>
                    <FormDescription>PDF, DOC, JPG, PNG (máx. 10MB)</FormDescription>
                  </FormItem>
                  <FormField
                    control={form.control}
                    name="expiration_date"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Fecha de vencimiento</FormLabel>
                        <FormControl>
                          <EnhancedDatePicker
                            date={field.value ?? undefined}
                            setDate={(date) => field.onChange(date ?? null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending}>
                      {createMutation.isPending ? 'Subiendo...' : 'Crear documento'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </PermissionGuard>
      </div>

      {certifications.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">No hay documentos registrados</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certifications.map((cert) => (
            <Card key={cert.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{cert.name}</CardTitle>
                  <PermissionGuard module="equipos" tab="detalle-otro-equipo" action="update">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setCertToDelete(cert)}
                      className="text-destructive hover:text-destructive"
                      aria-label={`Eliminar el documento ${cert.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </PermissionGuard>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {cert.expiration_date && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Vence:</span>
                    <Badge
                      variant={
                        isExpired(cert.expiration_date)
                          ? 'destructive'
                          : isExpiringSoon(cert.expiration_date)
                            ? 'yellow'
                            : 'success'
                      }
                      className="text-xs"
                    >
                      {moment(cert.expiration_date).locale('es').format('LL')}
                    </Badge>
                  </div>
                )}
                {cert.file_url && (
                  <a
                    href={cert.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline"
                  >
                    Ver archivo
                  </a>
                )}
                <p className="text-xs text-muted-foreground">Creado: {formatArgentinaDay(cert.created_at)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={!!certToDelete} onOpenChange={(open) => !open && setCertToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el documento &quot;{certToDelete?.name}&quot;. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => certToDelete && deleteMutation.mutate(certToDelete.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
