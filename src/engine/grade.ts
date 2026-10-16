import type { Cell, CheckSpec, Grade, Issue, ResultSet, RunOutcome } from './types.ts'

// Grading compares what the queries return, never the SQL text: the same
// result can be written many ways, and all of them are correct.

const NUMERIC_TYPES = new Set([20, 21, 23, 26, 700, 701, 1700])

function cellKey(v: Cell, type: number): string {
  if (v === null) return '\u0000NULL'
  if (NUMERIC_TYPES.has(type) || typeof v === 'number') {
    const n = Number(v)
    // numeric(6,2) prints 12.50 and avg() prints 12.5000000000000000; both are 12.5.
    if (Number.isFinite(n)) return 'n:' + Number(n.toPrecision(12)).toString()
  }
  return 's:' + String(v)
}

function rowKeys(rs: ResultSet): string[] {
  return rs.rows.map(row => JSON.stringify(row.map((v, i) => cellKey(v, rs.columns[i]?.type ?? 25))))
}

/** Multiset difference: which rows on each side have no partner on the other. */
function diffRows(expected: ResultSet, actual: ResultSet) {
  const ek = rowKeys(expected)
  const ak = rowKeys(actual)
  const pool = new Map<string, number[]>()
  ek.forEach((k, i) => pool.set(k, [...(pool.get(k) ?? []), i]))
  const extra: number[] = []
  ak.forEach((k, i) => {
    const slots = pool.get(k)
    if (slots?.length) slots.shift()
    else extra.push(i)
  })
  const missing = [...pool.values()].flat().sort((a, b) => a - b)
  return { ek, ak, missing, extra }
}

function sameNames(a: ResultSet, b: ResultSet) {
  return a.columns.every((c, i) => c.name.toLowerCase() === b.columns[i]?.name.toLowerCase())
}

/** The result a query exercise is judged on: the last statement that returned columns. */
export function finalResult(run: RunOutcome): ResultSet | undefined {
  return [...run.results].reverse().find(r => r.columns.length > 0)
}

export function compareResultSets(expected: ResultSet, actual: ResultSet, check: Pick<CheckSpec, 'orderMatters' | 'columnNames'>): Grade {
  const base = { expected, actual, missing: [] as number[], extra: [] as number[] }
  const issues: Issue[] = []

  if (expected.columns.length !== actual.columns.length) {
    issues.push({ code: 'column-count', data: { expected: expected.columns.length, actual: actual.columns.length } })
    return { ...base, correct: false, issues }
  }

  const expectedNames = expected.columns.map(c => c.name.toLowerCase())
  const actualNames = actual.columns.map(c => c.name.toLowerCase())
  if (!sameNames(expected, actual)) {
    const permuted = [...expectedNames].sort().join() === [...actualNames].sort().join()
    if (permuted) {
      issues.push({ code: 'column-order', data: { expected: expectedNames.join(', ') } })
      return { ...base, correct: false, issues }
    }
    if (check.columnNames) {
      issues.push({ code: 'column-names', data: { expected: expectedNames.join(', '), actual: actualNames.join(', ') } })
    }
  }

  const { ek, ak, missing, extra } = diffRows(expected, actual)

  if (missing.length || extra.length) {
    const distinct = (keys: string[]) => [...new Set(keys)].sort().join('|')
    if (distinct(ek) === distinct(ak)) issues.push({ code: 'duplicates' })
    else if (expected.rows.length > 0 && actual.rows.length >= expected.rows.length * 2 && actual.rows.length - expected.rows.length >= 4) {
      issues.push({ code: 'row-explosion', data: { expected: expected.rows.length, actual: actual.rows.length } })
    }
    if (expected.rows.length !== actual.rows.length) {
      issues.push({ code: 'row-count', data: { expected: expected.rows.length, actual: actual.rows.length } })
    }
    issues.push({ code: 'rows-differ', data: { missing: missing.length, extra: extra.length } })
  } else if (check.orderMatters && ek.some((k, i) => k !== ak[i])) {
    issues.push({ code: 'order' })
  }

  return { ...base, missing, extra, correct: issues.length === 0, issues }
}

export function gradeRuns(
  expected: RunOutcome & { tables?: Record<string, ResultSet>; probe?: ResultSet },
  actual: RunOutcome & { tables?: Record<string, ResultSet>; probe?: ResultSet },
  check: CheckSpec,
): Grade {
  if (!expected.ok) throw new Error(`Reference solution failed: ${expected.error?.message}`)
  if (!actual.ok) {
    return { correct: false, issues: [{ code: 'sql-error' }], error: actual.error, missing: [], extra: [] }
  }

  if (check.mode === 'tables') {
    for (const table of check.tables) {
      const e = expected.tables?.[table]
      const a = actual.tables?.[table]
      if (!e || !a) throw new Error(`Missing snapshot for table ${table}`)
      const g = compareResultSets(e, a, { orderMatters: false, columnNames: true })
      if (!g.correct) return { ...g, issues: [{ code: 'tables-differ', data: { table } }, ...g.issues] }
    }
    return { correct: true, issues: [], missing: [], extra: [] }
  }

  if (check.mode === 'probe') {
    if (!expected.probe || !actual.probe) throw new Error('The probe query returned no result set')
    const g = compareResultSets(expected.probe, actual.probe, { orderMatters: check.orderMatters, columnNames: false })
    return g.correct ? g : { ...g, issues: [{ code: 'probe-differs' }, ...g.issues] }
  }

  const e = finalResult(expected)
  if (!e) throw new Error('Reference solution returned no result set')
  const a = finalResult(actual)
  if (!a) return { correct: false, issues: [{ code: 'no-result' }], expected: e, missing: [], extra: [] }
  return compareResultSets(e, a, check)
}
