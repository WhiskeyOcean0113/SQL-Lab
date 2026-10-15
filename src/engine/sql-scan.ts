// A small lexical pass over Postgres SQL. It does not parse; it only knows
// enough about comments, strings and dollar quoting to find statement
// boundaries and each statement's leading keyword.

export interface Statement {
  /** Text of the statement without the trailing semicolon. */
  text: string
  /** First keyword, upper-cased, or '' for an empty statement. */
  keyword: string
}

export function splitStatements(sql: string): Statement[] {
  const out: Statement[] = []
  let start = 0
  let i = 0
  const n = sql.length

  const push = (end: number) => {
    const text = sql.slice(start, end)
    const keyword = leadingKeyword(text)
    if (keyword) out.push({ text: text.trim(), keyword })
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

const TRANSACTION_CONTROL = new Set([
  'BEGIN', 'START', 'COMMIT', 'END', 'ROLLBACK', 'ABORT', 'SAVEPOINT', 'RELEASE', 'PREPARE',
])

/** The engine wraps every run in its own transaction, so learners may not end it early. */
export function findTransactionControl(sql: string): Statement | undefined {
  return splitStatements(sql).find(s => TRANSACTION_CONTROL.has(s.keyword))
}
