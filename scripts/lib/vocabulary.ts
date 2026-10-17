import type { Exercise } from '../../src/content/types.ts'

// The words of SQL a piece of code uses, so validate can check that nothing
// appears before the lesson that teaches it. Postgres's own lists decide what
// a word is:
//
//   ORDER, select            a keyword. Reserved keywords count in any case, and
//                            and so does a function-like one followed by `(` (coalesce, trim).
//                            Others count only in upper case, since the course
//                            writes names in lower case (`first` is an alias,
//                            FIRST a keyword), and never when the dataset has a
//                            table or column of that name (`name`).
//   count(), round()         a function: a name Postgres knows as a function, followed by `(`
//   ::, ||                   an operator a beginner cannot guess
//   information_schema       any other name, lower-cased
//
// String literals, quoted identifiers and comments are not code.

export interface Lexicon {
  /** Keyword (lower case) → category: R reserved, T type/function name, C column name, U unreserved. */
  keywords: Map<string, string>
  /** Names of built-in functions, lower case. */
  functions: Set<string>
  /** The dataset's table and column names: `name` is a column even though NAME is a keyword. */
  names: Set<string>
}

export const OPERATORS = ['::', '||', '<>', '!=', '>=', '<=', '%', '^'] as const

export type WordKind = 'keyword' | 'function' | 'operator' | 'name'

export function wordKind(token: string): WordKind {
  if (/^[A-Z][A-Z_]*$/.test(token)) return 'keyword'
  if (token.endsWith('()')) return 'function'
  if ((OPERATORS as readonly string[]).includes(token)) return 'operator'
  return 'name'
}

/** Keywords (upper case), functions (`name()`), operators and other names in `sql`, each once. */
export function sqlWords(sql: string, lex: Lexicon): Set<string> {
  const code = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, ' ')
    .replace(/"(?:[^"]|"")*"/g, ' ')
  const out = new Set<string>()
  for (const m of code.matchAll(/::|\|\||<>|!=|>=|<=|%|\^|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?/g)) {
    const word = m[1]
    if (!word) { out.add(m[0]); continue }
    const w = word.toLowerCase()
    const cat = lex.keywords.get(w)
    if (m[2] && lex.functions.has(w) && cat !== 'R') out.add(`${w}()`)
    else if (cat && (cat === 'R' || (m[2] && (cat === 'C' || cat === 'T')) || (word === word.toUpperCase() && !lex.names.has(w)))) out.add(w.toUpperCase())
    else out.add(w)
  }
  return out
}

/** All SQL an exercise shows or runs: query, solution, starter, parsons pieces, probe, attempts. */
export function exerciseSql(ex: Exercise): string[] {
  if (ex.kind === 'predict') return [ex.query]
  return [ex.solution, ex.starter, ...(ex.pieces ?? []), ex.check.probe ?? '', ...(ex.check.attempts ?? [])].filter(Boolean)
}
