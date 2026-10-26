import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Una función `'use cache'` corre FUERA del request: no ve la sesión ni la empresa activa. Con el rol de la app (sin
 * BYPASSRLS) toda consulta que haga sin contexto devuelve CERO filas, y esas cero filas quedan cacheadas: listas
 * vacías con el contador en 9 (ticket 800, Mantenimiento → Taller) y la tab Configuración → Usuarios vacía.
 *
 * Regla que este test hace cumplir sobre el código (con la API de TypeScript, no con texto: los comentarios que
 * mencionan `'use cache'` no cuentan):
 * - el cuerpo de una función `'use cache'` es SOLO la directiva, `cacheTag`/`cacheLife` y
 *   `return runInCompanyScope(<parámetro>, () => ...)`: la empresa llega por parámetro (y así entra en la clave del
 *   cache) y la consulta corre con ella como contexto;
 * - no hay `'use cache'` a nivel de archivo (no tendría de dónde sacar la empresa);
 * - un archivo `'use server'` no exporta una función `'use cache'`: sería un endpoint que recibe la empresa del
 *   cliente y la usa como contexto sin validar el acceso.
 *
 * Excepciones: agregarlas a `ALLOWED` con el motivo (p. ej. una función que no consulta tablas con RLS).
 */
const ALLOWED: Record<string, string> = {};

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const CACHE_CONFIG_CALLS = new Set(['cacheTag', 'cacheLife']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** Directivas del prólogo (`'use cache'`, `'use server'`) de un bloque o archivo. */
function directives(statements: ts.NodeArray<ts.Statement>): string[] {
  const found: string[] = [];
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    found.push(statement.expression.text);
  }
  return found;
}

function calleeName(expression: ts.Expression): string | null {
  if (!ts.isCallExpression(expression)) return null;
  return ts.isIdentifier(expression.expression) ? expression.expression.text : null;
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
  );
}

interface CachedFunction {
  id: string;
  problems: string[];
}

function analyzeFile(file: string): { cached: CachedFunction[]; fileProblems: string[] } {
  const text = readFileSync(file, 'utf8');
  const relative = path.relative(ROOT, file);
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const fileDirectives = directives(sourceFile.statements);
  const fileProblems = fileDirectives.includes('use cache')
    ? [`${relative}: 'use cache' a nivel de archivo (la empresa tiene que llegar por parámetro)`]
    : [];
  const isServerActionsFile = fileDirectives.includes('use server');
  const cached: CachedFunction[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node) && 'body' in node && node.body && ts.isBlock(node.body)) {
      const body = node.body;
      if (directives(body.statements).includes('use cache')) {
        const name = node.name && ts.isIdentifier(node.name) ? node.name.text : '(anónima)';
        const id = `${relative}#${name}`;
        const params = new Set(node.parameters.flatMap((p) => (ts.isIdentifier(p.name) ? [p.name.text] : [])));
        const problems: string[] = [];

        if (isServerActionsFile && isExported(node)) {
          problems.push(`se exporta desde un archivo 'use server' (recibiría la empresa del cliente)`);
        }

        const rest = body.statements.filter(
          (statement) => !(ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression))
        );
        const scoped = rest.filter((statement) => {
          if (ts.isExpressionStatement(statement))
            return !CACHE_CONFIG_CALLS.has(calleeName(statement.expression) ?? '');
          return true;
        });
        const last = scoped[0];
        const scopeCall =
          scoped.length === 1 &&
          last &&
          ts.isReturnStatement(last) &&
          last.expression &&
          ts.isCallExpression(last.expression)
            ? last.expression
            : null;

        if (!scopeCall || calleeName(scopeCall) !== 'runInCompanyScope') {
          problems.push(
            'el cuerpo no es `return runInCompanyScope(<empresa>, () => ...)` (consulta sin contexto de empresa)'
          );
        } else {
          const [companyArg] = scopeCall.arguments;
          if (!companyArg || !ts.isIdentifier(companyArg) || !params.has(companyArg.text)) {
            problems.push(
              'la empresa de `runInCompanyScope` no es un parámetro de la función (no entra en la clave del cache)'
            );
          }
        }
        cached.push({ id, problems });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { cached, fileProblems };
}

describe("funciones 'use cache' con contexto de empresa", () => {
  const files = sourceFiles(SRC).filter((file) => readFileSync(file, 'utf8').includes('use cache'));
  const results = files.map(analyzeFile);
  const cached = results.flatMap((r) => r.cached);

  it('encuentra las funciones cacheadas del sistema (el test no pasa por no ver nada)', () => {
    expect(cached.length).toBeGreaterThanOrEqual(16);
  });

  it("ningún archivo usa 'use cache' a nivel de módulo", () => {
    expect(results.flatMap((r) => r.fileProblems)).toEqual([]);
  });

  it('cada función cacheada consulta dentro de runInCompanyScope con la empresa recibida por parámetro', () => {
    const offenders = cached
      .filter((fn) => fn.problems.length > 0 && !ALLOWED[fn.id])
      .map((fn) => `${fn.id}: ${fn.problems.join('; ')}`);
    expect(offenders).toEqual([]);
  });

  it('las excepciones permitidas siguen existiendo', () => {
    const ids = new Set(cached.map((fn) => fn.id));
    expect(Object.keys(ALLOWED).filter((id) => !ids.has(id))).toEqual([]);
  });
});
