import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv-parse';

describe('parseCsv', () => {
  it('detecta el separador punto y coma (CSV argentino)', () => {
    expect(parseCsv('Fecha;Concepto;Importe\n01/10/2026;Comisión;-1.200,50\n')).toEqual([
      ['Fecha', 'Concepto', 'Importe'],
      ['01/10/2026', 'Comisión', '-1.200,50'],
    ]);
  });
  it('separador coma con comillas que contienen comas y comillas dobles', () => {
    expect(parseCsv('a,b\n"x, y","dijo ""hola"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'dijo "hola"'],
    ]);
  });
  it('saltos de línea dentro de comillas', () => {
    expect(parseCsv('a;b\n"uno\ndos";3')).toEqual([
      ['a', 'b'],
      ['uno\ndos', '3'],
    ]);
  });
  it('tabulador y BOM', () => {
    expect(parseCsv('﻿a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('vacío', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('el separador se decide por las líneas de datos, no por un preámbulo del banco', () => {
    const text = 'Extracto de cuenta, período 01/09 al 30/09\nFecha;Concepto;Importe\n01/09/2026;Comisión;-10,00\n02/09/2026;Depósito;20,00\n';
    expect(parseCsv(text)[2]).toEqual(['01/09/2026', 'Comisión', '-10,00']);
  });
  it('una primera línea sin separadores no decide', () => {
    expect(parseCsv('Banco Galicia\na,b,c\n1,2,3')[2]).toEqual(['1', '2', '3']);
  });
});
