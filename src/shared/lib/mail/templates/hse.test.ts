import { describe, expect, it } from 'vitest';
import {
  renderHseDocumentPublishedEmail,
  renderHseDocumentRejectedEmail,
  renderHseTrainingPublishedEmail,
} from './hse';

/** Los textos libres (título, motivo, nombre) llegan de la base o los escribe un usuario: van escapados en el HTML. */
const HOSTILE = '<img src=x onerror=alert(1)> & "comilla"';

describe('correos de HSE (publicación y rechazo)', () => {
  it('documento publicado: asunto con la empresa, vence y link al portal', () => {
    const email = renderHseDocumentPublishedEmail({
      name: 'Ana',
      companyName: 'Obras SA',
      title: HOSTILE,
      version: 2,
      isNewVersion: true,
      expiresAt: '2027-03-31',
    });
    expect(email.subject).toBe('Documento HSE para aceptar — Obras SA');
    expect(email.text).toContain('versión nueva (v2)');
    expect(email.text).toContain('Vence el 31/03/2027');
    expect(email.text).toContain('/portal/documents');
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;img');
  });

  it('capacitación asignada: menciona el tiempo del examen solo si lo tiene y lleva al detalle', () => {
    const withLimit = renderHseTrainingPublishedEmail({
      name: null,
      companyName: 'Obras SA',
      title: 'Trabajo en altura',
      timeLimitMinutes: 30,
      trainingId: 'abc',
    });
    expect(withLimit.text).toContain('30 minutos');
    expect(withLimit.text).toContain('/portal/trainings/abc');
    expect(withLimit.text.startsWith('Hola:')).toBe(true);
    expect(
      renderHseTrainingPublishedEmail({
        name: 'Ana',
        companyName: 'Obras SA',
        title: 'X',
        timeLimitMinutes: null,
        trainingId: 'abc',
      }).text
    ).not.toContain('minutos');
  });

  it('documento rechazado: legajo, motivo y link al documento, todo escapado', () => {
    const email = renderHseDocumentRejectedEmail({
      employee: 'Pérez Juan',
      file: '123',
      title: 'Norma de altura',
      reason: HOSTILE,
      documentId: 'doc-1',
    });
    expect(email.text).toContain('[123] Pérez Juan rechazó el documento HSE «Norma de altura»');
    expect(email.text).toContain('/dashboard/hse/documents/doc-1');
    expect(email.html).not.toContain('<img');
  });
});
