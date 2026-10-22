// Shared shapes for running SQL and grading it. Used by the browser worker,
// the Node validate script and the tests, so nothing here may touch the DOM.

export interface Column {
  name: string
  /** Postgres type OID, e.g. 23 = int4, 1700 = numeric, 25 = text. */
  type: number
}

/** One statement's output. `rows` is row-major and keeps duplicate column names. */
export interface ResultSet {
  columns: Column[]
  rows: Cell[][]
  /** Rows touched by INSERT / UPDATE / DELETE; 0 for SELECT. */
  affectedRows: number
  /** True when rows were cut off at MAX_ROWS for display. */
  truncated: boolean
}

export type Cell = string | number | boolean | null

export interface SqlError {
  message: string
  /** SQLSTATE, e.g. 42803 = grouping error, 42P01 = undefined table. */
  code?: string
  /** 1-based character offset into the submitted SQL. */
  position?: number
  hint?: string
  detail?: string
}

export interface RunOutcome {
  ok: boolean
  /** One entry per statement that ran, in order. */
  results: ResultSet[]
  error?: SqlError
  ms: number
}

/** How an exercise decides correctness. */
export interface CheckSpec {
  /**
   * `result`: compare the last result set. `tables`: compare table contents
   * after the SQL runs. `probe`: run `probe` after the SQL and compare its
   * result, for changes a table snapshot cannot see (new tables, views, indexes).
   * `attempts`: try each statement in `attempts` after the SQL and compare
   * which are accepted and which rejected, to grade constraints by behaviour.
   */
  mode: 'result' | 'tables' | 'probe' | 'attempts'
  /** Compare rows in order (the task asked for ORDER BY). */
  orderMatters: boolean
  /** Require the same column names, not just the same column count. */
  columnNames: boolean
  /** For mode `tables`: which tables to snapshot. */
  tables: string[]
  /** For mode `probe`: the query that inspects the database afterwards. */
  probe?: string
  /** For mode `attempts`: statements tried one by one; each is kept if it succeeds. */
  attempts?: string[]
}

export type IssueCode =
  | 'sql-error'
  | 'no-result'
  | 'column-count'
  | 'column-names'
  | 'column-order'
  | 'row-count'
  | 'rows-differ'
  | 'order'
  | 'duplicates'
  | 'row-explosion'
  | 'tables-differ'
  | 'probe-differs'
  | 'attempts-differ'

export interface Issue {
  code: IssueCode
  /** Values the UI interpolates into the localized message. */
  data?: Record<string, string | number>
}

export interface Grade {
  correct: boolean
  issues: Issue[]
  expected?: ResultSet
  actual?: ResultSet
  /** Indexes into expected.rows that the learner's result lacks. */
  missing: number[]
  /** Indexes into actual.rows that the expected result lacks. */
  extra: number[]
  error?: SqlError
  /**
   * Set only on a wrong answer: the index of the first trap (a known wrong
   * query) whose result the learner's matches, i.e. the learner would pass if
   * that trap were the reference.
   */
  trap?: number
}

export const MAX_ROWS = 500
