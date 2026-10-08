'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getChecklistAnswersByEquipment } from '@/features/Equipos/EquipoID/actions/checklist-queries';
import { getPendingDeviations } from '@/features/Mantenimiento/actions/maintenance-actions';
import { PendingDeviationsAlert } from '@/features/Mantenimiento/shared/components/pending-deviations-alert';
import { useQuery } from '@tanstack/react-query';
import { Calendar, CheckCircle, ClipboardList, Link as LinkIcon, User, XCircle } from 'lucide-react';
import moment from 'moment';
import Link from 'next/link';
import { parseCriticalItemLabels, summarizeCriticalItems } from '../lib/critical-items';

interface VehicleChecklistsTabContentProps {
  equipmentId: string;
}

export function VehicleChecklistsTabContent({ equipmentId }: VehicleChecklistsTabContentProps) {
  const { data: answers = [], isLoading: loadingAnswers } = useQuery({
    queryKey: ['equipment-checklist-answers', equipmentId],
    queryFn: () => getChecklistAnswersByEquipment(equipmentId),
    enabled: !!equipmentId,
    staleTime: 5 * 60 * 1000,
  });

  const { data: pendingDeviations = [], isLoading: loadingDeviations } = useQuery({
    queryKey: ['equipment-pending-deviations', equipmentId],
    queryFn: () => getPendingDeviations(equipmentId),
    enabled: !!equipmentId,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = !!equipmentId && (loadingAnswers || loadingDeviations);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Cargando checklists...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerta de desvíos pendientes */}
      {pendingDeviations.length > 0 && <PendingDeviationsAlert equipmentId={equipmentId} />}

      {/* Tabla de respuestas de checklist */}
      {answers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay respuestas de checklist para este equipo.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Historial de Checklists ({answers.length})
            </CardTitle>
            <CardDescription>Listado de todas las respuestas de checklist realizadas para este equipo</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Checklist</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Items Críticos Fallidos</TableHead>
                    <TableHead>Unidad Tractor</TableHead>
                    <TableHead>Realizado por</TableHead>
                    <TableHead>Observaciones</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {answers.map((answer) => (
                    <TableRow key={answer.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{moment(answer.created_at).format('DD/MM/YYYY HH:mm')}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{answer.checklist_templates?.name || 'Checklist sin nombre'}</div>
                        {answer.checklist_templates?.description && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {answer.checklist_templates.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {answer.result === 'B' ? (
                          <Badge variant="success">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Bueno
                          </Badge>
                        ) : answer.result === 'M' ? (
                          <Badge variant="destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Malo
                          </Badge>
                        ) : (
                          <Badge variant="outline">Sin resultado</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const labels = parseCriticalItemLabels(answer.critical_items_failed);
                          if (labels.length === 0) {
                            return <span className="text-sm text-muted-foreground">Ninguno</span>;
                          }
                          return (
                            <div className="space-y-1">
                              <Badge variant="destructive" className="text-xs">
                                {labels.length} item(s)
                              </Badge>
                              <div className="text-xs text-muted-foreground max-w-md break-words">
                                {summarizeCriticalItems(labels)}
                              </div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {answer.checklist_answers?.vehicles ? (
                          <Link href={`/dashboard/equipment/action?id=${answer.checklist_answers.equipment_id}&action=view`}>
                            <Button variant="outline" size="sm" className="gap-2">
                              <LinkIcon className="h-3 w-3" />
                              {answer.checklist_answers.vehicles.domain
                                ? `${answer.checklist_answers.vehicles.domain} - ${answer.checklist_answers.vehicles.intern_number || ''}`
                                : `${answer.checklist_answers.vehicles.serie || ''} - ${answer.checklist_answers.vehicles.intern_number || ''}`}
                            </Button>
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {answer.profile?.fullname ? (
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{answer.profile.fullname}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Usuario desconocido</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {answer.observations ? (
                          <div className="max-w-xs">
                            <p className="text-sm truncate" title={answer.observations}>
                              {answer.observations}
                            </p>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => {
                            window.open(`/dashboard/forms/${answer.id}/view`, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <LinkIcon className="h-4 w-4" />
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
