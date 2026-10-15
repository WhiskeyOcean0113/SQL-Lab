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
  /** `result`: compare the last result set. `tables`: compare table contents after the SQL runs. */
  mode: 'result' | 'tables'
  /** Compare rows in order (the task asked for ORDER BY). */
  orderMatters: boolean
  /** Require the same column names, not just the same column count. */
  columnNames: boolean
  /** For mode `tables`: which tables to snapshot. */
  tables: string[]
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
}

export const MAX_ROWS = 500
