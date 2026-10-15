'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@/components/ui/table';
import { getMeasureUnits } from '@/features/Empresa/Clientes/actions/measure-units.server';
import {
  getServiceItemsByContract,
  updateServiceItem,
  type ServiceItemRow,
} from '@/features/Empresa/Clientes/actions/service-items.server';
import { formatItemPrice } from '@/features/Empresa/Clientes/lib/format-price';
import { toServiceItemFormValues, toggledActiveState } from '@/features/Empresa/Clientes/lib/service-item-form';
import type { ServiceItemFormValues } from '@/features/Empresa/Clientes/schemas/service-item';
import { Logger } from '@/lib/logger';
import BackButton from '@/shared/components/common/BackButton';
import EditModal from '@/shared/components/common/EditModal';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const logger = new Logger('features/Empresa/Clientes/service-items');

interface ServiceItemsSectionProps {
  /** Contrato (`customer_services.id`) del que se listan los items. */
  customerServiceId: string;
}

/**
 * Items de un contrato: listado, filtro por estado y edición en modal.
 * La empresa la resuelve el servidor desde la sesión — la vista nunca manda `company_id`.
 */
export function ServiceItemsSection({ customerServiceId }: ServiceItemsSectionProps) {
  const queryClient = useQueryClient();
  const [editingService, setEditingService] = useState<ServiceItemRow | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  // Bloquea los botones del modal mientras la peticion esta en curso
  const [isSaving, setIsSaving] = useState(false);
  const [isActiveFilter, setIsActiveFilter] = useState(true);

  const itemsQueryKey = ['service-items', customerServiceId];

  const { data: items = [], isPending: isLoadingItems } = useQuery({
    queryKey: itemsQueryKey,
    queryFn: () => getServiceItemsByContract(customerServiceId),
  });

  const { data: measure_unit = [], isPending: isLoadingUnits } = useQuery({
    queryKey: ['measure-units'],
    queryFn: () => getMeasureUnits(),
    staleTime: 5 * 60 * 1000,
  });

  const filteredItems = useMemo(
    () => items.filter((item) => (item.is_active ?? true) === isActiveFilter),
    [items, isActiveFilter]
  );

  if (isLoadingItems || isLoadingUnits) {
    return <div className="center-screen">Cargando...</div>;
  }

  const handleEditClick = (service_items: ServiceItemRow) => {
    setEditingService(service_items);
    setIsModalOpen(true);
  };

  const applyUpdate = async (
    overrides: Partial<ServiceItemFormValues>,
    successMessage: string,
    errorMessage: string
  ) => {
    if (isSaving || !editingService) return;
    setIsSaving(true);
    try {
      const result = await updateServiceItem(editingService.id, toServiceItemFormValues(editingService, overrides));
      if (!result.ok) {
        toast.error(result.error || errorMessage);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: itemsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['comercial', 'customer'] });
      toast.success(successMessage);
      setIsModalOpen(false);
    } catch (error) {
      logger.error(errorMessage, { data: { error, itemId: editingService.id } });
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => applyUpdate({}, 'Item actualizado correctamente', 'Error al actualizar el item');

  const handleDeactivateItem = () => {
    if (!editingService) return;
    const newActiveState = toggledActiveState(editingService.is_active);
    return applyUpdate(
      { is_active: newActiveState },
      `Item ${newActiveState ? 'activado' : 'desactivado'} correctamente`,
      'Error al desactivar el item'
    );
  };

  return (
    <div className="flex flex-col gap-6 py-4 px-6">
      <Card className="overflow-hidden gap-4">
        <CardHeader className="w-full flex bg-muted dark:bg-muted/50 border-b-2 flex-row justify-between">
          <div className="w-fit">
            <CardTitle className="text-2xl font-bold tracking-tight w-fit">Items del Servicio </CardTitle>
            <CardDescription className="text-muted-foreground w-fit">
              Detalle de todos los Items del servicio
            </CardDescription>
          </div>
          <div className="flex  justify-end">
            <BackButton />
          </div>
        </CardHeader>
        <CardContent className="py-4 px-4 ">
          <div className="flex space-x-4 p-4">
            <Select value={String(isActiveFilter)} onValueChange={(value) => setIsActiveFilter(value === 'true')}>
              <SelectTrigger className="w-[400px]">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Activos</SelectItem>
                <SelectItem value="false">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex space-x-4">
            <Table className="min-w-full divide-y divide-gray-200">
              <TableHead className="bg-header-background">
                <TableRow>
                  <TableCell className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Nombre
                  </TableCell>
                  <TableCell className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Estado
                  </TableCell>
                  <TableCell className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Descripción
                  </TableCell>
                  <TableCell className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Unidad de medida
                  </TableCell>
                  <TableCell className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Precio
                  </TableCell>
                  <TableCell className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Cliente
                  </TableCell>
                  <TableCell className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Acciones
                  </TableCell>
                </TableRow>

                <TableBody className="bg-background divide-y ">
                  {filteredItems?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm font-medium text-muted-foreground">
                        {item.item_name}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        <Badge variant={item.is_active ? 'success' : 'default'}>
                          {item.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {item.item_description}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {item.measure_units?.unit}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatItemPrice(item.item_price)}
                      </TableCell>
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {item.customer_services?.customers?.name}
                      </TableCell>
                      <TableCell>
                        <Button onClick={() => handleEditClick(item)}>Editar</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </TableHead>
            </Table>
          </div>
        </CardContent>
        <CardFooter className="flex flex-row items-center border-t bg-muted dark:bg-muted/50 px-6 py-3"></CardFooter>
      </Card>
      {isModalOpen && editingService && (
        <EditModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <h2 className="text-lg font-semibold">Editar Item</h2>
          <div className="p-4 bg-gray-100 dark:bg-gray-800 text-black dark:text-white">
            <label htmlFor="item_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Nombre del Servicio
            </label>
            <Input
              value={editingService.item_name}
              onChange={(e) => setEditingService({ ...editingService, item_name: e.target.value })}
              className="w-full p-2 mb-2 border border-gray-300 dark:border-gray-700 rounded"
            />
            <label htmlFor="item_description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Descripción del Servicio
            </label>
            <Input
              value={editingService.item_description}
              onChange={(e) => setEditingService({ ...editingService, item_description: e.target.value })}
              className="w-full p-2 mb-2 border border-gray-300 dark:border-gray-700 rounded"
            />
            <label htmlFor="item_price" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Precio del Servicio
            </label>
            <Input
              type="text"
              value={editingService.item_price ?? ''}
              onChange={(e) => setEditingService({ ...editingService, item_price: e.target.value })}
              className="w-full p-2 mb-2 border border-gray-300 dark:border-gray-700 rounded"
            />
            <label htmlFor="unit_of_measure" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Unidad de Medida
            </label>
            <Select
              onValueChange={(value) => {
                setEditingService({
                  ...editingService,
                  item_measure_units: Number(value),
                });
              }}
              value={String(editingService.item_measure_units)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Elegir unidad de medida" />
              </SelectTrigger>

              <SelectContent>
                {measure_unit.map((measure) => (
                  <SelectItem value={measure.id.toString()} key={measure.id}>
                    {measure.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end space-x-2 mt-4">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Guardando...' : 'Guardar'}
              </Button>
              <Button onClick={() => setIsModalOpen(false)} disabled={isSaving}>
                Cancelar
              </Button>
              <Button
                onClick={handleDeactivateItem}
                variant={editingService.is_active ?? true ? 'destructive' : 'success'}
                disabled={isSaving}
              >
                {editingService.is_active ?? true ? 'Dar de Baja' : 'Dar de Alta'}
              </Button>
            </div>
          </div>
        </EditModal>
      )}
    </div>
  );
}
