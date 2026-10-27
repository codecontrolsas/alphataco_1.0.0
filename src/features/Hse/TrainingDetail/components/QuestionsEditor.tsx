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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { InputFormField, TextareaFormField } from '@/shared/components/common/form-fields';
import { unwrapAction } from '@/shared/lib/unwrap-action';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { HseTrainingDetail } from '../../actions/trainings.queries';
import { deleteHseTrainingQuestion, saveHseTrainingQuestion } from '../../actions/trainings.server';
import { HSE_EXAM_LIMITS, HSE_QUERY_KEYS } from '../../lib/constants';
import { hseQuestionSchema, type HseQuestionInput, type HseQuestionValues } from '../../schemas/trainings';

const logger = new Logger('Hse/QuestionsEditor');

type Question = HseTrainingDetail['questions'][number];

const EMPTY: HseQuestionInput = { prompt: '', points: 1, options: [{ label: '' }, { label: '' }], correctIndex: -1 };

/**
 * Editor del examen: preguntas de opción única, cada una con su peso en puntos y su respuesta correcta. La respuesta
 * correcta se marca con un grupo de radios (teclado: flechas) y se guarda en la clave aparte: el portal nunca la recibe.
 * Se edita solo en borrador; publicada se muestra en lectura (con la correcta marcada, solo para el dashboard).
 */
export function QuestionsEditor({
  trainingId,
  questions,
  totalPoints,
  editable,
}: {
  trainingId: string;
  questions: Question[];
  totalPoints: number;
  editable: boolean;
}) {
  const [editing, setEditing] = useState<{ question: Question | null } | null>(null);
  const [removing, setRemoving] = useState<Question | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: async (id: string) => unwrapAction(await deleteHseTrainingQuestion(id)),
    onSuccess: () => {
      setRemoving(null);
      toast.success('Pregunta borrada');
      void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al borrar la pregunta', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo borrar la pregunta');
    },
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground tabular-nums">
        {questions.length} pregunta{questions.length === 1 ? '' : 's'} · {totalPoints} punto
        {totalPoints === 1 ? '' : 's'} en total
      </p>
      {questions.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Todavía no hay preguntas. Hace falta al menos una para publicar.
        </p>
      ) : (
        <ol className="space-y-3">
          {questions.map((q, index) => (
            <li key={q.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-pretty break-words">
                    <span className="tabular-nums text-muted-foreground">{index + 1}. </span>
                    {q.prompt}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {q.points} punto{q.points === 1 ? '' : 's'}
                    {!q.correctOptionId && ' · sin respuesta correcta'}
                  </p>
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 sm:size-9"
                      aria-label={`Editar la pregunta ${index + 1}`}
                      onClick={() => setEditing({ question: q })}
                    >
                      <Pencil aria-hidden="true" className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 text-destructive sm:size-9"
                      aria-label={`Borrar la pregunta ${index + 1}`}
                      onClick={() => setRemoving(q)}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                )}
              </div>
              <ul className="mt-3 space-y-1.5">
                {q.options.map((o) => {
                  const correct = o.id === q.correctOptionId;
                  return (
                    <li
                      key={o.id}
                      className={cn(
                        'flex items-start gap-2 rounded-md px-2 py-1.5 text-sm',
                        correct && 'bg-ok-subtle text-ok-subtle-foreground'
                      )}
                    >
                      {correct ? (
                        <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      ) : (
                        <span aria-hidden="true" className="mt-0.5 size-4 shrink-0 rounded-full border" />
                      )}
                      <span className="break-words">
                        {o.label}
                        {correct && <span className="sr-only"> (respuesta correcta)</span>}
                      </span>
                      {correct && (
                        <Badge variant="success" className="ml-auto shrink-0" aria-hidden="true">
                          Correcta
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {editable && questions.length < HSE_EXAM_LIMITS.maxQuestions && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 sm:min-h-9"
          onClick={() => setEditing({ question: null })}
        >
          <Plus aria-hidden="true" className="mr-1 size-4" /> Agregar pregunta
        </Button>
      )}

      {editing && (
        <QuestionDialog
          trainingId={trainingId}
          question={editing.question}
          number={editing.question ? questions.indexOf(editing.question) + 1 : questions.length + 1}
          onClose={() => setEditing(null)}
        />
      )}

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar la pregunta?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">«{removing?.prompt}»</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={remove.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (removing) remove.mutate(removing.id);
              }}
            >
              {remove.isPending ? 'Borrando…' : 'Borrar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function QuestionDialog({
  trainingId,
  question,
  number,
  onClose,
}: {
  trainingId: string;
  question: Question | null;
  number: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<HseQuestionInput, unknown, HseQuestionValues>({
    resolver: zodResolver(hseQuestionSchema),
    defaultValues: question
      ? {
          prompt: question.prompt,
          points: question.points,
          options: question.options.map((o) => ({ label: o.label })),
          correctIndex: question.options.findIndex((o) => o.id === question.correctOptionId),
        }
      : EMPTY,
  });
  const options = useFieldArray({ control: form.control, name: 'options' });
  const correctIndex = Number(form.watch('correctIndex'));

  const save = useMutation({
    mutationFn: async (values: HseQuestionValues) =>
      unwrapAction(await saveHseTrainingQuestion(trainingId, question?.id ?? null, values)),
    onSuccess: () => {
      toast.success(question ? 'Pregunta guardada' : 'Pregunta agregada');
      void queryClient.invalidateQueries({ queryKey: HSE_QUERY_KEYS.all });
      onClose();
      router.refresh();
    },
    onError: (error) => {
      logger.error('Error al guardar la pregunta', { data: { error } });
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar la pregunta');
    },
  });

  const removeOption = (index: number) => {
    options.remove(index);
    // La correcta se corre con las opciones: si se borra la marcada, queda sin marcar.
    if (correctIndex === index) form.setValue('correctIndex', -1);
    else if (correctIndex > index) form.setValue('correctIndex', correctIndex - 1);
  };

  const correctError = form.formState.errors.correctIndex?.message;
  const optionsError = form.formState.errors.options?.message ?? form.formState.errors.options?.root?.message;

  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{question ? `Editar la pregunta ${number}` : `Pregunta ${number}`}</DialogTitle>
          <DialogDescription>Opción única: marcá cuál es la respuesta correcta.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((values) => save.mutate(values))} className="space-y-4">
            <TextareaFormField control={form.control} name="prompt" label="Pregunta" rows={3} />
            <InputFormField
              control={form.control}
              name="points"
              label="Puntos"
              type="number"
              inputMode="numeric"
              min={1}
              max={HSE_EXAM_LIMITS.maxPoints}
              itemClassName="max-w-40"
            />

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Opciones</legend>
              <p id="correct-hint" className="text-sm text-muted-foreground">
                Elegí con el círculo la respuesta correcta. Entre {HSE_EXAM_LIMITS.minOptions} y{' '}
                {HSE_EXAM_LIMITS.maxOptions} opciones.
              </p>
              <RadioGroup
                value={correctIndex >= 0 ? String(correctIndex) : ''}
                onValueChange={(value) => form.setValue('correctIndex', Number(value), { shouldValidate: true })}
                aria-label="Respuesta correcta"
                aria-describedby="correct-hint"
                aria-invalid={Boolean(correctError)}
                className="gap-2"
              >
                {options.fields.map((option, index) => (
                  <div key={option.id} className="flex items-start gap-2">
                    <div className="flex min-h-11 items-center sm:min-h-9">
                      <RadioGroupItem
                        value={String(index)}
                        id={`option-correct-${option.id}`}
                        aria-label={`Marcar la opción ${index + 1} como correcta`}
                        className="size-5"
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name={`options.${index}.label`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <FormLabel className="sr-only">Opción {index + 1}</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder={`Opción ${index + 1}`} className="min-h-11 sm:min-h-9" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0 sm:size-9"
                      aria-label={`Quitar la opción ${index + 1}`}
                      disabled={options.fields.length <= HSE_EXAM_LIMITS.minOptions}
                      onClick={() => removeOption(index)}
                    >
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                ))}
              </RadioGroup>
              {correctError && (
                <p role="alert" className="text-sm text-destructive">
                  {correctError}
                </p>
              )}
              {optionsError && (
                <p role="alert" className="text-sm text-destructive">
                  {optionsError}
                </p>
              )}
              {options.fields.length < HSE_EXAM_LIMITS.maxOptions && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 sm:min-h-9"
                  onClick={() => options.append({ label: '' })}
                >
                  <Plus aria-hidden="true" className="mr-1 size-4" /> Agregar opción
                </Button>
              )}
            </fieldset>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Guardando…' : 'Guardar pregunta'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
