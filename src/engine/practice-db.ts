import { PGlite } from '@electric-sql/pglite'
import { compileTransactions, hasTransactionControl } from './sql-scan.ts'
import { MAX_ROWS, type Cell, type CheckSpec, type ResultSet, type RunOutcome, type SqlError } from './types.ts'

// Date and time types come back as the exact text Postgres prints, so the
// learner sees `2024-03-01`, not a JavaScript Date in their local time zone.
const RAW_TEXT_TYPES = [1082, 1083, 1114, 1184, 1186, 1266]
const parsers = Object.fromEntries(RAW_TEXT_TYPES.map(t => [t, (x: string) => x]))

/**
 * An in-memory Postgres loaded with one practice dataset. Every run happens
 * inside BEGIN ... ROLLBACK, so the dataset is identical before each query
 * and data-changing exercises cannot leak into the next one.
 */
export class PracticeDb {
  private constructor(private db: PGlite) {}

  static async create(datasetSql: string): Promise<PracticeDb> {
    const db = await PGlite.create({ parsers })
    await db.exec("SET TimeZone = 'UTC'; SET DateStyle = 'ISO, YMD'; SET IntervalStyle = 'postgres';")
    await db.exec(datasetSql)
    // Planner statistics up front, so EXPLAIN shows the same estimates on every
    // run. ANALYZE writes row counts in place, outside any transaction, so a
    // learner's own ANALYZE of a dataset table would otherwise leak into later runs.
    await db.exec('ANALYZE')
    return new PracticeDb(db)
  }

  /**
   * Run learner SQL and roll it back. `snapshot` lists tables to read before the
   * rollback; `probe` is a query run after the learner's SQL, whose result is
   * what a `probe` exercise is graded on; `attempts` are statements tried one
   * by one, and their outcomes become the probe result instead.
   */
  async run(sql: string, opts: { limit?: number; snapshot?: string[]; probe?: string; attempts?: string[] } = {}): Promise<RunOutcome & { tables?: Record<string, ResultSet>; probe?: ResultSet }> {
    const limit = opts.limit ?? MAX_ROWS
    const t0 = performance.now()
    await this.db.exec('BEGIN')
    try {
      const outcome = hasTransactionControl(sql) ? await this.runSteps(sql, limit) : await this.runScript(sql, limit)
      if (!outcome.ok) return { ...outcome, ms: performance.now() - t0 }
      let tables: Record<string, ResultSet> | undefined
      if (opts.snapshot?.length) {
        tables = {}
        for (const t of opts.snapshot) tables[t] = await this.snapshot(t)
      }
      let probe: ResultSet | undefined
      if (opts.probe) {
        const r = await this.runScript(opts.probe, Number.POSITIVE_INFINITY)
        if (!r.ok) return { ...r, results: outcome.results, ms: performance.now() - t0 }
        probe = [...r.results].reverse().find(x => x.columns.length > 0)
      }
      if (opts.attempts?.length) probe = await this.attempt(opts.attempts)
      return { ok: true, results: outcome.results, tables, probe, ms: performance.now() - t0 }
    } catch (e) {
      return { ok: false, results: [], error: toSqlError(e), ms: performance.now() - t0 }
    } finally {
      await this.db.exec('ROLLBACK')
    }
  }

  private async runScript(sql: string, limit: number): Promise<{ ok: boolean; results: ResultSet[]; error?: SqlError }> {
    try {
      const raw = await this.db.exec(sql, { rowMode: 'array' })
      return { ok: true, results: raw.map(r => toResultSet(r, limit)) }
    } catch (e) {
      return { ok: false, results: [], error: toSqlError(e) }
    }
  }

  /** Statement by statement, with the learner's transaction control mapped onto savepoints. */
  private async runSteps(sql: string, limit: number): Promise<{ ok: boolean; results: ResultSet[]; error?: SqlError }> {
    const results: ResultSet[] = []
    for (const step of compileTransactions(sql)) {
      if (step.kind === 'error') {
        return { ok: false, results, error: { message: step.message, code: step.code, position: step.start + 1 } }
      }
      if (step.kind === 'internal') {
        await this.db.exec(step.sql)
        results.push({ columns: [], rows: [], affectedRows: 0, truncated: false })
        continue
      }
      try {
        const raw = await this.db.exec(step.sql, { rowMode: 'array' })
        results.push(...raw.map(r => toResultSet(r, limit)))
      } catch (e) {
        const error = toSqlError(e)
        if (error.position !== undefined) error.position += step.start
        return { ok: false, results, error }
      }
    }
    return { ok: true, results }
  }

  /** Try each statement in its own savepoint: keep it if it works, record its SQLSTATE if not. */
  private async attempt(statements: string[]): Promise<ResultSet> {
    const rows: Cell[][] = []
    for (const statement of statements) {
      await this.db.exec('SAVEPOINT sqllab_attempt')
      try {
        await this.db.exec(statement)
        await this.db.exec('RELEASE SAVEPOINT sqllab_attempt')
        rows.push([statement, 'ok'])
      } catch (e) {
        await this.db.exec('ROLLBACK TO SAVEPOINT sqllab_attempt; RELEASE SAVEPOINT sqllab_attempt')
        rows.push([statement, toSqlError(e).code ?? 'error'])
      }
    }
    return { columns: [{ name: 'statement', type: 25 }, { name: 'outcome', type: 25 }], rows, affectedRows: 0, truncated: false }
  }

  /** Every row of a table, sorted by all columns so snapshots compare as plain lists. */
  private async snapshot(table: string): Promise<ResultSet> {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`Bad table name in exercise: ${table}`)
    const cols = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    )
    const width = cols.rows[0]?.n ?? 1
    const orderBy = Array.from({ length: width }, (_, i) => i + 1).join(', ')
    const [r] = await this.db.exec(`SELECT * FROM ${table} ORDER BY ${orderBy}`, { rowMode: 'array' })
    return toResultSet(r!, Number.POSITIVE_INFINITY)
  }

  /** Run the learner's SQL and the reference solution the same way, ready for grading. */
  async runPair(learnerSql: string, solutionSql: string, check: CheckSpec) {
    const snapshot = check.mode === 'tables' ? check.tables : undefined
    const probe = check.mode === 'probe' ? check.probe : undefined
    const attempts = check.mode === 'attempts' ? check.attempts : undefined
    const opts = { limit: Number.POSITIVE_INFINITY, snapshot, probe, attempts }
    const expected = await this.run(solutionSql, opts)
    const actual = await this.run(learnerSql, opts)
    return { expected, actual }
  }

  async close() {
    await this.db.close()
  }
}

type PgResults = Awaited<ReturnType<PGlite['exec']>>[number]

function toResultSet(r: PgResults, limit: number): ResultSet {
  const rows = (r.rows as unknown as unknown[][]).map(row => row.map(toCell))
  return {
    columns: r.fields.map(f => ({ name: f.name, type: f.dataTypeID })),
    rows: rows.slice(0, limit),
    affectedRows: r.affectedRows ?? 0,
    truncated: rows.length > limit,
  }
}

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return v.toISOString()
  if (v instanceof Uint8Array) return '\\x' + Array.from(v, b => b.toString(16).padStart(2, '0')).join('')
  return JSON.stringify(v)
}

function toSqlError(e: unknown): SqlError {
  const err = e as Partial<SqlError> & { message?: string; position?: string | number }
  const position = err.position === undefined ? undefined : Number(err.position)
  return {
    message: err.message ?? String(e),
    code: err.code,
    position: Number.isFinite(position) ? position : undefined,
    hint: err.hint || undefined,
    detail: err.detail || undefined,
  }
}
