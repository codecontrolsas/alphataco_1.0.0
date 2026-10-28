import { describe, expect, it } from 'vitest';
import { formatDuration, secondsBetween } from './durations';
import { buildEvaluationQuestions } from './evaluation-content';
import { STUDY_CAP_SECONDS, summarizeExam, summarizeStudy } from './study-time';

/** Reporte de tiempos y hoja de evaluación (ticket 804): lo que no se mide es `null`, nunca 0. */

describe('secondsBetween / formatDuration', () => {
  it('mide en segundos y devuelve null si falta una marca o el orden es imposible', () => {
    expect(secondsBetween('2026-10-01T10:00:00Z', '2026-10-01T10:12:34Z')).toBe(754);
    expect(secondsBetween(null, '2026-10-01T10:00:00Z')).toBeNull();
    expect(secondsBetween('2026-10-01T10:00:00Z', null)).toBeNull();
    expect(secondsBetween('2026-10-01T10:00:00Z', '2026-10-01T09:59:59Z')).toBeNull();
    expect(secondsBetween('no es una fecha', '2026-10-01T09:59:59Z')).toBeNull();
  });

  it('formatea horas, minutos y segundos; sin dato dice «Sin medición» (no 0)', () => {
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(754)).toBe('12 min 34 s');
    expect(formatDuration(3725)).toBe('1 h 02 min');
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(null)).toBe('Sin medición');
    expect(formatDuration(undefined)).toBe('Sin medición');
  });
});

describe('summarizeStudy', () => {
  const at = (iso: string) => new Date(iso);

  it('suma los materiales con apertura y lectura; los demás cuentan como sin medir', () => {
    const summary = summarizeStudy(
      [
        { firstOpenedAt: at('2026-10-01T10:00:00Z'), readAt: at('2026-10-01T10:10:00Z') },
        { firstOpenedAt: at('2026-10-01T11:00:00Z'), readAt: at('2026-10-01T11:05:00Z') },
        // Leído antes de que existiera el registro de aperturas: sin medición, no 0.
        { firstOpenedAt: null, readAt: at('2026-09-01T10:00:00Z') },
      ],
      4
    );
    expect(summary).toEqual({ seconds: 900, measured: 2, total: 4 });
  });

  it('sin ningún material medible el total es null', () => {
    expect(summarizeStudy([{ firstOpenedAt: null, readAt: new Date() }], 2)).toEqual({
      seconds: null,
      measured: 0,
      total: 2,
    });
    expect(summarizeStudy([], 0).seconds).toBeNull();
  });

  it('una pestaña abierta de un día para el otro se acota al tope por material', () => {
    const summary = summarizeStudy([{ firstOpenedAt: '2026-10-01T10:00:00Z', readAt: '2026-10-02T10:00:00Z' }], 1);
    expect(summary.seconds).toBe(STUDY_CAP_SECONDS);
  });

  it('una lectura anterior a la apertura (reloj o datos raros) no se cuenta', () => {
    expect(
      summarizeStudy([{ firstOpenedAt: '2026-10-01T10:10:00Z', readAt: '2026-10-01T10:00:00Z' }], 1).seconds
    ).toBeNull();
  });
});

describe('summarizeExam', () => {
  it('toma el último intento por número y suma todos los cerrados', () => {
    const exam = summarizeExam([
      { number: 2, startedAt: '2026-10-02T10:00:00Z', submittedAt: '2026-10-02T10:20:00Z' },
      { number: 1, startedAt: '2026-10-01T10:00:00Z', submittedAt: '2026-10-01T10:05:00Z' },
    ]);
    expect(exam).toEqual({ attempts: 2, lastSeconds: 1200, totalSeconds: 1500 });
  });

  it('sin intentos cerrados no hay medición', () => {
    expect(summarizeExam([])).toEqual({ attempts: 0, lastSeconds: null, totalSeconds: null });
    expect(
      summarizeExam([{ number: 1, startedAt: '2026-10-01T10:00:00Z', submittedAt: null }]).totalSeconds
    ).toBeNull();
  });
});

describe('buildEvaluationQuestions', () => {
  const questions = [
    { id: 'q1', prompt: 'Uno', points: 5 },
    { id: 'q2', prompt: 'Dos', points: 5 },
    { id: 'q3', prompt: 'Tres', points: 5 },
  ];
  const options = [
    { id: 'o1a', question_id: 'q1', label: 'Sí' },
    { id: 'o1b', question_id: 'q1', label: 'No' },
    { id: 'o2a', question_id: 'q2', label: 'Rojo' },
    { id: 'o2b', question_id: 'q2', label: 'Verde' },
    { id: 'o3a', question_id: 'q3', label: 'Arriba' },
    { id: 'o3b', question_id: 'q3', label: 'Abajo' },
  ];
  const keys = new Map([
    ['q1', 'o1a'],
    ['q2', 'o2a'],
    ['q3', 'o3a'],
  ]);

  it('respeta el orden en que el empleado vio las preguntas y marca correcta, incorrecta y sin responder', () => {
    const result = buildEvaluationQuestions({
      order: ['q3', 'q1', 'q2'],
      questions,
      options,
      answers: new Map([
        ['q1', 'o1a'],
        ['q2', 'o2b'],
      ]),
      keys,
    });
    expect(result.map((q) => [q.prompt, q.result, q.chosen, q.correct])).toEqual([
      ['Tres', 'unanswered', null, 'Arriba'],
      ['Uno', 'correct', 'Sí', 'Sí'],
      ['Dos', 'wrong', 'Verde', 'Rojo'],
    ]);
  });

  it('una pregunta que ya no existe se omite; sin orden registrado salen todas', () => {
    expect(
      buildEvaluationQuestions({ order: ['q1', 'fantasma'], questions, options, answers: new Map(), keys }).map(
        (q) => q.prompt
      )
    ).toEqual(['Uno']);
    expect(
      buildEvaluationQuestions({ order: [], questions, options, answers: new Map(), keys }).map((q) => q.prompt)
    ).toEqual(['Uno', 'Dos', 'Tres']);
  });
});
