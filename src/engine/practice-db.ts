import { PGlite } from '@electric-sql/pglite'
import { findTransactionControl } from './sql-scan.ts'
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
    return new PracticeDb(db)
  }

  /** Run learner SQL and roll it back. `snapshot` lists tables to read before the rollback. */
  async run(sql: string, opts: { limit?: number; snapshot?: string[] } = {}): Promise<RunOutcome & { tables?: Record<string, ResultSet> }> {
    const limit = opts.limit ?? MAX_ROWS
    const t0 = performance.now()
    const control = findTransactionControl(sql)
    if (control) {
      return {
        ok: false,
        results: [],
        ms: 0,
        error: { message: `Transaction control (${control.keyword}) is managed by SQL Lab and cannot be used here.`, code: 'SQLLAB_TXN' },
      }
    }

    await this.db.exec('BEGIN')
    try {
      const raw = await this.db.exec(sql, { rowMode: 'array' })
      const results = raw.map(r => toResultSet(r, limit))
      let tables: Record<string, ResultSet> | undefined
      if (opts.snapshot?.length) {
        tables = {}
        for (const t of opts.snapshot) tables[t] = await this.snapshot(t)
      }
      return { ok: true, results, tables, ms: performance.now() - t0 }
    } catch (e) {
      return { ok: false, results: [], error: toSqlError(e), ms: performance.now() - t0 }
    } finally {
      await this.db.exec('ROLLBACK')
    }
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
    const opts = { limit: Number.POSITIVE_INFINITY, snapshot }
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
