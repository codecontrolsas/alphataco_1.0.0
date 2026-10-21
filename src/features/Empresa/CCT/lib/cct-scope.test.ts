import { describe, expect, it } from 'vitest';
import { covenantScope, guildReadScope, guildWriteScope } from './cct-scope';

const COMPANY = '11111111-1111-1111-1111-111111111111';

describe('guildReadScope / guildWriteScope', () => {
  it('lectura y escritura de sindicatos: sólo los de la empresa (no hay globales)', () => {
    expect(guildReadScope(COMPANY)).toEqual({ company_id: COMPANY });
    expect(guildWriteScope(COMPANY)).toEqual({ company_id: COMPANY });
  });
});

describe('covenantScope', () => {
  it('los convenios siempre son de una empresa (company_id NOT NULL)', () => {
    expect(covenantScope(COMPANY)).toEqual({ company_id: COMPANY });
  });
});
