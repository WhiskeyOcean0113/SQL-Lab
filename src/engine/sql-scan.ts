// A small lexical pass over Postgres SQL. It does not parse; it only knows
// enough about comments, strings and dollar quoting to find statement
// boundaries and each statement's leading keyword.

export interface Statement {
  /** Text of the statement without the trailing semicolon. */
  text: string
  /** First keyword, upper-cased, or '' for an empty statement. */
  keyword: string
  /** Offset of `text` in the original SQL, so error positions can be mapped back. */
  start: number
}

export function splitStatements(sql: string): Statement[] {
  const out: Statement[] = []
  let start = 0
  let i = 0
  const n = sql.length

  const push = (end: number) => {
    const text = sql.slice(start, end)
    const keyword = leadingKeyword(text)
    if (keyword) out.push({ text: text.trim(), keyword, start: start + text.length - text.trimStart().length })
    start = end + 1
  }

  while (i < n) {
    const c = sql[i]!
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      const nl = sql.indexOf('\n', i)
      i = nl === -1 ? n : nl + 1
    } else if (c === '/' && next === '*') {
      i = skipBlockComment(sql, i)
    } else if (c === "'") {
      const escaped = i > 0 && /[eE]/.test(sql[i - 1]!) && !/\w/.test(sql[i - 2] ?? '')
      i = skipQuoted(sql, i, "'", escaped)
    } else if (c === '"') {
      i = skipQuoted(sql, i, '"', false)
    } else if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      if (m && !/\w/.test(sql[i - 1] ?? '')) {
        const close = sql.indexOf(m[0], i + m[0].length)
        i = close === -1 ? n : close + m[0].length
      } else i++
    } else if (c === ';') {
      push(i)
      i++
    } else i++
  }
  push(n)
  return out
}

function skipBlockComment(sql: string, i: number): number {
  // Postgres block comments nest.
  let depth = 0
  while (i < sql.length) {
    if (sql[i] === '/' && sql[i + 1] === '*') { depth++; i += 2 }
    else if (sql[i] === '*' && sql[i + 1] === '/') { depth--; i += 2; if (depth === 0) return i }
    else i++
  }
  return i
}

function skipQuoted(sql: string, i: number, q: string, backslash: boolean): number {
  i++
  while (i < sql.length) {
    const c = sql[i]
    if (backslash && c === '\\') i += 2
    else if (c === q) {
      if (sql[i + 1] === q) i += 2
      else return i + 1
    } else i++
  }
  return i
}

function leadingKeyword(text: string): string {
  const stripped = text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ').trimStart()
  const m = /^[A-Za-z]+/.exec(stripped)
  return m ? m[0].toUpperCase() : ''
}

function words(text: string, n: number): string[] {
  const stripped = text.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ')
  return (stripped.match(/[A-Za-z_]+/g) ?? []).slice(0, n).map(w => w.toUpperCase())
}

const TRANSACTION_CONTROL = new Set([
  'BEGIN', 'START', 'COMMIT', 'END', 'ROLLBACK', 'ABORT', 'SAVEPOINT', 'RELEASE', 'PREPARE',
])

/** True when the SQL contains a statement that starts, ends or marks a transaction. */
export function hasTransactionControl(sql: string): boolean {
  return splitStatements(sql).some(s => TRANSACTION_CONTROL.has(s.keyword))
}

/**
 * One step of a run that uses transaction control. The engine already holds a
 * transaction open for the whole run, so the learner's transaction becomes a
 * savepoint inside it: BEGIN is SAVEPOINT, COMMIT releases it, ROLLBACK rolls
 * back to it. The learner sees real transaction behaviour, and the engine's
 * own ROLLBACK still undoes everything afterwards.
 */
export type TxnStep =
  | { kind: 'learner'; sql: string; start: number }
  | { kind: 'internal'; sql: string }
  | { kind: 'error'; message: string; code: string; start: number }

const SAVEPOINT = 'sqllab_txn'

export function compileTransactions(sql: string): TxnStep[] {
  const steps: TxnStep[] = []
  let open = false
  const outside = (s: Statement, what: string) =>
    steps.push({ kind: 'error', message: `${what} can only be used in transaction blocks`, code: '25P01', start: s.start })

  for (const s of splitStatements(sql)) {
    const [first, second] = words(s.text, 2)
    const learner = () => steps.push({ kind: 'learner', sql: s.text, start: s.start })
    if (first === 'PREPARE' || ((first === 'COMMIT' || first === 'ROLLBACK') && second === 'PREPARED')) {
      steps.push({ kind: 'error', message: `${first} is managed by SQL Lab and cannot be used here.`, code: 'SQLLAB_TXN', start: s.start })
    } else if (first === 'BEGIN' || (first === 'START' && second === 'TRANSACTION')) {
      // Postgres only warns about a BEGIN inside a transaction, so this one is ignored too.
      if (!open) steps.push({ kind: 'internal', sql: `SAVEPOINT ${SAVEPOINT}` })
      open = true
    } else if (first === 'COMMIT' || first === 'END') {
      if (open) steps.push({ kind: 'internal', sql: `RELEASE SAVEPOINT ${SAVEPOINT}` })
      open = false
    } else if ((first === 'ROLLBACK' || first === 'ABORT') && second === 'TO') {
      if (open) learner()
      else outside(s, 'ROLLBACK TO SAVEPOINT')
    } else if (first === 'ROLLBACK' || first === 'ABORT') {
      if (open) steps.push({ kind: 'internal', sql: `ROLLBACK TO SAVEPOINT ${SAVEPOINT}; RELEASE SAVEPOINT ${SAVEPOINT}` })
      open = false
    } else if (first === 'SAVEPOINT' || first === 'RELEASE') {
      if (open) learner()
      else outside(s, first === 'SAVEPOINT' ? 'SAVEPOINT' : 'RELEASE SAVEPOINT')
    } else learner()
  }
  return steps
}
