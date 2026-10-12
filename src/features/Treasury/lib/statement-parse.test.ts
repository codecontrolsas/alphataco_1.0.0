import { describe, expect, it } from 'vitest';
import { buildStatementLines, columnIndex, parseStatementAmount, parseStatementDate, type StatementProfile } from './statement-parse';

describe('parseStatementDate', () => {
  it('lee los cuatro formatos', () => {
    expect(parseStatementDate('05/10/2026', 'DD/MM/YYYY')).toBe('2026-10-05');
    expect(parseStatementDate('2026-10-05', 'YYYY-MM-DD')).toBe('2026-10-05');
    expect(parseStatementDate('05-10-2026', 'DD-MM-YYYY')).toBe('2026-10-05');
    expect(parseStatementDate('10/05/2026', 'MM/DD/YYYY')).toBe('2026-10-05');
  });
  it('acepta día y mes de un dígito y espacios', () => {
    expect(parseStatementDate(' 5/1/2026 ', 'DD/MM/YYYY')).toBe('2026-01-05');
  });
  it('acepta el año de dos dígitos', () => {
    expect(parseStatementDate('05/10/26', 'DD/MM/YYYY')).toBe('2026-10-05');
  });
  it('acepta una fecha ya en ISO aunque el formato sea otro (Excel la entrega así)', () => {
    expect(parseStatementDate('2026-10-05', 'DD/MM/YYYY')).toBe('2026-10-05');
  });
  it('rechaza fechas inválidas', () => {
    expect(parseStatementDate('31/02/2026', 'DD/MM/YYYY')).toBeNull();
    expect(parseStatementDate('hola', 'DD/MM/YYYY')).toBeNull();
    expect(parseStatementDate('', 'DD/MM/YYYY')).toBeNull();
  });
});

describe('parseStatementAmount', () => {
  it('coma decimal con punto de miles', () => {
    expect(parseStatementAmount('1.234,56', ',')).toBe(BigInt(123456));
  });
  it('punto decimal con coma de miles', () => {
    expect(parseStatementAmount('1,234.56', '.')).toBe(BigInt(123456));
  });
  it('negativos con signo o entre paréntesis, y el símbolo de pesos', () => {
    expect(parseStatementAmount('-1.500,00', ',')).toBe(BigInt(-150000));
    expect(parseStatementAmount('(1.500,00)', ',')).toBe(BigInt(-150000));
    expect(parseStatementAmount('$ 1.500', ',')).toBe(BigInt(150000));
    expect(parseStatementAmount('1500-', ',')).toBe(BigInt(-150000));
  });
  it('vacío es 0', () => {
    expect(parseStatementAmount('', ',')).toBe(BigInt(0));
    expect(parseStatementAmount('  ', ',')).toBe(BigInt(0));
  });
  it('rechaza texto o más de 2 decimales', () => {
    expect(parseStatementAmount('abc', ',')).toBeNull();
    expect(parseStatementAmount('1.234', ',')).toBe(BigInt(123400));
    expect(parseStatementAmount('1,2345', ',')).toBeNull();
  });
});

describe('columnIndex', () => {
  it('convierte letras en índice desde 0', () => {
    expect(columnIndex('A')).toBe(0);
    expect(columnIndex('c')).toBe(2);
    expect(columnIndex('AA')).toBe(26);
    expect(columnIndex('')).toBeNull();
    expect(columnIndex('1')).toBeNull();
  });
});

const single: StatementProfile = {
  headerRow: 1,
  dateColumn: 'A',
  descriptionColumn: 'B',
  referenceColumn: 'C',
  amountColumn: 'D',
  debitColumn: null,
  creditColumn: null,
  dateFormat: 'DD/MM/YYYY',
  decimalSeparator: ',',
};

describe('buildStatementLines', () => {
  it('arma las líneas desde la fila siguiente al encabezado, saltea vacías y en 0', () => {
    const rows = [
      ['Fecha', 'Concepto', 'Ref', 'Importe'],
      ['01/10/2026', 'Transferencia recibida', '123', '10.000,00'],
      ['', '', '', ''],
      ['02/10/2026', 'Comisión', '', '-150,00'],
      ['02/10/2026', 'Ajuste', '', '0,00'],
    ];
    const result = buildStatementLines(rows, single);
    expect(result.errors).toEqual([]);
    expect(result.lines).toEqual([
      { row: 2, date: '2026-10-01', description: 'Transferencia recibida', reference: '123', amountCents: BigInt(1000000), key: '2026-10-01|1000000|Transferencia recibida|123|1' },
      { row: 4, date: '2026-10-02', description: 'Comisión', reference: '', amountCents: BigInt(-15000), key: '2026-10-02|-15000|Comisión||1' },
    ]);
  });

  it('débito y crédito en columnas separadas', () => {
    const profile: StatementProfile = { ...single, amountColumn: null, debitColumn: 'D', creditColumn: 'E' };
    const rows = [
      ['Fecha', 'Concepto', 'Ref', 'Débito', 'Crédito'],
      ['01/10/2026', 'Cheque 10001', '', '180.000,00', ''],
      ['01/10/2026', 'Depósito', '', '', '5.000,00'],
    ];
    const result = buildStatementLines(rows, profile);
    expect(result.lines.map((l) => l.amountCents)).toEqual([BigInt(-18000000), BigInt(500000)]);
  });

  it('dos líneas iguales el mismo día tienen claves distintas', () => {
    const rows = [
      ['Fecha', 'Concepto', 'Ref', 'Importe'],
      ['02/10/2026', 'Comisión', '', '-150,00'],
      ['02/10/2026', 'Comisión', '', '-150,00'],
    ];
    const keys = buildStatementLines(rows, single).lines.map((l) => l.key);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[1]!.endsWith('|2')).toBe(true);
  });

  it('informa la fila con fecha o importe inválidos', () => {
    const rows = [
      ['Fecha', 'Concepto', 'Ref', 'Importe'],
      ['32/10/2026', 'X', '', '10'],
      ['01/10/2026', 'Y', '', 'diez'],
    ];
    expect(buildStatementLines(rows, single).errors).toEqual(['Fila 2: fecha inválida («32/10/2026»)', 'Fila 3: importe inválido («diez»)']);
  });

  it('una fila con datos pero sin fecha es un error (no se saltea en silencio)', () => {
    const rows = [
      ['Fecha', 'Concepto', 'Ref', 'Importe'],
      ['', 'Suelta', '', '10'],
    ];
    expect(buildStatementLines(rows, single).errors).toEqual(['Fila 2: fecha inválida («»)']);
  });

  it('un importe que no entra en el libro es un error con su fila', () => {
    const rows = [
      ['Fecha', 'Concepto', 'Ref', 'Importe'],
      ['01/10/2026', 'Enorme', '', '10000000000000,00'],
    ];
    expect(buildStatementLines(rows, single).errors).toEqual(['Fila 2: importe fuera de rango («10000000000000,00»)']);
  });
});
